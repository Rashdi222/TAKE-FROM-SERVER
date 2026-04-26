defmodule Back.Tennis.FixtureCache do
  use GenServer

  alias Back.Providers.CacheMirror

  @ttl_ms 300_000
  @redis_prefix "provider_cache:tennis_fixture_cache:"

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, %{}, Keyword.put_new(opts, :name, __MODULE__))
  end

  def get(key) do
    GenServer.call(__MODULE__, {:get, key})
  end

  def put(key, value) do
    GenServer.cast(__MODULE__, {:put, key, value})
  end

  @impl true
  def init(state), do: {:ok, state}

  @impl true
  def handle_call({:get, key}, _from, state) do
    now = System.monotonic_time(:millisecond)

    case Map.get(state, key) do
      {value, expires_at} when expires_at > now ->
        {:reply, {:ok, value}, state}

      {_value, _expires_at} ->
        next_state = Map.delete(state, key)
        {reply, restored_state} = restore_from_mirror(key, now, next_state)
        {:reply, reply, restored_state}

      nil ->
        {reply, restored_state} = restore_from_mirror(key, now, state)
        {:reply, reply, restored_state}
    end
  end

  @impl true
  def handle_cast({:put, key, value}, state) do
    expires_at = System.monotonic_time(:millisecond) + @ttl_ms

    _ =
      CacheMirror.put_json(
        redis_key(key),
        %{"value" => value, "expires_at" => expires_at},
        @ttl_ms
      )

    {:noreply, Map.put(state, key, {value, expires_at})}
  end

  defp restore_from_mirror(key, now, state) do
    case CacheMirror.get_json(redis_key(key)) do
      {:ok, %{"value" => value, "expires_at" => expires_at}}
      when is_integer(expires_at) and expires_at > now ->
        {{:ok, value}, Map.put(state, key, {value, expires_at})}

      {:ok, %{"value" => value, "expires_at" => expires_at}}
      when is_float(expires_at) and trunc(expires_at) > now ->
        restored_expiry = trunc(expires_at)
        {{:ok, value}, Map.put(state, key, {value, restored_expiry})}

      _ ->
        {:miss, state}
    end
  end

  defp redis_key(key) do
    encoded =
      key
      |> :erlang.term_to_binary()
      |> Base.url_encode64(padding: false)

    @redis_prefix <> encoded
  end
end
