defmodule Back.Live.CricketRepriceQueue do
  @moduledoc false

  alias Back.Betting.Match
  alias Back.Live.CricketMatchWorker
  alias Back.State.MatchLiveEvent

  @spec enqueue(Match.t(), MatchLiveEvent.t(), map()) :: :ok
  def enqueue(%Match{} = match, %MatchLiveEvent{} = live_event, decision) when is_map(decision) do
    if enabled?() do
      ensure_worker(match.id)

      CricketMatchWorker.enqueue(%{
        match: match,
        live_event: live_event,
        decision: decision,
        identity: %{
          match_id: match.id,
          state_version: live_event.state_version || match.live_state_version,
          event_seq: live_event.event_seq || match.live_event_seq,
          provider_event_id: live_event.provider_event_id,
          event_type: live_event.event_type
        }
      })
    else
      :ok
    end
  end

  defp ensure_worker(match_id) do
    case Registry.lookup(Back.Live.CricketMatchWorkerRegistry, match_id) do
      [{_pid, _value}] ->
        :ok

      [] ->
        case DynamicSupervisor.start_child(
               Back.Live.CricketMatchWorkerSupervisor,
               {CricketMatchWorker, match_id}
             ) do
          {:ok, _pid} -> :ok
          {:error, {:already_started, _pid}} -> :ok
          {:error, :already_present} -> :ok
          _ -> :ok
        end
    end
  end

  defp enabled? do
    Application.get_env(:back, :cricket_reprice_queue_enabled, true)
  end
end
