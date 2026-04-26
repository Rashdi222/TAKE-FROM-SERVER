defmodule Back.Workers.MultiSourceMatchmakerPruneWorker do
  use Oban.Worker, queue: :data_feeds, max_attempts: 3

  require Logger

  alias Back.MultiSource

  @impl Oban.Worker
  def perform(%Oban.Job{}) do
    {:ok, %{deleted_count: deleted_count}} = MultiSource.prune_invalid_matchmaker_suggestions()

    {:ok, _} =
      MultiSource.store_automation_status("multi_source_matchmaker_prune_status", %{
        ran_at: DateTime.utc_now(),
        deleted_count: deleted_count
      })

    if deleted_count > 0 do
      Logger.info("MultiSourceMatchmakerPruneWorker deleted_count=#{deleted_count}")
    end

    :ok
  end
end
