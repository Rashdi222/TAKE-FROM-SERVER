defmodule Back.Tennis.TrackedMatches do
  use GenServer

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, %{}, Keyword.put_new(opts, :name, __MODULE__))
  end

  def list do
    GenServer.call(__MODULE__, :list)
  end

  def tracked?(event_key) when is_binary(event_key) do
    GenServer.call(__MODULE__, {:tracked?, event_key})
  end

  def track(event_key, metadata \\ %{}) when is_binary(event_key) and is_map(metadata) do
    GenServer.call(__MODULE__, {:track, event_key, metadata})
  end

  def untrack(event_key) when is_binary(event_key) do
    GenServer.call(__MODULE__, {:untrack, event_key})
  end

  def publish(event_key) when is_binary(event_key) do
    GenServer.call(__MODULE__, {:publish, event_key})
  end

  def unpublish(event_key) when is_binary(event_key) do
    GenServer.call(__MODULE__, {:unpublish, event_key})
  end

  @impl true
  def init(state), do: {:ok, state}

  @impl true
  def handle_call(:list, _from, state) do
    rows =
      state
      |> Enum.map(fn {event_key, metadata} -> Map.put(metadata, :event_key, event_key) end)
      |> Enum.sort_by(&Map.get(&1, :inserted_at, 0), {:desc, DateTime})

    {:reply, rows, state}
  end

  @impl true
  def handle_call({:tracked?, event_key}, _from, state) do
    {:reply, Map.has_key?(state, event_key), state}
  end

  @impl true
  def handle_call({:track, event_key, metadata}, _from, state) do
    existing = Map.get(state, event_key, %{})

    entry =
      existing
      |> Map.merge(
        metadata
        |> stringify_map_keys()
        |> Map.put_new("inserted_at", DateTime.utc_now())
      )
      |> Map.put_new("published", false)

    {:reply, :ok, Map.put(state, event_key, entry)}
  end

  @impl true
  def handle_call({:untrack, event_key}, _from, state) do
    {:reply, :ok, Map.delete(state, event_key)}
  end

  @impl true
  def handle_call({:publish, event_key}, _from, state) do
    case Map.fetch(state, event_key) do
      {:ok, metadata} ->
        {:reply, :ok, Map.put(state, event_key, Map.put(metadata, "published", true))}

      :error ->
        {:reply, {:error, :not_tracked}, state}
    end
  end

  @impl true
  def handle_call({:unpublish, event_key}, _from, state) do
    case Map.fetch(state, event_key) do
      {:ok, metadata} ->
        {:reply, :ok, Map.put(state, event_key, Map.put(metadata, "published", false))}

      :error ->
        {:reply, {:error, :not_tracked}, state}
    end
  end

  defp stringify_map_keys(map) do
    Map.new(map, fn
      {key, value} when is_atom(key) -> {Atom.to_string(key), value}
      {key, value} -> {key, value}
    end)
  end
end
