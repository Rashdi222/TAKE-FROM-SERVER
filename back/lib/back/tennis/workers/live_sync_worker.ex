defmodule Back.Tennis.Workers.LiveSyncWorker do
  use GenServer

  require Logger

  alias Back.Tennis.ApiClient
  alias Back.Tennis.MarginControl
  alias Back.Tennis.MarginState
  alias Back.Tennis.Normalizer
  alias Back.Tennis.StateCache
  alias Back.Tennis
  alias BackWeb.TennisChannel

  # api-tennis.com Business Plan: 200,000 requests/day
  # 2 API calls per poll (get_livescore + get_live_odds) — both are batch (all matches in 1 request)
  # At 1s: 2 × 86,400 = 172,800 calls/day = 86.4% of 200k limit ✅
  # Override via config :api_tennis_poll_ms
  @base_poll_ms Application.compile_env(:back, :api_tennis_poll_ms, 1_000)
  @websocket_connected_poll_ms 2_000
  @websocket_fallback_poll_ms 1_000
  @max_backoff_ms 120_000

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, Keyword.put_new(opts, :name, __MODULE__))
  end

  def refresh do
    GenServer.cast(__MODULE__, :refresh)
  end

  def websocket_connected do
    GenServer.cast(__MODULE__, :websocket_connected)
  end

  def websocket_disconnected do
    GenServer.cast(__MODULE__, :websocket_disconnected)
  end

  @impl true
  def init(_opts) do
    websocket_enabled? = Application.get_env(:back, :api_tennis_ws_enabled, false)

    state = %{
      poll_ms: if(websocket_enabled?, do: @websocket_fallback_poll_ms, else: @base_poll_ms),
      backoff_ms: @base_poll_ms,
      in_flight?: false,
      last_error: nil,
      task_ref: nil,
      websocket_status: if(websocket_enabled?, do: :disconnected, else: :disabled)
    }

    send(self(), :poll)
    {:ok, state}
  end

  @impl true
  def handle_cast(:refresh, state) do
    send(self(), :poll)
    {:noreply, state}
  end

  @impl true
  def handle_cast(:websocket_connected, state) do
    send(self(), :poll)

    {:noreply,
     %{
       state
       | websocket_status: :connected,
         poll_ms: @websocket_connected_poll_ms,
         backoff_ms: @websocket_connected_poll_ms
     }}
  end

  @impl true
  def handle_cast(:websocket_disconnected, state) do
    send(self(), :poll)

    {:noreply,
     %{
       state
       | websocket_status: :disconnected,
         poll_ms: @websocket_fallback_poll_ms,
         backoff_ms: @websocket_fallback_poll_ms
     }}
  end

  @impl true
  def handle_info(:poll, %{in_flight?: true} = state) do
    schedule_poll(state.poll_ms)
    {:noreply, state}
  end

  @impl true
  def handle_info(:poll, state) do
    if Process.whereis(Back.TaskSupervisor) do
      task =
        Task.Supervisor.async_nolink(Back.TaskSupervisor, fn ->
          ApiClient.fetch_live_snapshot()
        end)

      {:noreply, %{state | in_flight?: true, task_ref: task.ref}}
    else
      Logger.warning("[TENNIS] task supervisor unavailable, retrying poll")
      schedule_poll(state.poll_ms)
      {:noreply, %{state | in_flight?: false, task_ref: nil, last_error: :task_supervisor_down}}
    end
  end

  @impl true
  def handle_info({ref, {:ok, states}}, %{task_ref: ref} = state) do
    Process.demonitor(ref, [:flush])
    now_state = %{state | in_flight?: false, task_ref: nil}

    case apply_snapshot(states) do
      :ok ->
        next_poll = next_success_poll_ms(state)
        schedule_poll(next_poll)

        {:noreply,
         %{
           now_state
           | poll_ms: next_poll,
             backoff_ms: next_poll,
             last_error: nil
         }}

      {:error, reason} ->
        Logger.warning("[TENNIS] snapshot apply failed #{inspect(reason)}")
        schedule_poll(state.poll_ms)
        {:noreply, %{now_state | last_error: reason}}
    end
  end

  @impl true
  def handle_info({ref, {:error, {:rate_limited, _status}} = error}, %{task_ref: ref} = state) do
    Process.demonitor(ref, [:flush])
    next_state = apply_backoff(state, error, "[TENNIS] rate limited, backing off")
    {:noreply, next_state}
  end

  @impl true
  def handle_info(
        {ref, {:error, {:service_unavailable, _status}} = error},
        %{task_ref: ref} = state
      ) do
    Process.demonitor(ref, [:flush])
    next_state = apply_backoff(state, error, "[TENNIS] provider unavailable, backing off")
    {:noreply, next_state}
  end

  @impl true
  def handle_info({ref, {:error, reason}}, %{task_ref: ref} = state) do
    Process.demonitor(ref, [:flush])

    case reason do
      :missing_api_tennis_key ->
        next_state =
          apply_backoff(state, reason, "[TENNIS] provider key missing, polling paused", :info)

        {:noreply, next_state}

      :subscription_required ->
        next_state =
          apply_backoff(
            state,
            reason,
            "[TENNIS] subscription required (code 1006), polling backed off",
            :warning
          )

        {:noreply, next_state}

      _ ->
        Logger.warning("[TENNIS] live sync error #{inspect(reason)}")
        schedule_poll(state.poll_ms)
        {:noreply, %{state | in_flight?: false, task_ref: nil, last_error: reason}}
    end
  end

  @impl true
  def handle_info({:DOWN, ref, :process, _pid, reason}, %{task_ref: ref} = state) do
    Logger.warning("[TENNIS] live sync task crashed #{inspect(reason)}")
    schedule_poll(state.poll_ms)
    {:noreply, %{state | in_flight?: false, task_ref: nil, last_error: reason}}
  end

  defp apply_backoff(state, error, message, level \\ :warning) do
    floor_poll = current_floor_poll_ms(state)
    next_poll = min(max(state.backoff_ms * 2, floor_poll), @max_backoff_ms)
    log(level, "#{message} next_poll_ms=#{next_poll}")
    schedule_poll(next_poll)

    %{
      state
      | in_flight?: false,
        task_ref: nil,
        poll_ms: next_poll,
        backoff_ms: next_poll,
        last_error: error
    }
  end

  defp schedule_poll(delay_ms) do
    Process.send_after(self(), :poll, delay_ms)
  end

  defp next_success_poll_ms(%{websocket_status: :connected}), do: @websocket_connected_poll_ms
  defp next_success_poll_ms(%{websocket_status: :disconnected}), do: @websocket_fallback_poll_ms
  defp next_success_poll_ms(_), do: @base_poll_ms

  defp current_floor_poll_ms(%{websocket_status: :connected}), do: @websocket_connected_poll_ms
  defp current_floor_poll_ms(%{websocket_status: :disconnected}), do: @websocket_fallback_poll_ms
  defp current_floor_poll_ms(_), do: @base_poll_ms

  defp log(:info, message), do: Logger.info(message)
  defp log(:warning, message), do: Logger.warning(message)

  defp apply_snapshot(states) when is_list(states) do
    try do
      margin = safe_margin()

      normalized_states =
        Enum.map(states, fn raw_state ->
          published_odds =
            (raw_state.raw_live_odds || [])
            |> Enum.map(&MarginControl.apply_to_odds(&1, margin))

          raw_state
          |> Map.put(:published_odds, published_odds)
          |> Normalizer.normalize_match_state()
        end)

      if Process.whereis(StateCache) do
        StateCache.replace_states(normalized_states)
      end

      Tennis.sync_live_market_persistence(normalized_states)
      Enum.each(normalized_states, &TennisChannel.broadcast_state_updated/1)
      :ok
    rescue
      error -> {:error, {:exception, error, __STACKTRACE__}}
    catch
      :exit, reason -> {:error, {:exit, reason}}
    end
  end

  defp safe_margin do
    try do
      MarginState.get_margin()
    catch
      :exit, _ -> "0.04"
    end
  end
end
