defmodule Back.Tennis.ApiTennis.ContextLoader do
  alias Back.Tennis.ApiClient
  alias Back.Tennis.ApiTennis.Normalizers
  alias Back.Tennis.ContextCache

  def fetch_context(%{} = payload) do
    event_key = string_value(payload, "event_key")

    case event_key && safe_cache_get(event_key) do
      {:ok, context} ->
        context

      _ ->
        context = build_context(payload)

        if is_binary(event_key) do
          safe_cache_put(event_key, context)
        end

        context
    end
  end

  defp build_context(payload) do
    event_type = payload["event_type_type"] || payload[:event_type_type]

    player_keys =
      [string_value(payload, "first_player_key"), string_value(payload, "second_player_key")]
      |> Enum.filter(&is_binary/1)

    rankings = fetch_rankings(event_type, player_keys)
    players = fetch_players(player_keys)
    Normalizers.normalize_rest_context(payload, rankings: rankings, players: players)
  end

  defp fetch_rankings(nil, _player_keys), do: %{}
  defp fetch_rankings("", _player_keys), do: %{}

  defp fetch_rankings(event_type, player_keys) do
    with {:ok, rows} <- ApiClient.fetch_standings(event_type) do
      rows
      |> Enum.filter(fn row ->
        (string_value(row, "player_key") || string_value(row, "player")) in player_keys
      end)
      |> Map.new(fn row ->
        key = string_value(row, "player_key") || string_value(row, "player")
        {key, row}
      end)
    else
      _ -> %{}
    end
  end

  defp fetch_players([]), do: %{}

  defp fetch_players(player_keys) do
    player_keys
    |> Enum.reduce(%{}, fn key, acc ->
      case ApiClient.fetch_player_profile(key) do
        {:ok, %{} = row} -> Map.put(acc, key, row)
        _ -> acc
      end
    end)
  end

  defp string_value(payload, key) do
    atom_key =
      try do
        String.to_existing_atom(key)
      rescue
        ArgumentError -> nil
      end

    case Map.get(payload, key) || (atom_key && Map.get(payload, atom_key)) do
      nil -> nil
      value -> to_string(value)
    end
  end

  defp safe_cache_get(event_key) do
    try do
      ContextCache.get(event_key)
    catch
      :exit, _ -> :miss
    end
  end

  defp safe_cache_put(event_key, context) do
    try do
      ContextCache.put(event_key, context)
    catch
      :exit, _ -> :ok
    end
  end
end
