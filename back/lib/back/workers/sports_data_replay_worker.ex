defmodule Back.Workers.SportsDataReplayWorker do
  use Oban.Worker, queue: :data_feeds, max_attempts: 3

  alias Back.SportsData

  @impl Oban.Worker
  def perform(%Oban.Job{args: args}) do
    limit = parse_limit(args["limit"])

    rejections = SportsData.list_rejections(%{"replay_status" => "pending", "limit" => limit})

    Enum.each(rejections, fn rejection ->
      case SportsData.upsert_event(rejection.payload) do
        {:ok, _event} ->
          _ = SportsData.mark_rejection_replayed(rejection, :replayed)

        {:error, _reason} ->
          _ = SportsData.mark_rejection_replayed(rejection, :failed)
      end
    end)

    :ok
  end

  defp parse_limit(nil), do: 100
  defp parse_limit(v) when is_integer(v) and v > 0, do: min(v, 1000)

  defp parse_limit(v) when is_binary(v) do
    case Integer.parse(v) do
      {int, ""} when int > 0 -> min(int, 1000)
      _ -> 100
    end
  end

  defp parse_limit(_), do: 100
end
