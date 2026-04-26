defmodule BackWeb.ProviderController do
  use BackWeb, :controller

  action_fallback BackWeb.FallbackController

  alias Back.Admin
  alias Back.Auth.Guardian
  alias Back.Live.LangGraphClient
  alias Back.Providers
  alias Back.Workers.MatchFetcher
  alias BackWeb.JsonHelpers

  # GET /api/super-admin/providers
  def index(conn, _params) do
    providers = Providers.list_providers()
    json(conn, %{data: Enum.map(providers, &provider_json/1)})
  end

  # POST /api/super-admin/providers
  def upsert(conn, params) do
    current_user = Guardian.Plug.current_resource(conn)

    with :ok <- validate_upsert_payload(params),
         {:ok, provider} <- Providers.create_or_update_provider(params) do
      _ =
        maybe_audit(
          current_user,
          "provider_upsert",
          provider.id,
          %{
            name: provider.name,
            has_api_key: is_binary(provider.api_key) and String.trim(provider.api_key) != "",
            is_enabled: provider.is_enabled,
            is_active: provider.is_active,
            auth_mode: provider.auth_mode,
            sport_scope: provider.sport_scope,
            base_url: provider.base_url,
            socket_url: provider.socket_url,
            headers_template: provider.headers_template,
            query_template: provider.query_template
          },
          audit_meta(conn)
        )

      conn |> put_status(:created) |> json(%{data: provider_json(provider)})
    end
  end

  # POST /api/super-admin/providers/:id/activate
  def activate(conn, %{"id" => id}) do
    current_user = Guardian.Plug.current_resource(conn)

    with {:ok, provider} <- Providers.activate_provider(id) do
      _ =
        maybe_audit(
          current_user,
          "provider_activate",
          provider.id,
          %{name: provider.name},
          audit_meta(conn)
        )

      json(conn, %{data: provider_json(provider)})
    end
  end

  # POST /api/super-admin/providers/:id/enable
  def enable(conn, %{"id" => id} = params) do
    current_user = Guardian.Plug.current_resource(conn)
    enabled = parse_bool(params["enabled"], true)

    with {:ok, provider} <- Providers.set_enabled(id, enabled) do
      _ =
        maybe_audit(
          current_user,
          "provider_set_enabled",
          provider.id,
          %{name: provider.name, enabled: provider.is_enabled},
          audit_meta(conn)
        )

      json(conn, %{data: provider_json(provider)})
    end
  end

  # DELETE /api/super-admin/providers/:id
  def delete(conn, %{"id" => id}) do
    current_user = Guardian.Plug.current_resource(conn)
    provider = Providers.get_provider!(id)

    with {:ok, _result} <- Providers.delete_provider(id) do
      _ =
        maybe_audit(
          current_user,
          "provider_delete",
          provider.id,
          %{name: provider.name},
          audit_meta(conn)
        )

      json(conn, %{data: %{id: id, deleted: true}})
    end
  end

  # GET /api/super-admin/providers/health
  def health(conn, _params) do
    with {:ok, provider} <- Providers.get_active_provider() do
      last_success = Providers.get_last_successful_sync(provider.id)

      last_failure =
        Providers.list_sync_logs(%{
          "provider_id" => provider.id,
          "status" => "failure",
          "limit" => 1
        })
        |> List.first()

      json(conn, %{
        data: %{
          active_provider: provider_json(provider),
          last_successful_sync: sync_log_json(last_success),
          last_failure: sync_log_json(last_failure)
        }
      })
    end
  end

  # POST /api/super-admin/providers/sync-now
  def sync_now(conn, _params) do
    result = MatchFetcher.sync_now()
    json(conn, %{data: JsonHelpers.json_safe(result)})
  end

  # GET /api/super-admin/providers/sync-logs
  def sync_logs(conn, params) do
    logs = Providers.list_sync_logs(params)
    json(conn, %{data: Enum.map(logs, &sync_log_json/1)})
  end

  # GET /api/super-admin/cricket/discovery
  def cricket_discovery(conn, params) do
    force_refresh = parse_bool(params["force_refresh"], false)

    with {:ok, competitions} <- Providers.list_cricket_competitions(force_refresh: force_refresh) do
      json(conn, %{data: competitions})
    end
  end

  # GET /api/super-admin/cricket/ai-observability
  def cricket_ai_observability(conn, params) do
    match_id = params["match_id"]

    case LangGraphClient.cricket_observability(match_id) do
      {:ok, snapshot} ->
        json(conn, %{data: JsonHelpers.json_safe(snapshot)})

      {:error, reason} ->
        conn
        |> put_status(:service_unavailable)
        |> json(%{error: "ai_observability_unavailable", detail: inspect(reason)})
    end
  end

  # GET /api/super-admin/cricket/resolve-season?league_id=...
  def resolve_cricket_season(conn, %{"league_id" => league_id}) do
    with {:ok, resolution} <- Providers.resolve_cricket_season_by_league_id(league_id) do
      json(conn, %{data: resolution})
    end
  end

  # GET /api/super-admin/football/discovery
  def football_discovery(conn, params) do
    force_refresh = parse_bool(params["force_refresh"], false)
    provider_name = params["provider"] || "api_sports"

    with {:ok, competitions} <-
           Providers.list_football_competitions(
             force_refresh: force_refresh,
             provider_name: provider_name
           ) do
      json(conn, %{data: competitions})
    end
  end

  # GET /api/super-admin/cricket/automation-runs
  def cricket_automation_runs(conn, params) do
    match_ids =
      params["match_ids"]
      |> parse_match_ids()

    runs =
      Providers.latest_cricket_automation_runs(match_ids)
      |> Enum.into(%{}, fn {match_id, phases} ->
        {match_id,
         Map.new(phases, fn {phase, run} ->
           {phase, automation_run_json(run)}
         end)}
      end)

    json(conn, %{data: runs})
  end

  # GET /api/super-admin/football/automation-runs
  def football_automation_runs(conn, params) do
    match_ids =
      params["match_ids"]
      |> parse_match_ids()

    runs =
      Providers.latest_football_automation_runs(match_ids)
      |> Enum.into(%{}, fn {match_id, phases} ->
        {match_id,
         Map.new(phases, fn {phase, run} ->
           {phase, automation_run_json(run)}
         end)}
      end)

    json(conn, %{data: runs})
  end

  # GET /api/super-admin/competition-feeds
  def competition_feeds(conn, params) do
    feeds = Providers.list_competition_feeds(params)

    metrics_by_feed =
      if parse_bool(params["include_metrics"], false) do
        Providers.list_competition_feed_metrics(params)
      else
        %{}
      end

    json(conn, %{
      data: Enum.map(feeds, &competition_feed_json(&1, Map.get(metrics_by_feed, &1.id)))
    })
  end

  # GET /api/super-admin/competition-feeds/:id
  def get_competition_feed(conn, %{"id" => id}) do
    feed = Providers.get_competition_feed!(id)

    metrics =
      if parse_bool(conn.params["include_metrics"], false) do
        Providers.get_competition_feed_metrics!(id)
      end

    json(conn, %{data: competition_feed_json(feed, metrics)})
  end

  # GET /api/super-admin/competition-feeds/:id/metrics
  def competition_feed_metrics(conn, %{"id" => id}) do
    json(conn, %{data: Providers.get_competition_feed_metrics!(id)})
  end

  # POST /api/super-admin/competition-feeds
  def create_competition_feed(conn, params) do
    with {:ok, feed} <- Providers.create_competition_feed(params) do
      conn |> put_status(:created) |> json(%{data: competition_feed_json(feed)})
    end
  end

  # DELETE /api/super-admin/competition-feeds/:id
  def delete_competition_feed(conn, %{"id" => id}) do
    with {:ok, _feed} <- Providers.delete_competition_feed(id) do
      json(conn, %{data: %{id: id, deleted: true}})
    end
  end

  # PUT /api/super-admin/competition-feeds/:id
  def update_competition_feed(conn, %{"id" => id} = params) do
    with {:ok, feed} <- Providers.update_competition_feed(id, Map.delete(params, "id")) do
      json(conn, %{data: competition_feed_json(feed)})
    end
  end

  # POST /api/super-admin/competition-feeds/:id/enable
  def enable_competition_feed(conn, %{"id" => id} = params) do
    enabled = parse_bool(params["enabled"], true)

    with {:ok, feed} <- Providers.set_competition_feed_enabled(id, enabled) do
      json(conn, %{data: competition_feed_json(feed)})
    end
  end

  # POST /api/super-admin/competition-feeds/:id/import
  def import_competition_feed(conn, %{"id" => id}) do
    with {:ok, result} <- Providers.import_competition_feed(id, :fixtures) do
      json(conn, %{data: result})
    end
  end

  # POST /api/super-admin/competition-feeds/:id/refresh-upcoming
  def refresh_competition_feed_upcoming(conn, %{"id" => id}) do
    with {:ok, result} <- Providers.import_competition_feed(id, :fixtures) do
      json(conn, %{data: result})
    end
  end

  # POST /api/super-admin/competition-feeds/:id/refresh-live
  def refresh_competition_feed_live(conn, %{"id" => id}) do
    with {:ok, result} <- Providers.import_competition_feed(id, :live) do
      json(conn, %{data: result})
    end
  end

  defp provider_json(provider) do
    %{
      id: provider.id,
      name: provider.name,
      is_active: provider.is_active,
      is_enabled: provider.is_enabled,
      base_url: provider.base_url,
      socket_url: provider.socket_url,
      auth_mode: provider.auth_mode,
      headers_template: provider.headers_template || %{},
      query_template: provider.query_template || %{},
      sport_scope: provider.sport_scope || [],
      has_api_key: is_binary(provider.api_key) and String.trim(provider.api_key) != "",
      api_key_masked: Providers.mask_api_key(provider.api_key),
      config: provider.config,
      inserted_at: provider.inserted_at,
      updated_at: provider.updated_at
    }
  end

  defp parse_bool(nil, default), do: default
  defp parse_bool(v, _) when v in [true, "true", 1, "1"], do: true
  defp parse_bool(_, _), do: false

  defp parse_match_ids(nil), do: []
  defp parse_match_ids(ids) when is_list(ids), do: ids

  defp parse_match_ids(ids) when is_binary(ids) do
    ids
    |> String.split(",", trim: true)
    |> Enum.map(&String.trim/1)
    |> Enum.reject(&(&1 == ""))
  end

  defp validate_upsert_payload(%{"name" => name}) when is_binary(name) do
    if String.trim(name) == "", do: {:error, :invalid_provider_payload}, else: :ok
  end

  defp validate_upsert_payload(_), do: {:error, :invalid_provider_payload}

  defp maybe_audit(nil, _action, _target_id, _payload, _meta), do: :ok

  defp maybe_audit(current_user, action, target_id, payload, meta) do
    Admin.log_action(%{
      actor_id: current_user.id,
      action: action,
      target_type: "Provider",
      target_id: target_id,
      payload:
        Map.merge(
          payload,
          %{
            ip_address: meta[:ip_address],
            user_agent: meta[:user_agent]
          }
        )
    })

    :ok
  end

  defp audit_meta(conn) do
    %{
      ip_address:
        case Plug.Conn.get_req_header(conn, "x-forwarded-for") do
          [value | _] -> value
          _ -> conn.remote_ip |> :inet.ntoa() |> to_string()
        end,
      user_agent: List.first(Plug.Conn.get_req_header(conn, "user-agent"))
    }
  end

  defp sync_log_json(nil), do: nil

  defp sync_log_json(log) do
    %{
      id: log.id,
      provider_id: log.provider_id,
      sync_type: log.sync_type,
      status: log.status,
      error: log.error,
      duration_ms: log.duration_ms,
      metadata: log.metadata,
      inserted_at: log.inserted_at
    }
  end

  defp competition_feed_json(feed, metrics \\ nil) do
    %{
      id: feed.id,
      name: feed.name,
      sport: feed.sport,
      competition_key: feed.competition_key,
      league_id: feed.league_id,
      season_id: feed.season_id,
      region: feed.region,
      track: feed.track,
      import_mode: feed.import_mode,
      enabled: feed.enabled,
      live_sync_enabled: feed.live_sync_enabled,
      import_provider_odds: feed.import_provider_odds,
      generate_platform_odds: feed.generate_platform_odds,
      pricing_mode: pricing_mode(feed),
      upcoming_window_days: feed.upcoming_window_days,
      live_start_offset_minutes: feed.live_start_offset_minutes,
      live_poll_interval_seconds: feed.live_poll_interval_seconds,
      live_stop_offset_minutes: feed.live_stop_offset_minutes,
      config: feed.config,
      auto_generate_prematch_odds: truthy_config(feed.config, "auto_generate_prematch_odds"),
      auto_generate_inplay_odds: truthy_config(feed.config, "auto_generate_inplay_odds"),
      prematch_generation_window_minutes:
        int_config(feed.config, "prematch_generation_window_minutes"),
      inplay_generation_interval_seconds:
        int_config(feed.config, "inplay_generation_interval_seconds"),
      max_automation_runs_per_match: int_config(feed.config, "max_automation_runs_per_match"),
      live_ai_publish_mode: string_config(feed.config, "live_ai_publish_mode", "auto_publish"),
      provider:
        if(Ecto.assoc_loaded?(feed.provider) and feed.provider,
          do: %{
            id: feed.provider.id,
            name: feed.provider.name,
            is_active: feed.provider.is_active,
            is_enabled: feed.provider.is_enabled
          },
          else: nil
        ),
      provider_id: feed.provider_id,
      inserted_at: feed.inserted_at,
      updated_at: feed.updated_at,
      metrics: metrics
    }
  end

  defp truthy_config(config, key) when is_map(config) do
    Map.get(config, key) in [true, "true", 1, "1"]
  end

  defp truthy_config(_, _), do: false

  defp pricing_mode(feed) do
    config = feed.config || %{}

    case Map.get(config, "football_pricing_mode") do
      mode when mode in ["provider_only", "ai_only", "hybrid"] ->
        mode

      _ ->
        cond do
          feed.import_provider_odds and feed.generate_platform_odds -> "hybrid"
          feed.import_provider_odds -> "provider_only"
          true -> "ai_only"
        end
    end
  end

  defp int_config(config, key) when is_map(config) do
    case Map.get(config, key) do
      value when is_integer(value) ->
        value

      value when is_binary(value) ->
        case Integer.parse(String.trim(value)) do
          {parsed, ""} -> parsed
          _ -> nil
        end

      _ ->
        nil
    end
  end

  defp int_config(_, _), do: nil

  defp string_config(config, key, default) when is_map(config) do
    case Map.get(config, key) do
      value when is_binary(value) and value != "" -> value
      _ -> default
    end
  end

  defp string_config(_, _, default), do: default

  defp automation_run_json(run) do
    %{
      id: run.id,
      match_id: run.match_id,
      competition_feed_id: run.competition_feed_id,
      phase: run.phase,
      status: run.status,
      trigger: run.trigger,
      model: run.model,
      generated_count: run.generated_count,
      state_hash: run.state_hash,
      reason: run.reason,
      metadata: run.metadata,
      inserted_at: run.inserted_at,
      updated_at: run.updated_at
    }
  end
end
