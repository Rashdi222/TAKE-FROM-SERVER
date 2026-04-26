defmodule Back.Providers.SportmonksDetailRefresher do
  @moduledoc false

  use GenServer

  import Ecto.Query

  require Logger

  alias Back.Betting
  alias Back.Betting.Match
  alias Back.Betting.Odds
  alias Back.Live.LangGraphClient
  alias Back.MultiSource.Schemas.CanonicalMatch
  alias Back.MultiSource.Schemas.SourceMatchMapping
  alias Back.Providers
  alias Back.Providers.CacheMirror
  alias Back.Providers.CompetitionFeed
  alias Back.Providers.Provider
  alias Back.Providers.Sportmonks
  alias Back.Providers.SportmonksLiveIndex
  alias Back.Repo
  alias BackWeb.MatchChannel

  @table :sportmonks_detail_refresh
  @meta_key :"$meta"
  @redis_fixture_prefix "provider_cache:sportmonks_detail_refresh:fixture:"
  @redis_meta_key "provider_cache:sportmonks_detail_refresh:meta"
  @default_refresh_interval_ms 5_000
  @hot_ttl_ms 5_000
  @bootstrap_ttl_ms 5_000
  @warm_ttl_ms 15_000
  # Budget: 3000 req/hour. LiveIndex uses ~720/hour. Remaining ~2280/hour = ~38/min = ~3/tick at 5s.
  # Override via env SPORTMONKS_DETAIL_REFRESH_MAX_TARGETS_PER_TICK for higher-tier plans.
  @max_targets_per_tick 3
  @max_concurrency 2
  @unchanged_cooldown_multiplier 2
  @max_cooldown_ms 60_000
  @state_ttl_ms 24 * 60 * 60 * 1000

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, Keyword.put_new(opts, :name, __MODULE__))
  end

  def refresh_now do
    GenServer.call(__MODULE__, :refresh_now, 30_000)
  end

  def summary do
    ensure_table()

    meta = current_meta()

    Map.merge(
      %{
        tracked_match_count: tracked_match_count(),
        last_refresh_at: nil,
        last_successful_refresh_at: nil,
        last_error: nil,
        refreshed_count: 0,
        unchanged_count: 0,
        skipped_count: 0,
        failed_count: 0,
        due_count: 0,
        selected_count: 0,
        throttled_count: 0,
        hot_target_count: 0,
        warm_target_count: 0,
        cooldown_suppressed_count: 0,
        max_targets_per_tick: configured_max_targets_per_tick(),
        max_concurrency: configured_max_concurrency()
      },
      meta |> Map.put(:tracked_match_count, tracked_match_count())
    )
  end

  def summary_for_feed(%CompetitionFeed{} = feed) do
    ensure_table()

    entries = tracked_entries()

    %{
      tracked_match_count: Enum.count(entries, &(&1.feed_id == feed.id)),
      refreshed_count:
        Enum.count(entries, &(&1.feed_id == feed.id and &1.last_status == "refreshed")),
      unchanged_count:
        Enum.count(entries, &(&1.feed_id == feed.id and &1.last_status == "unchanged")),
      failed_count: Enum.count(entries, &(&1.feed_id == feed.id and &1.last_status == "failed")),
      cooldown_suppressed_count:
        Enum.count(entries, &(&1.feed_id == feed.id and &1.last_status == "cooldown_suppressed")),
      hot_target_count:
        Enum.count(entries, &(&1.feed_id == feed.id and (&1.ttl_class || "warm") == "hot")),
      warm_target_count:
        Enum.count(entries, &(&1.feed_id == feed.id and (&1.ttl_class || "warm") == "warm")),
      last_refresh_at: current_meta()[:last_refresh_at],
      last_successful_refresh_at: current_meta()[:last_successful_refresh_at],
      due_count: current_meta()[:due_count] || 0,
      selected_count: current_meta()[:selected_count] || 0,
      throttled_count: current_meta()[:throttled_count] || 0
    }
  end

  def refresh_once(fetch_detail_fun \\ &default_fetch_detail/2, opts \\ [])
      when is_function(fetch_detail_fun, 2) do
    ensure_table()
    started_at_ms = Keyword.get(opts, :now_ms, System.system_time(:millisecond))
    now = DateTime.from_unix!(div(started_at_ms, 1_000), :second)
    max_targets_per_tick = Keyword.get(opts, :limit, configured_max_targets_per_tick())
    max_concurrency = Keyword.get(opts, :max_concurrency, configured_max_concurrency())
    put_meta(%{last_refresh_at: DateTime.to_iso8601(now)})

    with {:ok, provider} <- Providers.get_enabled_provider_by_name("sportmonks") do
      %{selected_targets: targets, due_count: due_count, throttled_count: throttled_count} =
        select_targets(max_targets_per_tick, started_at_ms)

      result =
        targets
        |> Task.async_stream(
          fn target -> refresh_target(target, provider, fetch_detail_fun, started_at_ms) end,
          ordered: false,
          timeout: 15_000,
          max_concurrency: max(1, max_concurrency),
          on_timeout: :kill_task
        )
        |> Enum.reduce(
          %{
            evaluated: due_count,
            selected: length(targets),
            throttled: throttled_count,
            refreshed: 0,
            unchanged: 0,
            skipped: 0,
            failed: 0,
            hot: Enum.count(targets, &((&1.ttl_class || "warm") == "hot")),
            warm: Enum.count(targets, &((&1.ttl_class || "warm") == "warm")),
            cooldown_suppressed: 0
          },
          fn
            {:ok, {:ok, :refreshed}}, acc ->
              %{acc | refreshed: acc.refreshed + 1}

            {:ok, {:ok, :unchanged}}, acc ->
              %{acc | unchanged: acc.unchanged + 1}

            {:ok, {:ok, :skipped}}, acc ->
              %{acc | skipped: acc.skipped + 1}

            {:ok, {:ok, :cooldown_suppressed}}, acc ->
              %{acc | skipped: acc.skipped + 1, cooldown_suppressed: acc.cooldown_suppressed + 1}

            {:ok, {:error, _reason}}, acc ->
              %{acc | failed: acc.failed + 1}

            {:exit, reason}, acc ->
              Logger.warning("[SPORTMONKS_DETAIL_REFRESH] target task exited #{inspect(reason)}")
              %{acc | failed: acc.failed + 1}
          end
        )

      duration_ms = System.system_time(:millisecond) - started_at_ms

      put_meta(%{
        last_successful_refresh_at: DateTime.to_iso8601(now),
        last_error: nil,
        refreshed_count: result.refreshed,
        unchanged_count: result.unchanged,
        skipped_count: result.skipped,
        failed_count: result.failed,
        due_count: result.evaluated,
        selected_count: result.selected,
        throttled_count: result.throttled,
        hot_target_count: result.hot,
        warm_target_count: result.warm,
        cooldown_suppressed_count: result.cooldown_suppressed,
        last_duration_ms: duration_ms,
        max_targets_per_tick: max_targets_per_tick,
        max_concurrency: max_concurrency
      })

      _ =
        Providers.log_sync_result(%{
          provider_id: provider.id,
          sync_type: "scheduled",
          status: :success,
          duration_ms: duration_ms,
          metadata: %{
            "kind" => "live_targeted_detail_refresh",
            "source" => "sportmonks_fixture_detail",
            "evaluated" => result.evaluated,
            "selected" => result.selected,
            "throttled" => result.throttled,
            "refreshed" => result.refreshed,
            "unchanged" => result.unchanged,
            "skipped" => result.skipped,
            "failed" => result.failed,
            "hot" => result.hot,
            "warm" => result.warm,
            "cooldown_suppressed" => result.cooldown_suppressed
          }
        })

      {:ok, result}
    else
      {:error, reason} = error ->
        put_meta(%{last_error: inspect(reason)})

        if reason != :provider_not_found do
          Logger.warning("[SPORTMONKS_DETAIL_REFRESH] refresh failed #{inspect(reason)}")
        end

        error
    end
  end

  @impl true
  def init(opts) do
    ensure_table()

    state = %{
      refresh_interval_ms:
        Keyword.get(
          opts,
          :refresh_interval_ms,
          Application.get_env(
            :back,
            :sportmonks_detail_refresh_interval_ms,
            @default_refresh_interval_ms
          )
        )
    }

    Process.send_after(self(), :refresh, 0)
    {:ok, state}
  end

  @impl true
  def handle_info(:refresh, state) do
    _ = refresh_once(&default_fetch_detail/2)
    Process.send_after(self(), :refresh, state.refresh_interval_ms)
    {:noreply, state}
  end

  @impl true
  def handle_call(:refresh_now, _from, state) do
    {:reply, refresh_once(&default_fetch_detail/2), state}
  end

  defp select_targets(limit, now_ms) do
    matches =
      Match
      |> join(:inner, [m], feed in CompetitionFeed, on: feed.id == m.competition_feed_id)
      |> join(:inner, [_m, feed], provider in Provider, on: provider.id == feed.provider_id)
      |> where(
        [m, feed, provider],
        m.provider == "sportmonks" and m.sport == :cricket and m.status == :live
      )
      |> where(
        [_m, feed, provider],
        feed.enabled == true and feed.sport == "cricket" and provider.name == "sportmonks"
      )
      |> select([m, feed, _provider], %{match: m, feed: feed})
      |> Repo.all()
      |> Enum.filter(fn %{match: match} ->
        SportmonksLiveIndex.fresh_fixture?(match.external_id || "")
      end)

    one_x_bet_mapping_index = load_one_x_bet_mapping_index(matches)
    published_platform_odds_match_ids = load_published_platform_odds_match_ids(matches)

    due_targets =
      matches
      |> Enum.map(
        &attach_priority(
          &1,
          now_ms,
          one_x_bet_mapping_index,
          published_platform_odds_match_ids
        )
      )
      |> Enum.filter(&due_for_refresh?(&1, now_ms))
      |> Enum.sort_by(fn target ->
        {-target.priority, target.next_due_at_ms,
         target.match.updated_at || ~U[1970-01-01 00:00:00Z]}
      end)

    %{
      selected_targets: Enum.take(due_targets, limit),
      due_count: length(due_targets),
      throttled_count: max(length(due_targets) - limit, 0)
    }
  end

  defp attach_priority(
         %{match: match, feed: feed} = row,
         now_ms,
         one_x_bet_mapping_index,
         published_platform_odds_match_ids
       ) do
    published_platform_odds? = MapSet.member?(published_platform_odds_match_ids, match.id)
    bootstrap_needed? = not published_platform_odds?

    degraded? =
      match.suspension_reason in [
        "provider_disconnect",
        "ai_engine_unavailable",
        "bootstrap_recovery",
        "live_bootstrap"
      ]

    in_play? = match.in_play_enabled == true
    one_x_bet_mapped? = Map.has_key?(one_x_bet_mapping_index, match.id)

    priority =
      0 +
        if(bootstrap_needed?, do: 220, else: 0) +
        if(published_platform_odds?, do: 100, else: 0) +
        if(degraded?, do: 80, else: 0) +
        if(one_x_bet_mapped?, do: 70, else: 0) +
        if(feed.generate_platform_odds, do: 50, else: 0) +
        if(in_play?, do: 20, else: 0)

    {ttl_class, ttl_ms} =
      cond do
        bootstrap_needed? -> {"hot", @bootstrap_ttl_ms}
        published_platform_odds? or degraded? or one_x_bet_mapped? -> {"hot", @hot_ttl_ms}
        true -> {"warm", @warm_ttl_ms}
      end

    detail_state = detail_state_for(match.external_id || "")

    next_due_at_ms =
      max(
        (detail_state[:last_refreshed_at_ms] || 0) + ttl_ms,
        detail_state[:cooldown_until_ms] || 0
      )

    Map.merge(row, %{
      priority: priority,
      ttl_ms: ttl_ms,
      ttl_class: ttl_class,
      next_due_at_ms: next_due_at_ms,
      published_platform_odds?: published_platform_odds?,
      bootstrap_needed?: bootstrap_needed?,
      degraded?: degraded?,
      one_x_bet_mapped?: one_x_bet_mapped?,
      now_ms: now_ms
    })
  end

  defp due_for_refresh?(target, now_ms), do: target.next_due_at_ms <= now_ms

  defp refresh_target(target, provider, fetch_detail_fun, now_ms) do
    fixture_id = target.match.external_id
    detail_state = detail_state_for(fixture_id)

    if (detail_state[:cooldown_until_ms] || 0) > now_ms do
      put_detail_state(fixture_id, %{
        match_id: target.match.id,
        feed_id: target.feed.id,
        last_status: "cooldown_suppressed",
        priority: target.priority,
        ttl_ms: target.ttl_ms,
        ttl_class: target.ttl_class
      })

      {:ok, :cooldown_suppressed}
    else
      do_refresh_target(target, provider, fetch_detail_fun, now_ms, detail_state)
    end
  end

  defp do_refresh_target(target, provider, fetch_detail_fun, now_ms, detail_state) do
    fixture_id = target.match.external_id
    placeholder_match? = placeholder_match_names?(target.match)

    case fetch_detail_fun.(Providers.provider_adapter_config(provider), fixture_id) do
      {:ok, detail} when is_map(detail) ->
        fingerprint = detail_fingerprint(detail)

        if fingerprint == detail_state[:last_fingerprint] and not placeholder_match? do
          maybe_force_bootstrap_reprice(target)

          unchanged_streak = (detail_state[:unchanged_streak] || 0) + 1

          cooldown_until_ms =
            now_ms +
              min(
                round(
                  target.ttl_ms *
                    :math.pow(configured_unchanged_cooldown_multiplier(), unchanged_streak)
                ),
                configured_max_cooldown_ms()
              )

          put_detail_state(fixture_id, %{
            match_id: target.match.id,
            feed_id: target.feed.id,
            last_refreshed_at_ms: now_ms,
            last_changed_at_ms: detail_state[:last_changed_at_ms],
            last_fingerprint: fingerprint,
            last_status: "unchanged",
            priority: target.priority,
            ttl_ms: target.ttl_ms,
            ttl_class: target.ttl_class,
            unchanged_streak: unchanged_streak,
            cooldown_until_ms: cooldown_until_ms,
            one_x_bet_mapped?: target.one_x_bet_mapped?
          })

          {:ok, :unchanged}
        else
          attrs =
            Sportmonks.normalize(detail)
            |> Map.put(:provider, "sportmonks")
            |> decorate_targeted_detail(target.feed)

          case Betting.upsert_external_match(attrs) do
            {:ok, updated_match} ->
              broadcast_update(updated_match, attrs)

              put_detail_state(fixture_id, %{
                match_id: target.match.id,
                feed_id: target.feed.id,
                last_refreshed_at_ms: now_ms,
                last_changed_at_ms: now_ms,
                last_fingerprint: fingerprint,
                last_status: "refreshed",
                priority: target.priority,
                ttl_ms: target.ttl_ms,
                ttl_class: target.ttl_class,
                unchanged_streak: 0,
                cooldown_until_ms: nil,
                last_error: nil,
                one_x_bet_mapped?: target.one_x_bet_mapped?
              })

              maybe_force_bootstrap_reprice(target)
              {:ok, :refreshed}

            {:error, reason} = error ->
              put_detail_state(fixture_id, %{
                match_id: target.match.id,
                feed_id: target.feed.id,
                last_refreshed_at_ms: now_ms,
                last_changed_at_ms: detail_state[:last_changed_at_ms],
                last_fingerprint: detail_state[:last_fingerprint],
                last_status: "failed",
                last_error: inspect(reason),
                priority: target.priority,
                ttl_ms: target.ttl_ms,
                ttl_class: target.ttl_class,
                cooldown_until_ms: detail_state[:cooldown_until_ms],
                unchanged_streak: detail_state[:unchanged_streak] || 0,
                one_x_bet_mapped?: target.one_x_bet_mapped?
              })

              error
          end
        end

      {:error, reason} = error ->
        put_detail_state(fixture_id, %{
          match_id: target.match.id,
          feed_id: target.feed.id,
          last_refreshed_at_ms: now_ms,
          last_changed_at_ms: detail_state[:last_changed_at_ms],
          last_fingerprint: detail_state[:last_fingerprint],
          last_status: "failed",
          last_error: inspect(reason),
          priority: target.priority,
          ttl_ms: target.ttl_ms,
          ttl_class: target.ttl_class,
          cooldown_until_ms: detail_state[:cooldown_until_ms],
          unchanged_streak: detail_state[:unchanged_streak] || 0,
          one_x_bet_mapped?: target.one_x_bet_mapped?
        })

        error

      _ ->
        {:ok, :skipped}
    end
  end

  defp placeholder_match_names?(%Match{} = match) do
    placeholder_name?(match.team1) or placeholder_name?(match.team2)
  end

  defp placeholder_name?(value) when is_binary(value) do
    value
    |> String.trim()
    |> String.downcase()
    |> then(&(&1 in ["", "team 1", "team 2", "unknown team"]))
  end

  defp placeholder_name?(_), do: true

  defp broadcast_update(match, attrs) do
    MatchChannel.broadcast_status_change(match.id, match.status)

    BackWeb.Endpoint.broadcast("match:#{match.id}", "score_updated", %{
      match_id: match.id,
      score: Map.get(attrs, :score, %{}),
      status: match.status
    })

    MatchChannel.broadcast_match_state_updated(match, %{
      "kind" => "sportmonks_targeted_detail_refresh"
    })
  end

  defp decorate_targeted_detail(attrs, feed) do
    raw =
      (attrs[:raw] || %{})
      |> Map.put("_competition_feed", %{
        "id" => feed.id,
        "competition_key" => feed.competition_key
      })

    Map.put(attrs, :raw, raw) |> Map.put(:competition_feed_id, feed.id)
  end

  defp default_fetch_detail(config, fixture_id) do
    Sportmonks.fetch_fixture_detail_for_fixture(config, fixture_id)
  end

  defp load_one_x_bet_mapping_index(rows) when is_list(rows) do
    match_ids = Enum.map(rows, & &1.match.id)

    if match_ids == [] do
      %{}
    else
      from(imported in Match,
        join: canonical in CanonicalMatch,
        on:
          canonical.anchor_source_name == imported.provider and
            canonical.anchor_source_match_id == imported.external_id,
        join: mapping in SourceMatchMapping,
        on:
          mapping.canonical_match_id == canonical.id and
            mapping.source_name == "one_x_bet_worker",
        where: imported.id in ^match_ids,
        select: {imported.id, mapping.source_match_id}
      )
      |> Repo.all()
      |> Map.new(fn {match_id, source_match_id} -> {match_id, source_match_id} end)
    end
  end

  defp load_published_platform_odds_match_ids(rows) when is_list(rows) do
    match_ids = rows |> Enum.map(& &1.match.id) |> Enum.uniq()

    if match_ids == [] do
      MapSet.new()
    else
      from(o in Odds,
        where:
          o.match_id in ^match_ids and o.is_active == true and o.visibility_status == :published and
            o.source_type == "platform",
        select: o.match_id,
        distinct: true
      )
      |> Repo.all()
      |> MapSet.new()
    end
  end

  defp maybe_force_bootstrap_reprice(%{bootstrap_needed?: true, match: match}) do
    LangGraphClient.force_reprice_async(match,
      reason: :bootstrap_recovery,
      event_type: "bootstrap_recovery",
      suspend_reason: "live_bootstrap",
      trigger: "sportmonks_targeted_detail_refresh_bootstrap"
    )
  end

  defp maybe_force_bootstrap_reprice(_target), do: :ok

  defp detail_fingerprint(detail) do
    %{
      status: detail["status"],
      runs: detail["runs"],
      balls: detail["balls"],
      batting: detail["batting"],
      bowling: detail["bowling"],
      scoreboards: detail["scoreboards"]
    }
    |> Jason.encode!()
    |> then(&:crypto.hash(:sha256, &1))
    |> Base.encode16(case: :lower)
  end

  defp ensure_table do
    case :ets.whereis(@table) do
      :undefined -> :ets.new(@table, [:named_table, :public, :set, read_concurrency: true])
      _ -> @table
    end
  end

  defp current_meta do
    case :ets.lookup(@table, @meta_key) do
      [{@meta_key, meta}] when is_map(meta) ->
        normalize_meta_keys(meta)

      _ ->
        case CacheMirror.get_json(@redis_meta_key) do
          {:ok, meta} when is_map(meta) ->
            normalized = normalize_meta_keys(meta)
            :ets.insert(@table, {@meta_key, normalized})
            normalized

          _ ->
            %{}
        end
    end
  end

  defp put_meta(attrs) when is_map(attrs) do
    meta = Map.merge(current_meta(), attrs)
    :ets.insert(@table, {@meta_key, meta})
    _ = CacheMirror.put_json(@redis_meta_key, meta, @state_ttl_ms)
    meta
  end

  defp detail_state_for(fixture_id) do
    case :ets.lookup(@table, fixture_id) do
      [{^fixture_id, state}] when is_map(state) ->
        state

      _ ->
        case CacheMirror.get_json(redis_fixture_key(fixture_id)) do
          {:ok, state} when is_map(state) ->
            :ets.insert(@table, {fixture_id, state})
            state

          _ ->
            %{}
        end
    end
  end

  defp put_detail_state(fixture_id, attrs) when is_binary(fixture_id) and is_map(attrs) do
    next_state = Map.merge(detail_state_for(fixture_id), attrs)
    :ets.insert(@table, {fixture_id, next_state})
    _ = CacheMirror.put_json(redis_fixture_key(fixture_id), next_state, @state_ttl_ms)
  end

  defp tracked_entries do
    :ets.tab2list(@table)
    |> Enum.flat_map(fn
      {@meta_key, _meta} -> []
      {fixture_id, state} when is_binary(fixture_id) and is_map(state) -> [state]
      _ -> []
    end)
  end

  defp tracked_match_count, do: length(tracked_entries())

  defp configured_max_targets_per_tick do
    Application.get_env(
      :back,
      :sportmonks_detail_refresh_max_targets_per_tick,
      @max_targets_per_tick
    )
  end

  defp configured_max_concurrency do
    Application.get_env(:back, :sportmonks_detail_refresh_max_concurrency, @max_concurrency)
  end

  defp configured_unchanged_cooldown_multiplier do
    Application.get_env(
      :back,
      :sportmonks_detail_refresh_unchanged_cooldown_multiplier,
      @unchanged_cooldown_multiplier
    )
  end

  defp configured_max_cooldown_ms do
    Application.get_env(:back, :sportmonks_detail_refresh_max_cooldown_ms, @max_cooldown_ms)
  end

  defp redis_fixture_key(fixture_id), do: @redis_fixture_prefix <> fixture_id

  defp normalize_meta_keys(meta) when is_map(meta) do
    Enum.reduce(meta, %{}, fn
      {key, value}, acc when is_atom(key) ->
        Map.put(acc, key, value)

      {key, value}, acc when is_binary(key) ->
        atom_key =
          case key do
            "cooldown_suppressed_count" -> :cooldown_suppressed_count
            "due_count" -> :due_count
            "failed_count" -> :failed_count
            "hot_target_count" -> :hot_target_count
            "last_duration_ms" -> :last_duration_ms
            "last_error" -> :last_error
            "last_refresh_at" -> :last_refresh_at
            "last_successful_refresh_at" -> :last_successful_refresh_at
            "provider_id" -> :provider_id
            "refreshed_count" -> :refreshed_count
            "selected_count" -> :selected_count
            "throttled_count" -> :throttled_count
            "tracked_match_count" -> :tracked_match_count
            "unchanged_count" -> :unchanged_count
            "warm_target_count" -> :warm_target_count
            _ -> nil
          end

        if atom_key, do: Map.put(acc, atom_key, value), else: acc
    end)
  end
end
