defmodule Back.Tennis.ApiTennis.Normalizers.ContextNormalizer do
  def normalize(payload, opts \\ []) when is_map(payload) do
    rankings = Keyword.get(opts, :rankings, %{})
    players = Keyword.get(opts, :players, %{})

    player_1_key = string_value(payload, "first_player_key")
    player_2_key = string_value(payload, "second_player_key")
    player_1_name = compact_string(payload["event_first_player"] || payload[:event_first_player])

    player_2_name =
      compact_string(payload["event_second_player"] || payload[:event_second_player])

    tournament_name = compact_string(payload["tournament_name"] || payload[:tournament_name])
    event_type = compact_string(payload["event_type_type"] || payload[:event_type_type])
    court_name = compact_string(payload["event_court"] || payload[:event_court])

    %{
      surface: normalize_surface(payload, tournament_name, court_name),
      tournament: %{
        name: tournament_name,
        tier: normalize_tier(payload, tournament_name, event_type),
        round: compact_string(payload["event_round"] || payload[:event_round]),
        season: compact_string(payload["league_season"] || payload[:league_season]),
        event_type: event_type,
        court_name: court_name
      },
      players: %{
        player_1:
          normalize_player(
            player_1_key,
            player_1_name,
            Map.get(rankings, player_1_key),
            Map.get(players, player_1_key)
          ),
        player_2:
          normalize_player(
            player_2_key,
            player_2_name,
            Map.get(rankings, player_2_key),
            Map.get(players, player_2_key)
          )
      },
      source: %{
        rankings_fetched: map_size(rankings) > 0,
        player_profiles_fetched: map_size(players) > 0
      }
    }
  end

  defp normalize_player(key, name, ranking, profile) do
    %{
      key: key,
      name: name,
      rank:
        compact_string(
          (ranking || %{})["place"] || (ranking || %{})[:place] || (profile || %{})["rank"] ||
            (profile || %{})[:rank]
        ),
      country:
        compact_string(
          (ranking || %{})["country"] || (ranking || %{})[:country] ||
            (profile || %{})["player_country"] || (profile || %{})[:player_country]
        ),
      movement: compact_string((ranking || %{})["movement"] || (ranking || %{})[:movement]),
      points: compact_string((ranking || %{})["points"] || (ranking || %{})[:points]),
      profile: %{
        age: compact_string((profile || %{})["player_age"] || (profile || %{})[:player_age]),
        image: compact_string((profile || %{})["player_logo"] || (profile || %{})[:player_logo]),
        handedness:
          compact_string((profile || %{})["player_hand"] || (profile || %{})[:player_hand])
      }
    }
  end

  defp normalize_surface(payload, tournament_name, court_name) do
    surface =
      payload["surface"] ||
        payload[:surface] ||
        payload["event_surface"] ||
        payload[:event_surface] ||
        infer_surface([tournament_name, court_name])

    compact_string(surface)
  end

  defp infer_surface(values) do
    normalized = values |> Enum.filter(&is_binary/1) |> Enum.join(" ") |> String.downcase()

    cond do
      String.contains?(normalized, "clay") -> "Clay"
      String.contains?(normalized, "grass") -> "Grass"
      String.contains?(normalized, "hard") -> "Hard"
      String.contains?(normalized, "indoor") -> "Indoor"
      true -> nil
    end
  end

  defp normalize_tier(payload, tournament_name, event_type) do
    explicit = compact_string(payload["tournament_tier"] || payload[:tournament_tier])

    explicit ||
      infer_tier([
        compact_string(tournament_name),
        compact_string(event_type),
        compact_string(payload["event_type_type"] || payload[:event_type_type])
      ])
  end

  defp infer_tier(values) do
    normalized = values |> Enum.filter(&is_binary/1) |> Enum.join(" ") |> String.downcase()

    cond do
      String.contains?(normalized, "grand slam") ->
        "Grand Slam"

      String.contains?(normalized, "atp finals") ->
        "ATP Finals"

      String.contains?(normalized, "wta finals") ->
        "WTA Finals"

      String.contains?(normalized, "masters") or String.contains?(normalized, "1000") ->
        "ATP/WTA 1000"

      String.contains?(normalized, "500") ->
        "ATP/WTA 500"

      String.contains?(normalized, "250") ->
        "ATP/WTA 250"

      String.contains?(normalized, "challenger") ->
        "Challenger"

      String.contains?(normalized, "itf") or String.contains?(normalized, "futures") ->
        "ITF"

      true ->
        compact_string(List.first(values))
    end
  end

  defp compact_string(nil), do: nil

  defp compact_string(value) do
    value
    |> to_string()
    |> String.trim()
    |> case do
      "" -> nil
      v -> v
    end
  end

  defp string_value(payload, key) do
    case Map.get(payload, key) || Map.get(payload, String.to_atom(key)) do
      nil -> nil
      value -> to_string(value)
    end
  end
end
