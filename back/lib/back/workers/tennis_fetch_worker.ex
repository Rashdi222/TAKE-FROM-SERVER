defmodule Back.Workers.TennisFetchWorker do
  use Oban.Worker, queue: :data_feeds, max_attempts: 5

  require Logger

  alias Back.SportsData
  alias Back.SportsProviders.ApiTennis

  @source "oban:tennis_fetch"
  @provider_atom :api_tennis
  @default_min_delay_ms 200

  @impl Oban.Worker
  def perform(%Oban.Job{args: args}) do
    today = Date.utc_today()
    tomorrow = Date.add(today, 1)

    with {:ok, live_events} <- ApiTennis.fetch_live(args),
         :ok <- short_delay(),
         {:ok, fixture_events} <-
           ApiTennis.fetch_fixtures(
             Map.merge(args, %{"date_start" => today, "date_stop" => tomorrow})
           ),
         {:ok, result} <- SportsData.upsert_events(dedupe(live_events ++ fixture_events)) do
      _ =
        SportsData.log_sync(%{
          provider: @provider_atom,
          source: @source,
          status: if(result.failed_count == 0, do: :success, else: :partial),
          fetched_count: length(live_events) + length(fixture_events),
          upserted_count: result.upserted_count,
          failed_count: result.failed_count,
          metadata: %{
            "live_count" => length(live_events),
            "fixture_count" => length(fixture_events)
          }
        })

      :ok
    else
      {:error, reason} = error ->
        _ =
          SportsData.log_sync(%{
            provider: @provider_atom,
            source: @source,
            status: :failure,
            error: inspect(reason),
            metadata: %{"job_args" => args}
          })

        Logger.error("TennisFetchWorker failed: #{inspect(reason)}")
        error
    end
  end

  defp dedupe(events) do
    events
    |> Enum.reduce(%{}, fn event, acc ->
      key = {event.provider, event.provider_event_id}
      Map.put(acc, key, event)
    end)
    |> Map.values()
  end

  defp short_delay do
    Process.sleep(@default_min_delay_ms)
    :ok
  end
end
