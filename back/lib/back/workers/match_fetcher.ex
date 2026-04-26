defmodule Back.Workers.MatchFetcher do
  use GenServer

  import Ecto.Query

  require Logger

  alias Back.Betting
  alias Back.Betting.Match
  alias Back.Football.ApiSports.Enrichment, as: FootballEnrichment
  alias Back.Live.LangGraphClient
  alias Back.Providers
  alias Back.Providers.Dispatcher
  alias Back.Repo
  alias Back.State.MarketManager
  alias BackWeb.MatchChannel

  @table :live_match_cache
  @live_interval_ms 4_000
  @fixtures_interval_ms :timer.minutes(5)
  @live_cache_ttl_ms 4_000
  @competition_live_interval_ms 15_000
  @competition_fixtures_interval_ms :timer.minutes(5)
  @cricket_live_bootstrap_throttle_ms 12_000

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, %{}, Keyword.put_new(opts, :name, __MODULE__))
  end

  def sync_now do
    GenServer.call(__MODULE__, :sync_now, 30_000)
  end

  @impl true
  def init(state) do
    ensure_ets()
    Process.send_after(self(), :poll_live, 1_000)
    Process.send_after(self(), :poll_fixtures, 2_000)
    Process.send_after(self(), :poll_competition_live, 3_000)
    Process.send_after(self(), :poll_competition_fixtures, 4_000)
    {:ok, state}
  end

  @impl true
  def handle_info(:poll_live, state) do
    maybe_sync_live("scheduled")
    reconcile_kickoff_statuses()
    Process.send_after(self(), :poll_live, @live_interval_ms)
    {:noreply, state}
  end

  @impl true
  def handle_info(:poll_fixtures, state) do
    sync_fixtures("scheduled")
    Process.send_after(self(), :poll_fixtures, @fixtures_interval_ms)
    {:noreply, state}
  end

  @impl true
  def handle_info(:poll_competition_live, state) do
    _ = Providers.sync_due_competition_feeds(:live, :scheduled)
    reconcile_kickoff_statuses()
    Process.send_after(self(), :poll_competition_live, @competition_live_interval_ms)
    {:noreply, state}
  end

  @impl true
  def handle_info(:poll_competition_fixtures, state) do
    _ = Providers.sync_due_competition_feeds(:fixtures, :scheduled)
    Process.send_after(self(), :poll_competition_fixtures, @competition_fixtures_interval_ms)
    {:noreply, state}
  end

  @impl true
  def handle_call(:sync_now, _from, state) do
    live = maybe_sync_live("manual")
    fixtures = sync_fixtures("manual")
    competition_live = Providers.sync_due_competition_feeds(:live, :manual)
    competition_fixtures = Providers.sync_due_competition_feeds(:fixtures, :manual)
    promoted = reconcile_kickoff_statuses()

    {:reply,
     %{
       live: normalize_sync_reply(live),
       fixtures: normalize_sync_reply(fixtures),
       competition_live: normalize_sync_reply(competition_live),
       competition_fixtures: normalize_sync_reply(competition_fixtures),
       kickoff_promotions: promoted
     }, state}
  end

  defp maybe_sync_live(sync_type) do
    if fresh_live_cache?() do
      {:ok, :cache_fresh}
    else
      execute_sync(:live, sync_type)
    end
  end

  defp sync_fixtures(sync_type) do
    execute_sync(:fixtures, sync_type)
  end

  defp execute_sync(kind, sync_type) do
    started = now_ms()

    providers = Providers.list_ready_providers()

    if providers == [] do
      {:error, :no_active_provider}
    else
      results =
        Enum.map(providers, fn provider ->
          if skip_generic_sync?(provider) do
            {:ok,
             %{
               skipped: true,
               provider_id: provider.id,
               provider_name: provider.name,
               reason: "generic provider sync disabled; use competition feeds for this provider"
             }}
          else
            fetch_result =
              case kind do
                :live -> Dispatcher.fetch_live(provider)
                :fixtures -> Dispatcher.fetch_fixtures(provider)
              end

            case fetch_result do
              {:ok, matches, provider} ->
                %{updated_count: updated_count, per_sport: per_sport} =
                  upsert_many(matches, provider.name, kind)

                duration = now_ms() - started

                _ =
                  Providers.log_sync_result(%{
                    provider_id: provider.id,
                    sync_type: sync_type,
                    status: :success,
                    duration_ms: duration,
                    metadata: %{
                      "kind" => to_string(kind),
                      "updated_count" => updated_count,
                      "per_sport" => per_sport
                    }
                  })

                {:ok,
                 %{
                   provider_id: provider.id,
                   provider_name: provider.name,
                   updated_count: updated_count,
                   per_sport: per_sport,
                   duration_ms: duration
                 }}

              {:error, reason} ->
                duration = now_ms() - started
                maybe_log_failed_sync(provider, sync_type, kind, reason, duration)

                {:error,
                 %{provider_id: provider.id, provider_name: provider.name, reason: reason}}
            end
          end
        end)

      if kind == :live, do: write_meta(:live_fetched_at, now_ms())

      summarize_sync_results(results)
    end
  end

  defp normalize_sync_reply({:ok, result}), do: %{status: "ok", result: result}
  defp normalize_sync_reply({:error, reason}), do: %{status: "error", error: inspect(reason)}

  defp skip_generic_sync?(provider) do
    provider.name == "sportmonks" and provider.config["generic_sync_enabled"] != true
  end

  defp upsert_many(matches, provider_name, type) do
    Enum.reduce(matches, %{updated_count: 0, per_sport: %{}}, fn normalized, acc ->
      attrs = normalized |> Map.put(:provider, provider_name)

      case Betting.upsert_external_match(attrs) do
        {:ok, match} ->
          put_cache(match.id, attrs)
          synced_match = finalize_live_sync_match(match, attrs, type)
          broadcast_update(synced_match, attrs, type)
          _ = maybe_enrich_match(match, type)
          sport = attrs[:sport] |> to_string()
          per_sport = Map.update(acc.per_sport, sport, 1, &(&1 + 1))
          %{acc | updated_count: acc.updated_count + 1, per_sport: per_sport}

        _ ->
          acc
      end
    end)
  end

  defp maybe_log_failed_sync(provider, sync_type, kind, reason, duration) do
    _ =
      Providers.log_sync_result(%{
        provider_id: provider.id,
        sync_type: sync_type,
        status: :failure,
        error: inspect(reason),
        duration_ms: duration,
        metadata: %{"kind" => to_string(kind)}
      })

    :ok
  end

  defp summarize_sync_results(results) do
    successes =
      Enum.flat_map(results, fn
        {:ok, result} -> [result]
        _ -> []
      end)

    failures =
      Enum.flat_map(results, fn
        {:error, error} -> [error]
        _ -> []
      end)

    total_updated =
      Enum.reduce(successes, 0, fn result, acc ->
        acc + (result[:updated_count] || 0)
      end)

    per_provider = Enum.map(successes, &Map.new/1)

    payload = %{
      providers_synced: length(successes),
      providers_failed: length(failures),
      total_updated_count: total_updated,
      providers: per_provider,
      failures: Enum.map(failures, &Map.new/1)
    }

    if successes == [] and failures != [] do
      {:error, payload}
    else
      {:ok, payload}
    end
  end

  defp broadcast_update(match, attrs, _type) do
    MatchChannel.broadcast_status_change(match.id, match.status)

    BackWeb.Endpoint.broadcast("match:#{match.id}", "score_updated", %{
      match_id: match.id,
      score: Map.get(attrs, :score, %{}),
      status: match.status
    })

    MatchChannel.broadcast_match_state_updated(match, %{"kind" => "generic_live_sync"})
    maybe_trigger_cricket_live_bootstrap(match, attrs)
  end

  defp finalize_live_sync_match(match, attrs, :live) do
    if attrs[:sport] == :cricket and attrs[:status] == :live and
         match.suspension_reason == "provider_disconnect" do
      case MarketManager.resume_match(match.id, %{
             source: "generic_live_sync",
             reason: "provider_recovered"
           }) do
        {:ok, resumed_match} -> resumed_match
        _ -> match
      end
    else
      match
    end
  end

  defp finalize_live_sync_match(match, _attrs, _type), do: match

  defp maybe_enrich_match(match, _type) do
    FootballEnrichment.enrich_async(match)
  end

  defp ensure_ets do
    case :ets.whereis(@table) do
      :undefined -> :ets.new(@table, [:named_table, :public, :set, read_concurrency: true])
      _ -> @table
    end
  end

  defp put_cache(match_id, data) do
    :ets.insert(@table, {match_id, data, now_ms()})
  end

  defp write_meta(key, value) do
    :ets.insert(@table, {{:meta, key}, value})
  end

  defp read_meta(key) do
    case :ets.lookup(@table, {:meta, key}) do
      [{{:meta, ^key}, value}] -> value
      _ -> nil
    end
  end

  defp fresh_live_cache? do
    case read_meta(:live_fetched_at) do
      ts when is_integer(ts) -> now_ms() - ts < @live_cache_ttl_ms
      _ -> false
    end
  end

  defp now_ms, do: System.system_time(:millisecond)

  defp maybe_trigger_cricket_live_bootstrap(match, attrs) do
    cond do
      attrs[:sport] != :cricket ->
        :ok

      match.status != :live ->
        :ok

      MarketManager.published_platform_odds_exist?(match.id) ->
        :ok

      not cricket_live_bootstrap_due?(match.id) ->
        :ok

      true ->
        write_meta({:cricket_live_bootstrap_at, match.id}, now_ms())

        _ =
          MarketManager.keep_match_suspended(match.id, "live_bootstrap", %{
            "source" => "generic_live_sync",
            "reason" => "missing_published_board_after_live_sync"
          })

        Logger.warning(
          "MatchFetcher triggered cricket live bootstrap repricing for #{match.id} (no published board)"
        )

        LangGraphClient.force_reprice_async(match,
          reason: :bootstrap_missing_board,
          event_type: "live_bootstrap",
          suspend_reason: "live_bootstrap",
          trigger: "generic_live_sync"
        )
    end
  end

  defp cricket_live_bootstrap_due?(match_id) do
    case read_meta({:cricket_live_bootstrap_at, match_id}) do
      ts when is_integer(ts) -> now_ms() - ts >= @cricket_live_bootstrap_throttle_ms
      _ -> true
    end
  end

  defp reconcile_kickoff_statuses do
    now = DateTime.utc_now() |> DateTime.truncate(:second)
    promotion_delay_seconds = Application.get_env(:back, :kickoff_live_promotion_delay_seconds, 0)

    stale_cutoff_seconds =
      Application.get_env(:back, :kickoff_live_promotion_stale_cutoff_seconds, 10_800)

    from_time =
      DateTime.add(now, -(stale_cutoff_seconds + max(promotion_delay_seconds, 0)), :second)

    due_time = DateTime.add(now, -max(promotion_delay_seconds, 0), :second)
    sports = kickoff_auto_promotion_sports()

    from(m in Match,
      where: m.status == :upcoming and m.in_play_enabled == false,
      where: m.sport in ^sports,
      where: not is_nil(m.start_time),
      where: m.start_time >= ^from_time and m.start_time <= ^due_time,
      order_by: [asc: m.start_time],
      limit: 200
    )
    |> Repo.all()
    |> Enum.reduce(%{checked: 0, promoted: 0, ids: []}, fn match, acc ->
      next = %{acc | checked: acc.checked + 1}

      if kickoff_auto_promotable?(match) do
        case Betting.start_live(match) do
          {:ok, updated_match} ->
            MatchChannel.broadcast_match_state_updated(updated_match, %{
              "kind" => "kickoff_live_promotion",
              "source" => "match_fetcher",
              "trigger" => "scheduled_start_reached"
            })

            %{
              next
              | promoted: next.promoted + 1,
                ids: [updated_match.id | next.ids]
            }

          _ ->
            next
        end
      else
        next
      end
    end)
  rescue
    error ->
      Logger.warning("[MATCH_FETCHER] kickoff promotion failed: #{inspect(error)}")
      %{checked: 0, promoted: 0, ids: []}
  end

  defp kickoff_auto_promotion_sports do
    case Application.get_env(:back, :kickoff_live_auto_promotion_sports, [:football]) do
      sports when is_list(sports) and sports != [] ->
        Enum.map(sports, &normalize_sport_value/1)
        |> Enum.reject(&is_nil/1)
        |> case do
          [] -> [:football]
          values -> values
        end

      _ ->
        [:football]
    end
  end

  defp normalize_sport_value(value) when is_atom(value), do: value

  defp normalize_sport_value(value) when is_binary(value) do
    value
    |> String.trim()
    |> String.downcase()
    |> case do
      "football" -> :football
      "cricket" -> :cricket
      "tennis" -> :tennis
      "horse_racing" -> :horse_racing
      "dog_racing" -> :dog_racing
      _ -> nil
    end
  end

  defp normalize_sport_value(_), do: nil

  defp kickoff_auto_promotable?(%Match{} = match) do
    normalized =
      match.raw_data
      |> extract_provider_status_text()
      |> String.trim()
      |> String.downcase()

    normalized == "" or
      (not String.contains?(normalized, "postpon") and
         not String.contains?(normalized, "cancel") and
         not String.contains?(normalized, "abandon") and
         not String.contains?(normalized, "delay") and
         not String.contains?(normalized, "suspend") and
         normalized not in ["pst", "canc", "abd"])
  end

  defp extract_provider_status_text(raw_data) when is_map(raw_data) do
    fixture_status =
      raw_data
      |> Map.get("fixture", %{})
      |> case do
        value when is_map(value) -> Map.get(value, "status", %{})
        _ -> %{}
      end

    [
      raw_data["match_status"],
      raw_data["status"],
      fixture_status["short"],
      fixture_status["long"],
      fixture_status["description"],
      fixture_status["state"]
    ]
    |> Enum.find("", fn
      value when is_binary(value) -> String.trim(value) != ""
      _ -> false
    end)
    |> to_string()
  end

  defp extract_provider_status_text(_), do: ""
end
