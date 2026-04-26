defmodule Back.Workers.GreyhoundFetchWorker do
  use Oban.Worker, queue: :data_feeds, max_attempts: 5

  require Logger

  alias Back.SportsData
  alias Back.SportsProviders.BetsApi

  @source "oban:greyhound_fetch"
  @provider_atom :betsapi
  @default_min_delay_ms 200
  @missing_config_warn_every_s 600
  @warn_key {:betsapi, :missing_config_warned_at}

  @impl Oban.Worker
  def perform(%Oban.Job{args: args}) do
    if BetsApi.configured?() do
      with {:ok, live_events} <- BetsApi.fetch_live(args),
           :ok <- short_delay(),
           {:ok, upcoming_events} <- BetsApi.fetch_fixtures(args),
           {:ok, result} <- SportsData.upsert_events(dedupe(live_events ++ upcoming_events)) do
        _ =
          SportsData.log_sync(%{
            provider: @provider_atom,
            source: @source,
            status: if(result.failed_count == 0, do: :success, else: :partial),
            fetched_count: length(live_events) + length(upcoming_events),
            upserted_count: result.upserted_count,
            failed_count: result.failed_count,
            metadata: %{
              "live_count" => length(live_events),
              "upcoming_count" => length(upcoming_events)
            }
          })

        :ok
      else
        {:error, {:rate_limited, reset_at}} ->
          _ =
            SportsData.log_sync(%{
              provider: @provider_atom,
              source: @source,
              status: :failure,
              error: "rate_limited",
              metadata: %{"reset_at" => reset_at}
            })

          {:snooze, snooze_seconds(reset_at)}

        {:error, reason} = error ->
          _ =
            SportsData.log_sync(%{
              provider: @provider_atom,
              source: @source,
              status: :failure,
              error: inspect(reason),
              metadata: %{"job_args" => args}
            })

          Logger.error("GreyhoundFetchWorker failed: #{inspect(reason)}")
          error
      end
    else
      maybe_warn_missing_config()
      :ok
    end
  end

  defp snooze_seconds(reset_at) when is_integer(reset_at) do
    now = System.system_time(:second)
    max(reset_at - now + 1, 5)
  end

  defp snooze_seconds(_), do: 60

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

  defp maybe_warn_missing_config do
    now = System.system_time(:second)

    last =
      case :persistent_term.get(@warn_key, nil) do
        v when is_integer(v) -> v
        _ -> 0
      end

    if now - last >= @missing_config_warn_every_s do
      :persistent_term.put(@warn_key, now)
      Logger.warning("GreyhoundFetchWorker skipped: BETSAPI_TOKEN is not set")
    end
  end
end
