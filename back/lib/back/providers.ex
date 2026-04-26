defmodule Back.Providers do
  import Ecto.Query
  alias Back.Repo
  alias Back.AI.Automation.FeedConfig
  alias Back.AI.Automation.RunTracker
  alias Back.AI.CricketOddsAutomation
  alias Back.AI.FootballOddsAutomation
  alias Back.Betting
  alias Back.Betting.Match
  alias Back.Football.ApiSports.Enrichment, as: FootballEnrichment
  alias Back.Providers.CricketCompetitionDiscovery
  alias Back.Providers.FootballCompetitionDiscovery
  alias Back.Providers.FeedActivity
  alias Back.Providers.CompetitionFeed
  alias Back.Providers.FeedMetrics
  alias Back.Providers.PublicCompetitions
  alias Back.Providers.Provider
  alias Back.Providers.Dispatcher
  alias Back.Providers.ProviderSyncLog
  alias Back.Security.Encryption
  alias Back.State.MarketManager
  alias BackWeb.MatchChannel

  def list_providers do
    Repo.all(from p in Provider, order_by: [asc: p.name])
  end

  def get_provider!(id), do: Repo.get!(Provider, id)

  def get_provider(name) when is_binary(name), do: get_provider_by_name(name)

  def get_provider_by_name(name) when is_binary(name) do
    case Repo.get_by(Provider, name: name) do
      nil -> {:error, :provider_not_found}
      provider -> {:ok, decrypt_provider_key(provider)}
    end
  end

  def provider_adapter_config(%Provider{} = provider) do
    provider.config
    |> Kernel.||(%{})
    |> maybe_put_provider_config("api_key", provider.api_key)
    |> maybe_put_provider_config("base_url", provider.base_url)
  end

  def mask_api_key(nil), do: nil
  def mask_api_key(""), do: nil

  def mask_api_key(value) when is_binary(value) do
    trimmed = String.trim(value)

    cond do
      trimmed == "" ->
        nil

      String.length(trimmed) <= 8 ->
        String.first(trimmed) <> String.duplicate("*", max(String.length(trimmed) - 1, 0))

      true ->
        prefix = String.slice(trimmed, 0, 4)
        suffix = String.slice(trimmed, -4, 4)
        prefix <> String.duplicate("*", max(String.length(trimmed) - 8, 8)) <> suffix
    end
  end

  def list_competition_feeds(filters \\ %{}) do
    CompetitionFeed
    |> join(:left, [f], p in assoc(f, :provider))
    |> preload([_f, p], provider: p)
    |> apply_competition_feed_filters(filters)
    |> order_by([f, p], asc: f.sport, asc: f.name, asc: p.name)
    |> Repo.all()
  end

  def get_competition_feed!(id) do
    CompetitionFeed
    |> Repo.get!(id)
    |> Repo.preload(:provider)
  end

  def get_competition_feed_metrics!(id) do
    id
    |> get_competition_feed!()
    |> FeedMetrics.summarize_feed()
  end

  def list_competition_feed_metrics(filters \\ %{}) do
    filters
    |> list_competition_feeds()
    |> FeedMetrics.summarize_feeds()
  end

  def list_public_tournaments do
    PublicCompetitions.list_public_tournaments()
  end

  def get_public_tournament(id) do
    PublicCompetitions.get_public_tournament(id)
  end

  def list_cricket_competitions(opts \\ []) do
    CricketCompetitionDiscovery.list_competitions(opts)
  end

  def resolve_cricket_season_by_league_id(league_id) when is_binary(league_id) do
    CricketCompetitionDiscovery.resolve_current_season(league_id)
  end

  def list_football_competitions(opts \\ []) do
    FootballCompetitionDiscovery.list_competitions(opts)
  end

  def latest_cricket_automation_runs(match_ids) when is_list(match_ids) do
    RunTracker.latest_runs_by_match_ids(match_ids)
  rescue
    Postgrex.Error -> %{}
  end

  def latest_football_automation_runs(match_ids) when is_list(match_ids) do
    RunTracker.latest_runs_by_match_ids(match_ids)
  rescue
    Postgrex.Error -> %{}
  end

  def create_competition_feed(attrs) do
    attrs =
      attrs
      |> maybe_resolve_sportmonks_cricket_season()
      |> then(&with_automation_config(%{}, &1))

    with :ok <- ensure_competition_feed_not_duplicated(nil, attrs) do
      %CompetitionFeed{}
      |> CompetitionFeed.changeset(attrs)
      |> Repo.insert()
      |> preload_feed()
    end
  end

  def update_competition_feed(id, attrs) do
    feed = get_competition_feed!(id)

    attrs =
      attrs
      |> maybe_resolve_sportmonks_cricket_season(feed)
      |> then(&with_automation_config(feed.config || %{}, &1))

    with :ok <- ensure_competition_feed_not_duplicated(feed, attrs) do
      feed
      |> CompetitionFeed.changeset(attrs)
      |> Repo.update()
      |> preload_feed()
    end
  end

  def set_competition_feed_enabled(id, enabled) when is_boolean(enabled) do
    id
    |> get_competition_feed!()
    |> Ecto.Changeset.change(enabled: enabled)
    |> Repo.update()
    |> preload_feed()
  end

  def delete_competition_feed(id) when is_binary(id) do
    id
    |> get_competition_feed!()
    |> Repo.delete()
  end

  def import_competition_feed(id, kind \\ :fixtures) when kind in [:fixtures, :live] do
    import_competition_feed(id, kind, sync_type: :manual)
  end

  def import_competition_feed(id, kind, opts) when kind in [:fixtures, :live] and is_list(opts) do
    feed =
      id
      |> get_competition_feed!()
      |> Repo.preload(:provider)

    provider = decrypt_provider_key(feed.provider)
    started_at = System.monotonic_time(:millisecond)
    sync_type = Keyword.get(opts, :sync_type, :manual) |> to_string()

    resolved_feed = maybe_resolve_competition_feed_season(feed)

    fetch_result =
      case kind do
        :fixtures ->
          Dispatcher.fetch_fixtures_for_feed(provider, feed_to_fetch_scope(resolved_feed))

        :live ->
          Dispatcher.fetch_live_for_feed(provider, feed_to_fetch_scope(resolved_feed))
      end

    case fetch_result do
      {:ok, rows, _provider} ->
        %{imported_count: imported_count, per_sport: per_sport, match_ids: match_ids} =
          Enum.reduce(rows, %{imported_count: 0, per_sport: %{}, match_ids: []}, fn row, acc ->
            attrs = decorate_imported_match(row, resolved_feed)

            case Betting.upsert_external_match(attrs) do
              {:ok, inserted_match} ->
                synced_match = finalize_imported_live_match(inserted_match, attrs, kind)
                _ = maybe_enrich_imported_match(synced_match, attrs)
                sport = to_string(attrs[:sport] || "unknown")

                %{
                  imported_count: acc.imported_count + 1,
                  per_sport: Map.update(acc.per_sport, sport, 1, &(&1 + 1)),
                  match_ids: [synced_match.id | acc.match_ids]
                }

              _ ->
                acc
            end
          end)

        duration_ms = System.monotonic_time(:millisecond) - started_at

        {:ok, automation} =
          run_feed_automation(
            feed,
            kind,
            Enum.uniq(match_ids),
            trigger: automation_trigger(sync_type, kind)
          )

        _ =
          log_sync_result(%{
            provider_id: provider.id,
            sync_type: sync_type,
            status: :success,
            duration_ms: duration_ms,
            metadata: %{
              "kind" => Atom.to_string(kind),
              "competition_feed_id" => feed.id,
              "competition_key" => feed.competition_key,
              "imported_count" => imported_count,
              "per_sport" => per_sport,
              "automation" => automation
            }
          })

        {:ok,
         %{
           competition_feed_id: feed.id,
           competition_key: feed.competition_key,
           provider_id: provider.id,
           kind: kind,
           imported_count: imported_count,
           per_sport: per_sport,
           automation: automation,
           duration_ms: duration_ms
         }}

      {:error, reason} ->
        duration_ms = System.monotonic_time(:millisecond) - started_at

        _ =
          log_sync_result(%{
            provider_id: provider.id,
            sync_type: sync_type,
            status: :failure,
            error: inspect(reason),
            duration_ms: duration_ms,
            metadata: %{
              "kind" => Atom.to_string(kind),
              "competition_feed_id" => feed.id,
              "competition_key" => feed.competition_key
            }
          })

        {:error, reason}
    end
  end

  def sync_due_competition_feeds(kind, sync_type \\ :scheduled, now \\ DateTime.utc_now())
      when kind in [:fixtures, :live] do
    case safe_enabled_competition_feeds() do
      {:ok, feeds} ->
        due_feeds =
          Enum.filter(feeds, fn feed ->
            competition_feed_due_for_sync?(feed, kind, now)
          end)

        Enum.reduce(due_feeds, %{synced_count: 0, failed_count: 0, feed_ids: []}, fn feed, acc ->
          case import_competition_feed(feed.id, kind, sync_type: sync_type) do
            {:ok, _result} ->
              %{
                acc
                | synced_count: acc.synced_count + 1,
                  feed_ids: [feed.id | acc.feed_ids]
              }

            {:error, _reason} ->
              %{acc | failed_count: acc.failed_count + 1}
          end
        end)
        |> Map.update!(:feed_ids, &Enum.reverse/1)
        |> then(&{:ok, &1})

      {:error, :competition_feeds_unavailable} = err ->
        err
    end
  end

  def fetch_match_provider_odds(match_id) when is_binary(match_id) do
    match = Betting.get_match!(match_id)
    started_at = System.monotonic_time(:millisecond)

    with {:ok, provider} <- provider_for_match(match) do
      result =
        case Dispatcher.fetch_odds_for_match(provider, match_provider_context(match)) do
          {:ok, rows, _provider} ->
            normalized_rows = normalize_provider_odds_rows(rows, provider.name, match)

            {:ok,
             %{
               match_id: match.id,
               provider: provider.name,
               imported_supported: true,
               data: normalized_rows
             }}

          {:error, reason} ->
            {:error, reason}
        end

      duration_ms = System.monotonic_time(:millisecond) - started_at

      _ =
        FeedActivity.log_provider_odds_fetch(
          provider,
          match,
          feed_activity_result_metadata(result),
          duration_ms
        )

      result
    end
  end

  def import_match_provider_odds(match_id) when is_binary(match_id) do
    match = Betting.get_match!(match_id)
    version_no = Betting.next_odds_version(match.id, "provider_import")
    started_at = System.monotonic_time(:millisecond)

    with {:ok, provider} <- provider_for_match(match) do
      result =
        case Dispatcher.fetch_odds_for_match(provider, match_provider_context(match)) do
          {:ok, rows, _provider} ->
            normalized_rows = normalize_provider_odds_rows(rows, provider.name, match)

            inserted =
              Enum.reduce(normalized_rows, [], fn attrs, acc ->
                case Betting.create_odds(Map.put(attrs, "version_no", version_no)) do
                  {:ok, odds} -> [odds | acc]
                  {:error, _reason} -> acc
                end
              end)
              |> Enum.reverse()

            {:ok,
             %{
               match_id: match.id,
               provider: provider.name,
               version_no: version_no,
               imported_count: length(inserted),
               data: inserted
             }}

          {:error, reason} ->
            {:error, reason}
        end

      duration_ms = System.monotonic_time(:millisecond) - started_at

      _ =
        FeedActivity.log_provider_odds_import(
          provider,
          match,
          feed_activity_result_metadata(result),
          duration_ms
        )

      result
    end
  end

  def get_active_provider do
    case Repo.one(
           from p in Provider,
             where: p.is_active == true and p.is_enabled == true,
             order_by: [asc: p.name],
             limit: 1
         ) do
      nil -> {:error, :no_active_provider}
      provider -> {:ok, decrypt_provider_key(provider)}
    end
  end

  def list_ready_providers do
    Repo.all(
      from p in Provider,
        where: p.is_active == true and p.is_enabled == true,
        order_by: [asc: p.name]
    )
    |> Enum.map(&decrypt_provider_key/1)
  end

  def get_enabled_provider_by_name(name) when is_binary(name) do
    case Repo.one(
           from p in Provider,
             where: p.name == ^name and p.is_enabled == true,
             order_by: [desc: p.is_active, desc: p.updated_at, desc: p.inserted_at],
             limit: 1
         ) do
      nil -> {:error, :provider_not_found}
      provider -> {:ok, decrypt_provider_key(provider)}
    end
  end

  def create_or_update_provider(attrs) do
    attrs = maybe_encrypt_api_key(attrs)
    name = attrs["name"] || attrs[:name]
    wants_active? = truthy?(attrs["is_active"] || attrs[:is_active])

    result =
      case Repo.get_by(Provider, name: name) do
        nil -> %Provider{} |> Provider.changeset(attrs) |> Repo.insert()
        provider -> provider |> Provider.changeset(attrs) |> Repo.update()
      end

    case {result, wants_active?} do
      {{:ok, provider}, true} ->
        case activate_provider(provider.id) do
          {:ok, active_provider} -> {:ok, active_provider}
          {:error, reason} -> {:error, reason}
        end

      _ ->
        result
    end
  end

  def activate_provider(id) do
    provider = get_provider!(id)

    provider
    |> Ecto.Changeset.change(is_active: true, is_enabled: true)
    |> Repo.update()
  end

  def set_enabled(id, enabled) when is_boolean(enabled) do
    provider = get_provider!(id)

    provider
    |> Ecto.Changeset.change(
      is_enabled: enabled,
      is_active: if(enabled, do: provider.is_active, else: false)
    )
    |> Repo.update()
  end

  def delete_provider(id) when is_binary(id) do
    provider = get_provider!(id)

    Ecto.Multi.new()
    |> Ecto.Multi.delete_all(
      :delete_sync_logs,
      from(l in ProviderSyncLog, where: l.provider_id == ^provider.id)
    )
    |> Ecto.Multi.delete(:provider, provider)
    |> Repo.transaction()
  end

  def log_sync_result(attrs) when is_map(attrs) do
    %ProviderSyncLog{}
    |> ProviderSyncLog.changeset(attrs)
    |> Repo.insert()
  end

  def list_sync_logs(filters \\ %{}) do
    limit = to_positive_int(filters[:limit] || filters["limit"], 100)

    ProviderSyncLog
    |> apply_sync_log_filters(filters)
    |> order_by([l], desc: l.inserted_at)
    |> limit(^limit)
    |> Repo.all()
  end

  def get_last_successful_sync(provider_id) when is_binary(provider_id) do
    Repo.one(
      from l in ProviderSyncLog,
        where: l.provider_id == ^provider_id and l.status == :success,
        order_by: [desc: l.inserted_at],
        limit: 1
    )
  end

  defp maybe_encrypt_api_key(attrs) do
    key = attrs["api_key"] || attrs[:api_key]

    if is_binary(key) and String.trim(key) != "" do
      Map.put(attrs, "api_key", Encryption.encrypt(key))
    else
      attrs
      |> Map.delete("api_key")
      |> Map.delete(:api_key)
    end
  end

  defp maybe_resolve_sportmonks_cricket_season(attrs, existing_feed \\ nil) when is_map(attrs) do
    sport =
      to_string(
        Map.get(attrs, "sport") || Map.get(attrs, :sport) || existing_feed_sport(existing_feed) ||
          ""
      )

    league_id =
      present_string(
        Map.get(attrs, "league_id") || Map.get(attrs, :league_id) ||
          existing_feed_value(existing_feed, :league_id)
      )

    season_id =
      present_string(
        Map.get(attrs, "season_id") || Map.get(attrs, :season_id) ||
          existing_feed_value(existing_feed, :season_id)
      )

    provider_id =
      Map.get(attrs, "provider_id") || Map.get(attrs, :provider_id) ||
        existing_feed_value(existing_feed, :provider_id)

    import_mode =
      to_string(
        Map.get(attrs, "import_mode") || Map.get(attrs, :import_mode) ||
          existing_feed_value(existing_feed, :import_mode) || ""
      )

    cond do
      sport != "cricket" ->
        attrs

      import_mode != "season" ->
        attrs

      season_id ->
        attrs

      is_nil(league_id) ->
        attrs

      not sportmonks_provider_id?(provider_id) ->
        attrs

      true ->
        case resolve_cricket_season_by_league_id(league_id) do
          {:ok, resolved} ->
            attrs
            |> Map.put("season_id", resolved.season_id)
            |> maybe_merge_resolution_context(resolved)

          _ ->
            attrs
        end
    end
  end

  defp maybe_resolve_competition_feed_season(feed) do
    league_id = present_string(feed.league_id)
    season_id = present_string(feed.season_id)
    provider_name = if Ecto.assoc_loaded?(feed.provider) and feed.provider, do: feed.provider.name

    cond do
      feed.sport != "cricket" ->
        feed

      feed.import_mode != "season" ->
        feed

      season_id ->
        feed

      is_nil(league_id) ->
        feed

      provider_name != "sportmonks" ->
        feed

      true ->
        case resolve_cricket_season_by_league_id(league_id) do
          {:ok, resolved} ->
            updated_config =
              (feed.config || %{})
              |> Map.put("resolved_season", resolved)

            feed
            |> Map.put(:season_id, resolved.season_id)
            |> Map.put(:config, updated_config)

          _ ->
            feed
        end
    end
  end

  defp sportmonks_provider_id?(nil), do: false

  defp sportmonks_provider_id?(provider_id) do
    case Repo.get(Provider, provider_id) do
      %Provider{name: "sportmonks"} -> true
      _ -> false
    end
  end

  defp maybe_merge_resolution_context(attrs, resolved) do
    config =
      attrs
      |> Map.get("config", Map.get(attrs, :config, %{}))
      |> Kernel.||(%{})
      |> Map.put("resolved_season", resolved)

    Map.put(attrs, "config", config)
  end

  defp existing_feed_sport(nil), do: nil
  defp existing_feed_sport(feed), do: feed.sport
  defp existing_feed_value(nil, _field), do: nil
  defp existing_feed_value(feed, field), do: Map.get(feed, field)

  defp present_string(value) when is_binary(value) do
    trimmed = String.trim(value)
    if trimmed == "", do: nil, else: trimmed
  end

  defp present_string(value) when is_integer(value), do: Integer.to_string(value)
  defp present_string(_), do: nil

  defp ensure_competition_feed_not_duplicated(existing_feed, attrs) do
    provider_id =
      Map.get(attrs, "provider_id") || Map.get(attrs, :provider_id) ||
        existing_feed_value(existing_feed, :provider_id)

    competition_key =
      present_string(
        Map.get(attrs, "competition_key") || Map.get(attrs, :competition_key) ||
          existing_feed_value(existing_feed, :competition_key)
      )

    league_id =
      present_string(
        Map.get(attrs, "league_id") || Map.get(attrs, :league_id) ||
          existing_feed_value(existing_feed, :league_id)
      )

    season_id =
      present_string(
        Map.get(attrs, "season_id") || Map.get(attrs, :season_id) ||
          existing_feed_value(existing_feed, :season_id)
      )

    import_mode =
      to_string(
        Map.get(attrs, "import_mode") || Map.get(attrs, :import_mode) ||
          existing_feed_value(existing_feed, :import_mode) || ""
      )

    base_query =
      from f in CompetitionFeed,
        where: f.provider_id == ^provider_id,
        where: f.competition_key == ^competition_key,
        where: f.import_mode == ^import_mode,
        where: f.league_id == ^league_id

    query =
      case season_id do
        nil -> from f in base_query, where: is_nil(f.season_id)
        season_id -> from f in base_query, where: f.season_id == ^season_id
      end

    query =
      case existing_feed do
        %CompetitionFeed{id: id} -> from f in query, where: f.id != ^id
        _ -> query
      end

    case Repo.exists?(query) do
      true ->
        {:error,
         CompetitionFeed.changeset(existing_feed || %CompetitionFeed{}, attrs)
         |> Ecto.Changeset.add_error(:competition_key, "similar competition feed already exists")}

      false ->
        :ok
    end
  end

  defp decrypt_provider_key(provider) do
    %{provider | api_key: Encryption.decrypt(provider.api_key)}
  end

  defp run_feed_automation(%CompetitionFeed{sport: "cricket"} = feed, kind, match_ids, opts) do
    CricketOddsAutomation.run_for_feed(feed, kind, match_ids, opts)
  end

  defp run_feed_automation(%CompetitionFeed{sport: "football"} = feed, kind, match_ids, opts) do
    FootballOddsAutomation.run_for_feed(feed, kind, match_ids, opts)
  end

  defp run_feed_automation(_feed, _kind, _match_ids, _opts) do
    {:ok,
     %{
       prematch: %{success: 0, failure: 0, skipped: 0},
       inplay: %{success: 0, failure: 0, skipped: 0}
     }}
  end

  defp preload_feed({:ok, feed}), do: {:ok, Repo.preload(feed, :provider)}
  defp preload_feed(other), do: other

  defp maybe_put_provider_config(config, _key, nil), do: config
  defp maybe_put_provider_config(config, key, value), do: Map.put(config, key, value)

  defp maybe_enrich_imported_match(%Match{} = match, attrs) when is_map(attrs) do
    if attrs[:sport] == :football and attrs[:provider] == "api_sports" do
      FootballEnrichment.enrich_async(match)
    else
      :ignored
    end
  end

  defp finalize_imported_live_match(%Match{} = match, attrs, :live) do
    synced_match =
      if attrs[:sport] == :cricket and attrs[:status] == :live and
           match.suspension_reason == "provider_disconnect" do
        case MarketManager.resume_match(match.id, %{
               source: "competition_feed_live_sync",
               reason: "provider_recovered"
             }) do
          {:ok, resumed_match} -> resumed_match
          _ -> match
        end
      else
        match
      end

    MatchChannel.broadcast_status_change(synced_match.id, synced_match.status)

    MatchChannel.broadcast_match_state_updated(synced_match, %{
      "kind" => "competition_feed_live_sync"
    })

    synced_match
  end

  defp finalize_imported_live_match(match, _attrs, _kind), do: match

  defp feed_to_fetch_scope(feed) do
    %{
      "id" => feed.id,
      "name" => feed.name,
      "sport" => feed.sport,
      "competition_key" => feed.competition_key,
      "league_id" => feed.league_id,
      "season_id" => feed.season_id,
      "region" => feed.region,
      "track" => feed.track,
      "import_mode" => feed.import_mode,
      "config" => feed.config
    }
  end

  defp safe_enabled_competition_feeds do
    {:ok, list_competition_feeds(%{"enabled" => true})}
  rescue
    Postgrex.Error -> {:error, :competition_feeds_unavailable}
  end

  defp decorate_imported_match(row, feed) do
    raw =
      row
      |> Map.get(:raw, %{})
      |> Map.put("_competition_feed", %{
        "id" => feed.id,
        "name" => feed.name,
        "competition_key" => feed.competition_key,
        "season_id" => feed.season_id,
        "league_id" => feed.league_id
      })

    row
    |> Map.put(:raw, raw)
    |> Map.put(:provider, feed.provider.name)
    |> Map.put(:competition_feed_id, feed.id)
  end

  defp competition_feed_due_for_sync?(feed, :fixtures, _now), do: feed.enabled

  defp competition_feed_due_for_sync?(feed, :live, now) do
    feed.enabled and feed.live_sync_enabled and competition_feed_has_live_window_match?(feed, now)
  end

  defp competition_feed_has_live_window_match?(feed, now) do
    future_window_minutes = max(feed.live_start_offset_minutes || 0, 15)
    past_window_minutes = competition_feed_live_lookback_minutes(feed)
    window_start = DateTime.add(now, -past_window_minutes * 60, :second)
    window_end = DateTime.add(now, future_window_minutes * 60, :second)

    Repo.exists?(
      from m in Match,
        where: fragment("?->'_competition_feed'->>'id' = ?", m.raw_data, ^feed.id),
        where:
          m.status == :live or
            (m.start_time >= ^window_start and m.start_time <= ^window_end and
               m.status in [:upcoming, :live, :closed])
    )
  rescue
    Postgrex.Error -> false
  end

  defp competition_feed_live_lookback_minutes(feed) do
    configured =
      feed.config
      |> Kernel.||(%{})
      |> Map.get("live_tracking_lookback_minutes")

    case configured do
      value when is_integer(value) and value > 0 ->
        value

      value when is_binary(value) ->
        case Integer.parse(String.trim(value)) do
          {parsed, _} when parsed > 0 -> parsed
          _ -> default_live_lookback_minutes(feed)
        end

      _ ->
        default_live_lookback_minutes(feed)
    end
  end

  defp default_live_lookback_minutes(%CompetitionFeed{sport: "cricket"}), do: 720
  defp default_live_lookback_minutes(_feed), do: 180

  defp provider_for_match(match) do
    case provider_from_match_feed(match) do
      {:ok, provider} ->
        {:ok, decrypt_provider_key(provider)}

      {:error, :provider_not_resolved} ->
        provider_name = match.provider || provider_name_from_match_feed(match)

        case provider_name do
          nil ->
            {:error, :provider_not_resolved}

          name ->
            case Repo.one(
                   from p in Provider,
                     where: p.name == ^name and p.is_enabled == true,
                     order_by: [desc: p.is_active, desc: p.updated_at, desc: p.inserted_at],
                     limit: 1
                 ) do
              nil -> {:error, :provider_not_found}
              provider -> {:ok, decrypt_provider_key(provider)}
            end
        end
    end
  end

  defp provider_from_match_feed(match) do
    feed_id = Map.get(match, :competition_feed_id)

    if is_binary(feed_id) do
      case Repo.one(
             from p in Provider,
               join: f in CompetitionFeed,
               on: f.provider_id == p.id,
               where: f.id == ^feed_id and p.is_enabled == true,
               order_by: [desc: p.is_active, desc: p.updated_at, desc: p.inserted_at],
               limit: 1
           ) do
        nil -> {:error, :provider_not_resolved}
        provider -> {:ok, provider}
      end
    else
      {:error, :provider_not_resolved}
    end
  end

  defp provider_name_from_match_feed(match) do
    feed_id =
      get_in(match.raw_data || %{}, ["_competition_feed", "id"]) ||
        get_in(match.raw_data || %{}, [:_competition_feed, :id])

    case feed_id do
      nil -> nil
      id -> get_competition_feed!(id).provider.name
    end
  end

  defp match_provider_context(match) do
    %{
      id: match.id,
      external_id: match.external_id,
      provider: match.provider,
      sport: match.sport,
      raw_data: match.raw_data,
      status: match.status
    }
  end

  defp normalize_provider_odds_rows(rows, provider_name, match) do
    rows
    |> Enum.flat_map(fn row ->
      market_name =
        first_present([
          row["market"],
          nested_market_name(row),
          row["label"],
          row["name"],
          row["type"]
        ])

      source_external_id = first_present([row["id"], row["market_id"], row["bookmaker_id"]])
      outcomes = extract_provider_outcomes(row)

      Enum.map(outcomes, fn outcome ->
        outcome_name =
          first_present([
            outcome["name"],
            outcome["label"],
            outcome["outcome"],
            outcome["selection"],
            row["outcome"]
          ])

        selection_key =
          normalize_provider_selection_key(
            first_present([
              outcome["selection_key"],
              outcome["value"],
              outcome["label"],
              outcome["name"],
              outcome["outcome"]
            ])
          )

        odds_value =
          first_present([
            outcome["odds"],
            outcome["value"],
            outcome["price"],
            outcome["decimal"],
            row["odds"],
            row["value"],
            row["price"]
          ])

        bet_type = normalize_provider_bet_type(market_name, outcome_name, match.status)
        availability_status = normalize_provider_availability(outcome, row)

        if is_nil(outcome_name) or not usable_provider_odds_value?(odds_value) or is_nil(bet_type) or
             availability_status == "closed" do
          nil
        else
          %{
            "match_id" => match.id,
            "bet_type" => bet_type,
            "outcome" => to_string(outcome_name),
            "odds_value" => odds_value,
            "is_active" => false,
            "ai_generated" => false,
            "visibility_status" => "draft",
            "source_type" => "provider_import",
            "source_provider" => provider_name,
            "source_external_id" => value_to_string(source_external_id || match.external_id),
            "source_market_key" => value_to_string(market_name),
            "availability_status" => availability_status,
            "availability_reason" =>
              provider_availability_reason(outcome, row, availability_status),
            "provider_snapshot" => %{
              "selection_key" => selection_key,
              "line" =>
                first_present([
                  outcome["line"],
                  outcome["handicap"],
                  row["line"],
                  row["handicap"]
                ]),
              "market" => row,
              "selection" => outcome,
              "availability_status" => availability_status
            }
          }
        end
      end)
    end)
    |> Enum.reject(&is_nil/1)
  end

  defp nested_market_name(%{"market" => market}) when is_map(market), do: market["name"]
  defp nested_market_name(_), do: nil

  defp usable_provider_odds_value?(%Decimal{} = value), do: Decimal.gt?(value, Decimal.new("1.0"))
  defp usable_provider_odds_value?(value) when is_integer(value), do: value > 1
  defp usable_provider_odds_value?(value) when is_float(value), do: value > 1.0

  defp usable_provider_odds_value?(value) when is_binary(value) do
    case Decimal.parse(String.trim(value)) do
      {decimal, ""} -> Decimal.gt?(decimal, Decimal.new("1.0"))
      _ -> false
    end
  end

  defp usable_provider_odds_value?(_), do: false

  defp feed_activity_result_metadata({:ok, %{data: data} = result}) when is_list(data) do
    result
    |> Map.take([:match_id, :version_no, :imported_count, :provider])
    |> Map.put(:result_count, length(data))
    |> stringify_map_keys()
  end

  defp feed_activity_result_metadata({:error, reason}), do: {:error, reason}

  defp stringify_map_keys(map) when is_map(map) do
    Map.new(map, fn {key, value} -> {to_string(key), value} end)
  end

  defp extract_provider_outcomes(%{"outcomes" => outcomes}) when is_list(outcomes), do: outcomes
  defp extract_provider_outcomes(%{"selections" => outcomes}) when is_list(outcomes), do: outcomes

  defp extract_provider_outcomes(%{"participants" => outcomes}) when is_list(outcomes),
    do: outcomes

  defp extract_provider_outcomes(row) do
    if Enum.any?(~w(odds value price decimal), &Map.has_key?(row, &1)), do: [row], else: []
  end

  defp normalize_provider_bet_type(market_name, outcome_name, status) do
    market = market_name |> to_string() |> String.downcase()
    outcome = outcome_name |> to_string() |> String.downcase()

    cond do
      String.contains?(market, "double chance") ->
        "double_chance"

      (String.contains?(market, "both teams") and String.contains?(market, "score")) or
          String.contains?(market, "btts") ->
        "btts"

      String.contains?(market, "over") and String.contains?(market, "under") ->
        "over_under"

      match_winner_market?(market) ->
        "match_winner"

      supported_football_in_play_market?(market, outcome, status) ->
        "in_play"

      true ->
        nil
    end
  end

  defp normalize_provider_availability(outcome, row) do
    status =
      first_present([
        outcome["status"],
        row["status"]
      ])

    case Back.Providers.AdapterUtils.normalize_market_availability(status) do
      :active -> "active"
      :suspended -> "suspended"
      :closed -> "closed"
    end
  end

  defp provider_availability_reason(outcome, row, availability_status) do
    reason =
      first_present([
        outcome["suspension_reason"],
        outcome["reason"],
        row["suspension_reason"],
        row["reason"],
        outcome["status"],
        row["status"]
      ])

    case availability_status do
      "suspended" -> value_to_string(reason || "temporarily_unavailable")
      "closed" -> value_to_string(reason || "market_closed")
      _ -> nil
    end
  end

  defp match_winner_market?(market) do
    String.contains?(market, "match winner") or
      String.contains?(market, "winner") or
      String.contains?(market, "fulltime result") or
      String.contains?(market, "full time result") or
      String.contains?(market, "1x2")
  end

  defp supported_football_in_play_market?(market, outcome, status) do
    status in [:live, "live"] and
      ((String.contains?(market, "another goal") or String.contains?(market, "next goal")) and
         outcome in ["yes", "no", "another_goal_yes", "another_goal_no"])
  end

  defp first_present(values) do
    Enum.find(values, fn
      nil -> false
      "" -> false
      _ -> true
    end)
  end

  defp value_to_string(nil), do: nil
  defp value_to_string(value) when is_binary(value), do: value
  defp value_to_string(value), do: to_string(value)

  defp normalize_provider_selection_key(nil), do: nil

  defp normalize_provider_selection_key(value) do
    value
    |> to_string()
    |> String.trim()
    |> String.downcase()
    |> String.replace(~r/[^a-z0-9]+/u, "_")
    |> String.replace(~r/^_+|_+$/u, "")
    |> case do
      "" -> nil
      normalized -> normalized
    end
  end

  defp truthy?(v) when v in [true, "true", 1, "1"], do: true
  defp truthy?(_), do: false

  defp with_automation_config(existing_config, attrs) do
    Map.put(attrs, "config", FeedConfig.merge_automation_config(existing_config || %{}, attrs))
  end

  defp automation_trigger("manual", :fixtures), do: :manual_import
  defp automation_trigger("manual", :live), do: :manual_refresh
  defp automation_trigger("scheduled", :fixtures), do: :scheduled_fixtures
  defp automation_trigger("scheduled", :live), do: :scheduled_live
  defp automation_trigger(_, :fixtures), do: :manual_import
  defp automation_trigger(_, :live), do: :manual_refresh

  defp apply_sync_log_filters(query, filters) do
    Enum.reduce(filters, query, fn
      {:provider_id, provider_id}, q ->
        where(q, [l], l.provider_id == ^provider_id)

      {"provider_id", provider_id}, q ->
        where(q, [l], l.provider_id == ^provider_id)

      {:status, status}, q ->
        where(q, [l], l.status == ^status)

      {"status", status}, q ->
        case to_status(status) do
          nil -> q
          parsed -> where(q, [l], l.status == ^parsed)
        end

      _, q ->
        q
    end)
  end

  defp apply_competition_feed_filters(query, filters) do
    Enum.reduce(filters, query, fn
      {:provider_id, provider_id}, q ->
        where(q, [f], f.provider_id == ^provider_id)

      {"provider_id", provider_id}, q ->
        where(q, [f], f.provider_id == ^provider_id)

      {:sport, sport}, q when is_binary(sport) and sport != "" ->
        where(q, [f], f.sport == ^sport)

      {"sport", sport}, q when is_binary(sport) and sport != "" ->
        where(q, [f], f.sport == ^sport)

      {:enabled, enabled}, q when is_boolean(enabled) ->
        where(q, [f], f.enabled == ^enabled)

      {"enabled", enabled}, q ->
        case to_bool(enabled) do
          nil -> q
          parsed -> where(q, [f], f.enabled == ^parsed)
        end

      _, q ->
        q
    end)
  end

  defp to_status(status) when status in [:success, :failure, :partial], do: status
  defp to_status("success"), do: :success
  defp to_status("failure"), do: :failure
  defp to_status("partial"), do: :partial
  defp to_status(_), do: nil

  defp to_positive_int(nil, default), do: default
  defp to_positive_int(v, _default) when is_integer(v) and v > 0, do: v

  defp to_positive_int(v, default) when is_binary(v) do
    case Integer.parse(v) do
      {int, ""} when int > 0 -> int
      _ -> default
    end
  end

  defp to_positive_int(_, default), do: default

  defp to_bool(v) when v in [true, "true", 1, "1"], do: true
  defp to_bool(v) when v in [false, "false", 0, "0"], do: false
  defp to_bool(_), do: nil
end
