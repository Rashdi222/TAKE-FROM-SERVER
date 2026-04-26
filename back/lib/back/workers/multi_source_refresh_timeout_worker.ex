defmodule Back.Workers.MultiSourceRefreshTimeoutWorker do
  use Oban.Worker, queue: :data_feeds, max_attempts: 3

  require Logger

  alias Back.MultiSource

  @impl Oban.Worker
  def perform(%Oban.Job{args: args}) do
    timeout_seconds = parse_timeout(args["timeout_seconds"])
    result = MultiSource.expire_stuck_source_refresh_requests(timeout_seconds: timeout_seconds)

    {:ok, _} =
      MultiSource.store_automation_status("multi_source_refresh_timeout_status", %{
        ran_at: DateTime.utc_now(),
        timeout_seconds: timeout_seconds,
        result: result
      })

    if result.timed_out > 0 do
      Logger.warning(
        "MultiSourceRefreshTimeoutWorker timed_out=#{result.timed_out} timeout_seconds=#{timeout_seconds}"
      )
    end

    :ok
  rescue
    error ->
      Logger.error("MultiSourceRefreshTimeoutWorker failed: #{Exception.message(error)}")
      {:error, error}
  end

  defp parse_timeout(nil), do: 120
  defp parse_timeout(value) when is_integer(value) and value > 0, do: min(value, 1800)

  defp parse_timeout(value) when is_binary(value) do
    case Integer.parse(value) do
      {int, ""} when int > 0 -> min(int, 1800)
      _ -> 120
    end
  end

  defp parse_timeout(_), do: 120
end
