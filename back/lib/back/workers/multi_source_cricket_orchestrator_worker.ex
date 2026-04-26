defmodule Back.Workers.MultiSourceCricketOrchestratorWorker do
  use Oban.Worker, queue: :data_feeds, max_attempts: 3

  require Logger

  alias Back.Live.CricketRuntimeConfig
  alias Back.MultiSource

  @impl Oban.Worker
  def perform(%Oban.Job{args: args}) do
    limit = parse_limit(args["limit"])
    mapping_limit = parse_limit(args["mapping_limit"])
    refresh_result = MultiSource.automate_cricket_source_refreshes(limit: limit)
    mapping_result = MultiSource.automate_live_cricket_suggestion_mappings(limit: mapping_limit)
    runtime = CricketRuntimeConfig.resolve()

    {:ok, _} =
      MultiSource.store_automation_status("multi_source_cricket_orchestrator_status", %{
        ran_at: DateTime.utc_now(),
        ai_enabled: runtime.llm_enabled,
        ai_model: runtime.model,
        refresh_result: refresh_result,
        mapping_result: mapping_result
      })

    Logger.info(
      "MultiSourceCricketOrchestratorWorker refresh_requested=#{refresh_result.requested} refresh_failed=#{refresh_result.failed} auto_confirmed=#{mapping_result.auto_confirmed} mapping_failed=#{mapping_result.failed}"
    )

    :ok
  rescue
    error ->
      Logger.error("MultiSourceCricketOrchestratorWorker failed: #{Exception.message(error)}")
      {:error, error}
  end

  defp parse_limit(nil), do: 12
  defp parse_limit(value) when is_integer(value) and value > 0, do: min(value, 50)

  defp parse_limit(value) when is_binary(value) do
    case Integer.parse(value) do
      {int, ""} when int > 0 -> min(int, 50)
      _ -> 12
    end
  end

  defp parse_limit(_), do: 12
end
