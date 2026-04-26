defmodule Back.Football.ApiSports.ContextCache do
  @moduledoc false

  @table :football_api_sports_context_cache

  def get(key, ttl_ms) do
    ensure_table()

    case :ets.lookup(@table, key) do
      [{^key, value, inserted_at}] when is_integer(inserted_at) ->
        if System.monotonic_time(:millisecond) - inserted_at < ttl_ms do
          {:ok, value}
        else
          :miss
        end

      _ ->
        :miss
    end
  end

  def put(key, value) do
    ensure_table()
    :ets.insert(@table, {key, value, System.monotonic_time(:millisecond)})
    :ok
  end

  defp ensure_table do
    case :ets.whereis(@table) do
      :undefined -> :ets.new(@table, [:named_table, :public, :set, read_concurrency: true])
      _ -> @table
    end
  end
end
