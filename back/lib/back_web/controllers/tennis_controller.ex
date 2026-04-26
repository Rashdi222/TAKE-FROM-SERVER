defmodule BackWeb.TennisController do
  use BackWeb, :controller

  action_fallback BackWeb.FallbackController

  alias Back.Admin
  alias Back.Auth.Guardian
  alias Back.Tennis
  alias BackWeb.JsonHelpers

  def margin(conn, _params) do
    json(conn, %{data: %{margin: Tennis.get_margin()}})
  end

  def update_margin(conn, %{"margin" => margin}) do
    current_user = Guardian.Plug.current_resource(conn)

    with {:ok, normalized_margin} <- Tennis.set_margin(margin) do
      _ =
        Admin.log_action(%{
          actor_id: current_user && current_user.id,
          action: "tennis_margin_update",
          target_type: "tennis_margin",
          target_id: "global",
          payload: %{margin: normalized_margin, meta: audit_meta(conn)}
        })

      json(conn, %{data: %{margin: normalized_margin}})
    end
  end

  def simulation(conn, _params) do
    state = Tennis.simulation_state()

    json(conn, %{
      data: %{
        enabled: state.enabled,
        scenario: state.scenario,
        scenarios: Tennis.list_simulation_scenarios()
      }
    })
  end

  def update_simulation(conn, %{"enabled" => enabled}) do
    current_user = Guardian.Plug.current_resource(conn)
    parsed = enabled in [true, "true", 1, "1"]

    with {:ok, state} <- Tennis.set_simulation_enabled(parsed) do
      _ =
        Admin.log_action(%{
          actor_id: current_user && current_user.id,
          action: "tennis_simulation_toggle",
          target_type: "tennis_simulation",
          target_id: "global",
          payload: %{enabled: state.enabled, scenario: state.scenario, meta: audit_meta(conn)}
        })

      json(conn, %{data: %{enabled: state.enabled, scenario: state.scenario}})
    end
  end

  def inject_simulation(conn, %{"scenario" => scenario}) do
    current_user = Guardian.Plug.current_resource(conn)

    with {:ok, state} <- Tennis.inject_simulation_scenario(scenario) do
      _ =
        Admin.log_action(%{
          actor_id: current_user && current_user.id,
          action: "tennis_simulation_inject",
          target_type: "tennis_simulation",
          target_id: scenario,
          payload: %{enabled: state.enabled, scenario: state.scenario, meta: audit_meta(conn)}
        })

      json(conn, %{data: %{enabled: state.enabled, scenario: state.scenario}})
    end
  end

  def public_fixtures(conn, params) do
    opts = [
      date_start: parse_date(params["date_start"], Date.utc_today()),
      date_stop: parse_date(params["date_stop"], Date.add(Date.utc_today(), 3))
    ]

    with {:ok, fixtures} <- Tennis.list_fixtures(opts) do
      json(conn, %{data: JsonHelpers.json_safe(fixtures)})
    end
  end

  def public_live(conn, _params) do
    json(conn, %{data: Enum.map(Tennis.list_public_live_states(), &public_state_json/1)})
  end

  def public_match(conn, %{"event_key" => event_key} = params) do
    opts = [
      date_start: parse_date(params["date_start"], Date.add(Date.utc_today(), -2)),
      date_stop: parse_date(params["date_stop"], Date.add(Date.utc_today(), 3))
    ]

    with {:ok, match} <- resolve_public_match(event_key, opts) do
      json(conn, %{data: public_match_json(match)})
    end
  end

  defp resolve_public_match(event_key, opts) do
    task = Task.async(fn -> Tennis.get_public_match(event_key, opts) end)

    case Task.yield(task, 4_000) || Task.shutdown(task, :brutal_kill) do
      {:ok, {:ok, match}} ->
        {:ok, match}

      {:ok, {:error, reason}} ->
        {:error, reason}

      nil ->
        fallback =
          Tennis.list_public_live_states()
          |> Enum.find(fn row ->
            to_string(Map.get(row, :event_key) || Map.get(row, "event_key")) == event_key
          end)

        {:ok, fallback}
    end
  end

  def fixtures(conn, params) do
    opts = [
      date_start: parse_date(params["date_start"], Date.utc_today()),
      date_stop: parse_date(params["date_stop"], Date.add(Date.utc_today(), 1))
    ]

    with {:ok, fixtures} <- Tennis.list_fixtures(opts) do
      json(conn, %{data: JsonHelpers.json_safe(fixtures)})
    end
  end

  def live(conn, _params) do
    json(conn, %{data: Enum.map(Tennis.list_tracked_matches(), &admin_state_json/1)})
  end

  def live_discovery(conn, _params) do
    with {:ok, matches} <- Tennis.list_provider_live_matches() do
      json(conn, %{data: Enum.map(matches, &admin_state_json/1)})
    end
  end

  def desk(conn, _params) do
    simulation = Tennis.simulation_state()

    json(conn, %{
      data: %{
        matches: Enum.map(Tennis.list_desk_states(), &admin_state_json/1),
        margin: Tennis.get_margin(),
        simulation: %{
          enabled: simulation.enabled,
          scenario: simulation.scenario,
          scenarios: Tennis.list_simulation_scenarios()
        }
      }
    })
  end

  def start_tracking(conn, %{"event_key" => event_key} = params) do
    current_user = Guardian.Plug.current_resource(conn)

    metadata =
      Map.take(params, ["tournament_name", "player_1_name", "player_2_name", "start_time"])

    with :ok <- Tennis.track_match(event_key, metadata) do
      _ =
        Admin.log_action(%{
          actor_id: current_user && current_user.id,
          action: "tennis_track_start",
          target_type: "tennis_match",
          target_id: event_key,
          payload: %{details: metadata, meta: audit_meta(conn)}
        })

      json(conn, %{data: %{event_key: event_key, tracked: true}})
    end
  end

  def stop_tracking(conn, %{"event_key" => event_key}) do
    current_user = Guardian.Plug.current_resource(conn)

    with :ok <- Tennis.untrack_match(event_key) do
      _ =
        Admin.log_action(%{
          actor_id: current_user && current_user.id,
          action: "tennis_track_stop",
          target_type: "tennis_match",
          target_id: event_key,
          payload: %{details: %{}, meta: audit_meta(conn)}
        })

      json(conn, %{data: %{event_key: event_key, tracked: false}})
    end
  end

  def publish(conn, %{"event_key" => event_key}) do
    current_user = Guardian.Plug.current_resource(conn)

    with :ok <- Tennis.publish_match(event_key) do
      _ =
        Admin.log_action(%{
          actor_id: current_user && current_user.id,
          action: "tennis_publish",
          target_type: "tennis_match",
          target_id: event_key,
          payload: %{published: true, meta: audit_meta(conn)}
        })

      json(conn, %{data: %{event_key: event_key, published: true}})
    end
  end

  def unpublish(conn, %{"event_key" => event_key}) do
    current_user = Guardian.Plug.current_resource(conn)

    with :ok <- Tennis.unpublish_match(event_key) do
      _ =
        Admin.log_action(%{
          actor_id: current_user && current_user.id,
          action: "tennis_unpublish",
          target_type: "tennis_match",
          target_id: event_key,
          payload: %{published: false, meta: audit_meta(conn)}
        })

      json(conn, %{data: %{event_key: event_key, published: false}})
    end
  end

  defp parse_date(nil, fallback), do: fallback
  defp parse_date("", fallback), do: fallback

  defp parse_date(value, fallback) do
    case Date.from_iso8601(to_string(value)) do
      {:ok, date} -> date
      _ -> fallback
    end
  end

  defp audit_meta(conn) do
    %{
      ip: to_string(conn.remote_ip |> :inet.ntoa()),
      user_agent: List.first(get_req_header(conn, "user-agent"))
    }
  end

  defp public_match_json(nil), do: nil

  defp public_match_json(%Back.Tennis.MatchState{} = state), do: public_state_json(state)

  defp public_match_json(%{} = state)
       when is_map_key(state, :event_key) or is_map_key(state, "event_key") do
    public_state_json(state)
  end

  defp public_match_json(%Back.Tennis.Fixture{} = fixture) do
    JsonHelpers.json_safe(fixture)
  end

  defp public_state_json(state) do
    json = admin_state_json(state)
    published = Map.get(json, "published_odds") || Map.get(json, :published_odds)
    raw = Map.get(json, "raw_live_odds") || Map.get(json, :raw_live_odds)

    effective_published =
      cond do
        is_list(published) and published != [] -> published
        is_list(raw) and raw != [] -> raw
        true -> []
      end

    json
    |> Map.put("published_odds", effective_published)
    |> Map.put(:published_odds, effective_published)
    |> Map.drop(["raw_live_odds"])
    |> Map.drop([:raw_live_odds])
  end

  defp admin_state_json(state) do
    JsonHelpers.json_safe(state)
  end
end
