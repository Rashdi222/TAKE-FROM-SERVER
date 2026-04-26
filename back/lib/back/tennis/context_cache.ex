defmodule Back.Tennis.ContextCache do
  use GenServer

  @ttl_ms 15 * 60 * 1_000

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, %{}, Keyword.put_new(opts, :name, __MODULE__))
  end

  def get(event_key) when is_binary(event_key) do
    GenServer.call(__MODULE__, {:get, event_key})
  end

  def put(event_key, context) when is_binary(event_key) and is_map(context) do
    GenServer.cast(__MODULE__, {:put, event_key, context})
  end

  @impl true
  def init(state), do: {:ok, state}

  @impl true
  def handle_call({:get, event_key}, _from, state) do
    now = System.monotonic_time(:millisecond)

    reply =
      case Map.get(state, event_key) do
        %{context: context, expires_at: expires_at} when expires_at > now -> {:ok, context}
        _ -> :miss
      end

    {:reply, reply, state}
  end

  @impl true
  def handle_cast({:put, event_key, context}, state) do
    now = System.monotonic_time(:millisecond)
    next = Map.put(state, event_key, %{context: context, expires_at: now + @ttl_ms})
    {:noreply, next}
  end
end
