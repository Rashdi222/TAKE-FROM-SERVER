defmodule BackWeb.SportsDataController do
  use BackWeb, :controller

  action_fallback BackWeb.FallbackController

  alias Back.SportsData
  alias Back.Workers.{SportsDataBackfillWorker, SportsDataReplayWorker}

  # GET /api/super-admin/sports-data/events
  def events(conn, params) do
    rows = SportsData.list_events(params)

    json(conn, %{
      data:
        Enum.map(rows, fn e ->
          %{
            id: e.id,
            provider: e.provider,
            provider_event_id: e.provider_event_id,
            sport: e.sport,
            competition_name: e.competition_name,
            status: e.status,
            start_time_utc: e.start_time_utc,
            participants: e.participants,
            result: e.result,
            inserted_at: e.inserted_at,
            updated_at: e.updated_at
          }
        end)
    })
  end

  # GET /api/super-admin/sports-data/sync-logs
  def sync_logs(conn, params) do
    rows = SportsData.list_recent_sync_logs(params)

    json(conn, %{
      data:
        Enum.map(rows, fn l ->
          %{
            id: l.id,
            provider: l.provider,
            source: l.source,
            status: l.status,
            fetched_count: l.fetched_count,
            upserted_count: l.upserted_count,
            failed_count: l.failed_count,
            error: l.error,
            metadata: l.metadata,
            inserted_at: l.inserted_at
          }
        end)
    })
  end

  # GET /api/super-admin/sports-data/rejections
  def rejections(conn, params) do
    rows = SportsData.list_rejections(params)

    json(conn, %{
      data:
        Enum.map(rows, fn r ->
          %{
            id: r.id,
            provider: r.provider,
            provider_event_id: r.provider_event_id,
            source: r.source,
            reason: r.reason,
            diagnostics: r.diagnostics,
            replay_status: r.replay_status,
            replayed_at: r.replayed_at,
            inserted_at: r.inserted_at
          }
        end)
    })
  end

  # POST /api/super-admin/sports-data/backfill
  def backfill(conn, params) do
    with {:ok, job} <- Oban.insert(SportsDataBackfillWorker.new(params)) do
      json(conn, %{data: %{queued: true, job_id: job.id}})
    end
  end

  # POST /api/super-admin/sports-data/replay-rejections
  def replay_rejections(conn, params) do
    with {:ok, job} <- Oban.insert(SportsDataReplayWorker.new(params)) do
      json(conn, %{data: %{queued: true, job_id: job.id}})
    end
  end
end
