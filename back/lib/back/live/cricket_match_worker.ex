defmodule Back.Live.CricketMatchWorker do
  @moduledoc false

  use GenServer
  require Logger

  alias Back.Betting.Match
  alias Back.Live.CricketRepriceExecutor
  alias Back.Live.CricketRuntimeConfig
  alias Back.State.MatchLiveEvent

  @type queue_request :: %{
          match: Match.t(),
          live_event: MatchLiveEvent.t(),
          decision: map(),
          identity: %{
            match_id: Ecto.UUID.t(),
            state_version: integer(),
            event_seq: integer(),
            provider_event_id: String.t() | nil,
            event_type: String.t() | nil
          }
        }

  @timeout_buffer_ms 750

  def start_link(match_id) when is_binary(match_id) do
    GenServer.start_link(__MODULE__, match_id, name: via(match_id))
  end

  def via(match_id), do: {:via, Registry, {Back.Live.CricketMatchWorkerRegistry, match_id}}

  @spec enqueue(queue_request()) :: :ok
  def enqueue(%{identity: %{match_id: match_id}} = request) when is_binary(match_id) do
    GenServer.cast(via(match_id), {:enqueue, request})
  end

  @impl true
  def init(match_id) do
    {:ok,
     %{
       match_id: match_id,
       running: nil,
       pending: nil,
       timeout_ref: nil
     }}
  end

  @impl true
  def handle_cast({:enqueue, request}, state) do
    request = ensure_request_identity(request, state.match_id)

    cond do
      stale_or_duplicate?(request, state.running) ->
        {:noreply, state}

      stale_or_duplicate?(request, state.pending) ->
        {:noreply, state}

      state.running == nil ->
        {:noreply, start_request(state, request)}

      true ->
        {:noreply, %{state | pending: choose_latest(state.pending, request)}}
    end
  end

  @impl true
  def handle_info(
        {ref, {:error, :unrecoverable_anomaly}},
        %{running: %{task_ref: ref, request: request}} = state
      ) do
    Process.demonitor(ref, [:flush])
    clear_timeout(state.timeout_ref)

    _ =
      Back.State.MarketManager.keep_match_suspended(request.match.id, "unrecoverable_anomaly", %{
        "engine_error" => "self_heal_exhausted",
        "event_type" => request.live_event.event_type,
        "event_seq" => request.live_event.event_seq,
        "state_version" => request.live_event.state_version
      })

    Logger.error(
      "[SELF_HEAL] match worker suspended all markets for match #{request.match.id} after unrecoverable anomaly event_seq=#{request.live_event.event_seq}"
    )

    {:noreply, state |> finish_running() |> maybe_start_pending()}
  end

  def handle_info({ref, _result}, %{running: %{task_ref: ref}} = state) do
    Process.demonitor(ref, [:flush])
    clear_timeout(state.timeout_ref)
    {:noreply, state |> finish_running() |> maybe_start_pending()}
  end

  def handle_info({:DOWN, ref, :process, _pid, _reason}, %{running: %{task_ref: ref}} = state) do
    clear_timeout(state.timeout_ref)
    {:noreply, state |> finish_running() |> maybe_start_pending()}
  end

  def handle_info(
        {:task_timeout, ref},
        %{running: %{task_ref: ref, request: request, task_pid: pid}} = state
      ) do
    Process.exit(pid, :kill)

    meta = %{
      "engine_error" => "queue_timeout",
      "event_type" => request.live_event.event_type,
      "event_seq" => request.live_event.event_seq,
      "state_version" => request.live_event.state_version
    }

    _ =
      if Back.State.MarketManager.published_platform_quotes_exist?(request.match.id) do
        Back.State.MarketManager.resume_match(
          request.match.id,
          Map.put(meta, "board_preserved", true)
        )
      else
        Back.State.MarketManager.keep_match_suspended(
          request.match.id,
          "ai_engine_unavailable",
          meta
        )
      end

    {:noreply, state |> finish_running() |> maybe_start_pending()}
  end

  def handle_info(_message, state), do: {:noreply, state}

  defp start_request(state, request) do
    if request.decision[:simulation_mode] == true or request.decision["simulation_mode"] == true do
      scenario = request.decision[:simulation_scenario] || request.decision["simulation_scenario"]

      Logger.info(
        "[SIMULATION] match worker processing scenario=#{scenario} match_id=#{request.match.id} event_seq=#{request.live_event.event_seq}"
      )
    end

    task =
      Task.Supervisor.async_nolink(Back.TaskSupervisor, fn ->
        CricketRepriceExecutor.execute(request.match, request.live_event, request.decision)
      end)

    timeout_ms = CricketRuntimeConfig.resolve().request_timeout_ms + @timeout_buffer_ms
    timeout_ref = Process.send_after(self(), {:task_timeout, task.ref}, timeout_ms)

    %{
      state
      | running: %{request: request, task_pid: task.pid, task_ref: task.ref},
        timeout_ref: timeout_ref
    }
  end

  defp maybe_start_pending(%{pending: nil} = state), do: %{state | timeout_ref: nil}

  defp maybe_start_pending(%{pending: pending} = state) do
    state
    |> Map.put(:pending, nil)
    |> start_request(pending)
  end

  defp finish_running(state) do
    %{state | running: nil, timeout_ref: nil}
  end

  defp clear_timeout(nil), do: :ok
  defp clear_timeout(ref), do: Process.cancel_timer(ref, async: false, info: false)

  defp choose_latest(nil, request), do: request

  defp choose_latest(existing, candidate) do
    if newer?(request_identity(candidate), request_identity(existing)),
      do: candidate,
      else: existing
  end

  defp stale_or_duplicate?(_request, nil), do: false

  defp stale_or_duplicate?(request, existing) do
    not newer?(request_identity(request), request_identity(existing))
  end

  defp newer?(left, right) do
    compare_identity(left, right) == :gt
  end

  defp compare_identity(
         %{
           state_version: ls,
           event_seq: le,
           enqueue_nonce: ln,
           provider_event_id: lpid,
           event_type: ltype
         },
         %{
           state_version: rs,
           event_seq: re,
           enqueue_nonce: rn,
           provider_event_id: rpid,
           event_type: rtype
         }
       ) do
    cond do
      ls > rs -> :gt
      ls < rs -> :lt
      le > re -> :gt
      le < re -> :lt
      lpid != nil and rpid != nil and lpid == rpid and ltype == rtype -> :eq
      ln > rn -> :gt
      ln < rn -> :lt
      true -> :eq
    end
  end

  defp compare_identity(%{state_version: ls, event_seq: le}, %{state_version: rs, event_seq: re}) do
    cond do
      ls > rs -> :gt
      ls < rs -> :lt
      le > re -> :gt
      le < re -> :lt
      true -> :eq
    end
  end

  defp ensure_request_identity(request, fallback_match_id) when is_map(request) do
    Map.put_new_lazy(request, :identity, fn ->
      live_event = request[:live_event] || %{}

      %{
        match_id: get_in(request, [:match, :id]) || fallback_match_id,
        state_version: integer_or_zero(live_event[:state_version] || live_event["state_version"]),
        event_seq: integer_or_zero(live_event[:event_seq] || live_event["event_seq"]),
        provider_event_id: text_or_nil(live_event[:provider_event_id] || live_event["provider_event_id"]),
        event_type: text_or_nil(live_event[:event_type] || live_event["event_type"]),
        enqueue_nonce: System.unique_integer([:positive, :monotonic])
      }
    end)
  end

  defp ensure_request_identity(request, _fallback_match_id), do: request

  defp request_identity(request) when is_map(request) do
    request
    |> Map.get(:identity, %{})
    |> normalize_identity()
  end

  defp request_identity(_), do: normalize_identity(%{})

  defp normalize_identity(identity) when is_map(identity) do
    %{
      state_version:
        integer_or_zero(Map.get(identity, :state_version) || Map.get(identity, "state_version")),
      event_seq: integer_or_zero(Map.get(identity, :event_seq) || Map.get(identity, "event_seq")),
      provider_event_id:
        text_or_nil(Map.get(identity, :provider_event_id) || Map.get(identity, "provider_event_id")),
      event_type: text_or_nil(Map.get(identity, :event_type) || Map.get(identity, "event_type")),
      enqueue_nonce:
        integer_or_zero(Map.get(identity, :enqueue_nonce) || Map.get(identity, "enqueue_nonce"))
    }
  end

  defp normalize_identity(_),
    do: %{
      state_version: 0,
      event_seq: 0,
      provider_event_id: nil,
      event_type: nil,
      enqueue_nonce: 0
    }

  defp integer_or_zero(value) when is_integer(value), do: value

  defp integer_or_zero(value) when is_binary(value) do
    case Integer.parse(value) do
      {parsed, _} -> parsed
      _ -> 0
    end
  end

  defp integer_or_zero(_), do: 0

  defp text_or_nil(value) when is_binary(value) do
    case String.trim(value) do
      "" -> nil
      trimmed -> trimmed
    end
  end

  defp text_or_nil(value) when is_atom(value), do: value |> Atom.to_string() |> text_or_nil()
  defp text_or_nil(value) when is_integer(value), do: Integer.to_string(value)
  defp text_or_nil(_), do: nil
end
