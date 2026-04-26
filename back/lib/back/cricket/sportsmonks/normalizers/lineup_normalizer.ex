defmodule Back.Cricket.Sportsmonks.Normalizers.LineupNormalizer do
  @moduledoc false

  @spec normalize(map()) :: map()
  def normalize(raw) when is_map(raw) do
    lineup = raw["lineup"]

    %{
      "toss" => normalize_toss(raw["tosswon"], raw),
      "lineup" => normalize_lineup(lineup),
      "captains" => collect_role(lineup, "captain"),
      "wicketkeepers" => collect_role(lineup, "wicketkeeper")
    }
  end

  def normalize(_), do: normalize(%{})

  defp normalize_toss(tosswon, raw) when is_map(tosswon) do
    %{
      "winner_team_id" => tosswon["id"],
      "winner_name" => present_string(tosswon["name"] || tosswon["fullname"]),
      "decision" => present_string(raw["elected"] || raw["toss_elected"] || raw["toss_decision"])
    }
    |> Enum.reject(fn {_key, value} -> is_nil(value) end)
    |> Map.new()
  end

  defp normalize_toss(_, raw) when is_map(raw) do
    case present_string(raw["elected"] || raw["toss_elected"] || raw["toss_decision"]) do
      nil -> nil
      decision -> %{"decision" => decision}
    end
  end

  defp normalize_lineup(lineup) when is_list(lineup) do
    lineup
    |> Enum.map(&normalize_lineup_entry/1)
    |> Enum.reject(&is_nil/1)
  end

  defp normalize_lineup(_), do: []

  defp normalize_lineup_entry(entry) when is_map(entry) do
    %{
      "id" => entry["id"],
      "team_id" => entry["lineup"] || entry["team_id"],
      "team_name" => present_string(get_in(entry, ["team", "name"]) || entry["team_name"]),
      "player_id" => entry["player_id"] || get_in(entry, ["player", "id"]),
      "player_name" =>
        present_string(
          get_in(entry, ["player", "fullname"]) || get_in(entry, ["player", "name"]) ||
            entry["fullname"] || entry["name"]
        ),
      "role" => normalize_role(entry),
      "captain" => truthy?(entry["captain"]),
      "wicketkeeper" => truthy?(entry["wicketkeeper"]),
      "substitute" => truthy?(entry["substitute"]),
      "position" => present_string(entry["position"])
    }
    |> Enum.reject(fn {_key, value} -> is_nil(value) end)
    |> Map.new()
  end

  defp normalize_lineup_entry(_), do: nil

  defp collect_role(lineup, role_name) when is_list(lineup) do
    lineup
    |> Enum.map(&normalize_lineup_entry/1)
    |> Enum.reject(&is_nil/1)
    |> Enum.filter(fn entry -> entry[role_name] == true end)
  end

  defp collect_role(_, _), do: []

  defp normalize_role(entry) do
    cond do
      truthy?(entry["captain"]) and truthy?(entry["wicketkeeper"]) -> "captain_wicketkeeper"
      truthy?(entry["captain"]) -> "captain"
      truthy?(entry["wicketkeeper"]) -> "wicketkeeper"
      true -> present_string(entry["position"] || entry["role"])
    end
  end

  defp truthy?(value) when value in [true, 1, "1", "true", "yes", "Yes"], do: true
  defp truthy?(_), do: false

  defp present_string(value) when is_binary(value) do
    case String.trim(value) do
      "" -> nil
      trimmed -> trimmed
    end
  end

  defp present_string(_), do: nil
end
