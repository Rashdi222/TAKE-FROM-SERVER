defmodule BackWeb.GoalserveWebhookController do
  use BackWeb, :controller

  action_fallback BackWeb.FallbackController

  alias Back.SportsData
  alias Back.SportsProviders.Goalserve

  def create(conn, payload) when is_map(payload) do
    with {:ok, event} <- Goalserve.normalize_webhook_event(payload),
         {:ok, _saved} <- SportsData.upsert_event(event) do
      _ =
        SportsData.log_sync(%{
          provider: :goalserve,
          source: "webhook:goalserve",
          status: :success,
          fetched_count: 1,
          upserted_count: 1,
          failed_count: 0,
          metadata: %{"event_id" => event.provider_event_id}
        })

      json(conn, %{data: %{accepted: true, provider_event_id: event.provider_event_id}})
    else
      {:error, reason} = error ->
        _ =
          SportsData.log_sync(%{
            provider: :goalserve,
            source: "webhook:goalserve",
            status: :failure,
            fetched_count: 1,
            upserted_count: 0,
            failed_count: 1,
            error: inspect(reason),
            metadata: %{"payload" => payload}
          })

        error
    end
  end
end
