defmodule Back.Providers.CacheMirror do
  @moduledoc false

  def enabled? do
    Application.get_env(:back, :provider_cache_redis_enabled, true)
  end

  def get_json(key) when is_binary(key) do
    if enabled?() do
      with {:ok, connection} <- connect() do
        try do
          case Redix.command(connection, ["GET", key]) do
            {:ok, nil} -> {:error, :not_found}
            {:ok, payload} when is_binary(payload) -> Jason.decode(payload)
            {:error, reason} -> {:error, reason}
          end
        after
          GenServer.stop(connection, :normal)
        end
      end
    else
      {:error, :disabled}
    end
  end

  def put_json(key, payload, ttl_ms)
      when is_binary(key) and is_integer(ttl_ms) and ttl_ms > 0 do
    if enabled?() do
      with {:ok, connection} <- connect() do
        encoded = Jason.encode!(sanitize_for_json(payload))

        try do
          case Redix.command(connection, ["PSETEX", key, Integer.to_string(ttl_ms), encoded]) do
            {:ok, _} -> :ok
            {:error, reason} -> {:error, reason}
          end
        after
          GenServer.stop(connection, :normal)
        end
      end
    else
      :ok
    end
  end

  def put_many_json(entries) when is_list(entries) and entries == [], do: :ok

  def put_many_json(entries) when is_list(entries) do
    if enabled?() do
      with {:ok, connection} <- connect() do
        try do
          commands =
            Enum.map(entries, fn {key, payload, ttl_ms} ->
              [
                "PSETEX",
                key,
                Integer.to_string(ttl_ms),
                Jason.encode!(sanitize_for_json(payload))
              ]
            end)

          case Redix.pipeline(connection, commands) do
            {:ok, _} -> :ok
            {:error, reason} -> {:error, reason}
          end
        after
          GenServer.stop(connection, :normal)
        end
      end
    else
      :ok
    end
  end

  # Recursively sanitize values for JSON encoding — converts Decimal to float
  defp sanitize_for_json(%Decimal{} = value) do
    case Decimal.to_float(value) do
      f when is_float(f) -> f
      _ -> Decimal.to_string(value, :normal)
    end
  end

  defp sanitize_for_json(map) when is_map(map) and not is_struct(map) do
    Map.new(map, fn {k, v} -> {k, sanitize_for_json(v)} end)
  end

  defp sanitize_for_json(list) when is_list(list) do
    Enum.map(list, &sanitize_for_json/1)
  end

  defp sanitize_for_json(value), do: value

  defp connect do
    redis_url =
      Application.get_env(:back, :provider_cache_redis_url) ||
        Application.get_env(:back, :multi_source_redis_url, "redis://127.0.0.1:6379")

    Redix.start_link(redis_url)
  end
end
