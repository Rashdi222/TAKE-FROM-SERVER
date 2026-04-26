defmodule Back.Tennis.StateCache do
  use GenServer

  alias Back.Tennis.MatchState

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, %{}, Keyword.put_new(opts, :name, __MODULE__))
  end

  def put_states(states) when is_list(states) do
    GenServer.cast(__MODULE__, {:put_states, states})
  end

  def replace_states(states) when is_list(states) do
    GenServer.cast(__MODULE__, {:replace_states, states})
  end

  def put_state(%MatchState{} = state) do
    GenServer.cast(__MODULE__, {:put_state, state})
  end

  def list_states do
    GenServer.call(__MODULE__, :list_states)
  end

  def get_state(event_key) when is_binary(event_key) do
    GenServer.call(__MODULE__, {:get_state, event_key})
  end

  @impl true
  def init(state), do: {:ok, state}

  @impl true
  def handle_cast({:put_states, states}, cache) do
    merged =
      Enum.reduce(states, cache, fn
        %MatchState{event_key: event_key} = state, acc when is_binary(event_key) ->
          Map.put(acc, event_key, state)

        _, acc ->
          acc
      end)

    {:noreply, merged}
  end

  @impl true
  def handle_cast({:replace_states, states}, _cache) do
    replaced =
      Enum.reduce(states, %{}, fn
        %MatchState{event_key: event_key} = state, acc when is_binary(event_key) ->
          Map.put(acc, event_key, state)

        _, acc ->
          acc
      end)

    {:noreply, replaced}
  end

  @impl true
  def handle_cast({:put_state, %MatchState{event_key: event_key} = state}, cache)
      when is_binary(event_key) do
    {:noreply, Map.put(cache, event_key, state)}
  end

  @impl true
  def handle_call(:list_states, _from, cache) do
    {:reply, Map.values(cache), cache}
  end

  @impl true
  def handle_call({:get_state, event_key}, _from, cache) do
    {:reply, Map.get(cache, event_key), cache}
  end
end
