defmodule Back.Football.ApiSports.Normalizers.LineupNormalizer do
  @moduledoc false

  def normalize(rows) when is_list(rows) do
    rows
    |> Enum.map(&normalize_team_lineup/1)
    |> Enum.reject(&is_nil/1)
  end

  def normalize(_), do: []

  defp normalize_team_lineup(row) when is_map(row) do
    team = row["team"] || %{}
    coach = row["coach"] || %{}

    %{
      team_id: normalize_integer(team["id"]),
      team_name: present_string(team["name"]),
      formation: present_string(row["formation"]),
      coach: %{
        id: normalize_integer(coach["id"]),
        name: present_string(coach["name"]),
        photo: present_string(coach["photo"])
      },
      start_xi: Enum.map(List.wrap(row["startXI"]), &normalize_player_slot/1),
      substitutes: Enum.map(List.wrap(row["substitutes"]), &normalize_player_slot/1)
    }
  end

  defp normalize_team_lineup(_), do: nil

  defp normalize_player_slot(slot) when is_map(slot) do
    player = slot["player"] || %{}

    %{
      id: normalize_integer(player["id"]),
      name: present_string(player["name"]),
      number: normalize_integer(player["number"]),
      position: present_string(player["pos"]),
      grid: normalize_grid(player["grid"])
    }
  end

  defp normalize_player_slot(_), do: %{}

  defp normalize_grid(value) when is_binary(value) do
    case String.split(value, ":", parts: 2) do
      [row, col] ->
        %{
          raw: value,
          row: normalize_integer(row),
          col: normalize_integer(col)
        }

      _ ->
        nil
    end
  end

  defp normalize_grid(_), do: nil

  defp normalize_integer(nil), do: nil
  defp normalize_integer(value) when is_integer(value), do: value

  defp normalize_integer(value) when is_binary(value) do
    case Integer.parse(String.trim(value)) do
      {parsed, _} -> parsed
      _ -> nil
    end
  end

  defp normalize_integer(_), do: nil

  defp present_string(value) when is_binary(value) do
    case String.trim(value) do
      "" -> nil
      trimmed -> trimmed
    end
  end

  defp present_string(_), do: nil
end
