defmodule Back.Workers.SportsDataBackfillWorker do
  use Oban.Worker, queue: :data_feeds, max_attempts: 3

  alias Back.SportsData
  alias Back.SportsProviders.{ApiTennis, BetsApi, Goalserve}

  @impl Oban.Worker
  def perform(%Oban.Job{args: %{"provider" => "api_tennis"} = args}) do
    with {:ok, date_start} <- parse_date(args["date_start"]),
         {:ok, date_stop} <- parse_date(args["date_stop"]),
         {:ok, events} <-
           ApiTennis.fetch_fixtures(%{"date_start" => date_start, "date_stop" => date_stop}),
         {:ok, result} <- SportsData.upsert_events(events) do
      SportsData.log_sync(%{
        provider: :api_tennis,
        source: "backfill:api_tennis",
        status: if(result.failed_count == 0, do: :success, else: :partial),
        fetched_count: length(events),
        upserted_count: result.upserted_count,
        failed_count: result.failed_count,
        metadata: %{
          "date_start" => Date.to_string(date_start),
          "date_stop" => Date.to_string(date_stop)
        }
      })

      :ok
    end
  end

  def perform(%Oban.Job{args: %{"provider" => "goalserve"} = args}) do
    with {:ok, date} <- parse_date(args["date"]),
         {:ok, events} <-
           Goalserve.get_results(date, %{timezone: args["timezone"] || "Europe/London"}),
         {:ok, result} <- SportsData.upsert_events(events) do
      SportsData.log_sync(%{
        provider: :goalserve,
        source: "backfill:goalserve",
        status: if(result.failed_count == 0, do: :success, else: :partial),
        fetched_count: length(events),
        upserted_count: result.upserted_count,
        failed_count: result.failed_count,
        metadata: %{"date" => Date.to_string(date)}
      })

      :ok
    end
  end

  def perform(%Oban.Job{args: %{"provider" => "betsapi"} = args}) do
    page = parse_page(args["page"])

    with {:ok, events} <- BetsApi.get_events(:ended, 78, page),
         {:ok, result} <- SportsData.upsert_events(events) do
      SportsData.log_sync(%{
        provider: :betsapi,
        source: "backfill:betsapi",
        status: if(result.failed_count == 0, do: :success, else: :partial),
        fetched_count: length(events),
        upserted_count: result.upserted_count,
        failed_count: result.failed_count,
        metadata: %{"page" => page}
      })

      :ok
    end
  end

  def perform(%Oban.Job{}), do: {:error, :invalid_backfill_payload}

  defp parse_date(value) when is_binary(value) do
    case Date.from_iso8601(value) do
      {:ok, date} -> {:ok, date}
      _ -> {:error, :invalid_date}
    end
  end

  defp parse_date(_), do: {:error, :invalid_date}

  defp parse_page(value) when is_integer(value) and value > 0, do: value

  defp parse_page(value) when is_binary(value) do
    case Integer.parse(value) do
      {v, ""} when v > 0 -> v
      _ -> 1
    end
  end

  defp parse_page(_), do: 1
end
