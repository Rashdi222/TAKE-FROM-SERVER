defmodule BackWeb.MultiSourceController do
  use BackWeb, :controller

  action_fallback BackWeb.FallbackController

  alias Back.Auth.Guardian
  alias Back.MultiSource

  def suggestions(conn, params) do
    suggestions = MultiSource.list_match_mapping_suggestions(params)

    json(conn, %{
      data: Enum.map(suggestions, &MultiSource.suggestion_json/1),
      summary: %{
        total: length(suggestions),
        suggested: Enum.count(suggestions, &(&1.mapping_status == "suggested")),
        needs_review: Enum.count(suggestions, &(&1.mapping_status == "needs_review")),
        rejected: Enum.count(suggestions, &(&1.mapping_status == "rejected")),
        approved: Enum.count(suggestions, &(&1.mapping_status == "manual_confirmed"))
      }
    })
  end

  def scraper_configurations(conn, _params) do
    json(conn, %{
      data:
        Enum.map(
          MultiSource.list_scraper_configurations(),
          &MultiSource.scraper_configuration_json/1
        )
    })
  end

  def egress_gateways(conn, _params) do
    json(conn, %{
      data: Enum.map(MultiSource.list_egress_gateways(), &MultiSource.egress_gateway_json/1)
    })
  end

  def create_egress_gateway(conn, params) do
    with {:ok, gateway} <- MultiSource.create_egress_gateway(params) do
      json(conn, %{data: MultiSource.egress_gateway_json(gateway)})
    end
  end

  def update_egress_gateway(conn, %{"id" => id} = params) do
    with gateway when not is_nil(gateway) <- MultiSource.get_egress_gateway(id),
         {:ok, updated_gateway} <- MultiSource.update_egress_gateway(gateway, params) do
      json(conn, %{data: MultiSource.egress_gateway_json(updated_gateway)})
    else
      nil -> {:error, :egress_gateway_not_found}
      error -> error
    end
  end

  def delete_egress_gateway(conn, %{"id" => id}) do
    with gateway when not is_nil(gateway) <- MultiSource.get_egress_gateway(id),
         {:ok, _gateway} <- MultiSource.delete_egress_gateway(gateway) do
      json(conn, %{ok: true})
    else
      nil -> {:error, :egress_gateway_not_found}
      error -> error
    end
  end

  def create_scraper_configuration(conn, params) do
    with {:ok, configuration} <- MultiSource.create_scraper_configuration(params) do
      json(conn, %{data: MultiSource.scraper_configuration_json(configuration)})
    end
  end

  def update_scraper_configuration(conn, %{"id" => id} = params) do
    with configuration when not is_nil(configuration) <- MultiSource.get_scraper_configuration(id),
         {:ok, updated_configuration} <-
           MultiSource.update_scraper_configuration(configuration, params) do
      json(conn, %{data: MultiSource.scraper_configuration_json(updated_configuration)})
    else
      nil -> {:error, :scraper_configuration_not_found}
      error -> error
    end
  end

  def delete_scraper_configuration(conn, %{"id" => id}) do
    with configuration when not is_nil(configuration) <- MultiSource.get_scraper_configuration(id),
         {:ok, _deleted_configuration} <- MultiSource.delete_scraper_configuration(configuration) do
      json(conn, %{ok: true})
    else
      nil -> {:error, :scraper_configuration_not_found}
      error -> error
    end
  end

  def replay_scraper_configurations(conn, _params) do
    :ok = MultiSource.replay_scraper_configurations()
    json(conn, %{ok: true})
  end

  def replay_scraper_configuration(conn, %{"id" => id}) do
    with {:ok, payload} <- MultiSource.replay_scraper_configuration(id) do
      json(conn, %{ok: true, data: payload})
    end
  end

  def prune_invalid_suggestions(conn, _params) do
    with {:ok, result} <- MultiSource.prune_invalid_matchmaker_suggestions() do
      json(conn, %{ok: true, data: result})
    end
  end

  def health(conn, _params) do
    json(conn, %{data: MultiSource.matchmaker_health()})
  end

  def automation_status(conn, _params) do
    json(conn, %{data: MultiSource.automation_status()})
  end

  def automation_events(conn, params) do
    limit =
      case Integer.parse(to_string(params["limit"] || "50")) do
        {int, ""} when int > 0 -> min(int, 200)
        _ -> 50
      end

    json(conn, %{
      data:
        Enum.map(
          MultiSource.list_automation_events(limit: limit),
          &MultiSource.automation_event_json/1
        )
    })
  end

  def polling_profiles(conn, _params) do
    result = MultiSource.list_cricket_polling_profiles()
    json(conn, result)
  end

  def source_refresh_advisory(conn, %{"match_id" => match_id}) do
    with {:ok, advisory} <- MultiSource.get_cricket_source_refresh_advisory(match_id) do
      json(conn, %{data: advisory})
    end
  end

  def trigger_source_match_fetch(conn, %{"match_id" => match_id}) do
    with {:ok, result} <- MultiSource.trigger_one_x_bet_match_fetch(match_id) do
      json(conn, %{ok: true, data: result})
    end
  end

  def inject_test_suggestion(conn, _params) do
    with {:ok, suggestion} <- MultiSource.inject_test_match_mapping_suggestion() do
      json(conn, %{data: MultiSource.suggestion_json(suggestion)})
    end
  end

  def canonical_matches(conn, params) do
    matches = MultiSource.list_canonical_matches(params)
    json(conn, %{data: Enum.map(matches, &MultiSource.canonical_match_json/1)})
  end

  def approve_suggestion(
        conn,
        %{"source_name" => source_name, "source_match_id" => source_match_id} = params
      ) do
    reviewer = Guardian.Plug.current_resource(conn)

    with {:ok, suggestion} <-
           MultiSource.approve_match_mapping_suggestion(
             source_name,
             source_match_id,
             params,
             reviewer.id
           ) do
      json(conn, %{data: MultiSource.suggestion_json(suggestion)})
    end
  end

  def reject_suggestion(
        conn,
        %{"source_name" => source_name, "source_match_id" => source_match_id} = params
      ) do
    reviewer = Guardian.Plug.current_resource(conn)

    with {:ok, suggestion} <-
           MultiSource.reject_match_mapping_suggestion(
             source_name,
             source_match_id,
             params,
             reviewer.id
           ) do
      json(conn, %{data: MultiSource.suggestion_json(suggestion)})
    end
  end

  def manual_link_suggestion(
        conn,
        %{"source_name" => source_name, "source_match_id" => source_match_id} = params
      ) do
    reviewer = Guardian.Plug.current_resource(conn)

    with {:ok, suggestion} <-
           MultiSource.manual_link_match_mapping_suggestion(
             source_name,
             source_match_id,
             params,
             reviewer.id
           ) do
      json(conn, %{data: MultiSource.suggestion_json(suggestion)})
    end
  end
end
