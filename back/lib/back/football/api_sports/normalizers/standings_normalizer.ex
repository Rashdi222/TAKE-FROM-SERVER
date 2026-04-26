defmodule Back.Football.ApiSports.Normalizers.StandingsNormalizer do
  @moduledoc false

  def normalize(rows, team_names \\ [])

  def normalize(rows, team_names) when is_list(rows) do
    table =
      rows
      |> List.wrap()
      |> Enum.flat_map(fn row ->
        row
        |> get_in(["league", "standings"])
        |> List.wrap()
      end)
      |> Enum.flat_map(&List.wrap/1)
      |> Enum.map(&normalize_entry/1)
      |> Enum.reject(&is_nil/1)

    %{
      table: table,
      teams: filter_teams(table, team_names)
    }
  end

  def normalize(_, _), do: %{table: [], teams: []}

  defp normalize_entry(entry) when is_map(entry) do
    team = entry["team"] || %{}
    all = entry["all"] || %{}
    goals = all["goals"] || %{}

    %{
      team_id: normalize_integer(team["id"]),
      team_name: present_string(team["name"]),
      rank: normalize_integer(entry["rank"]),
      points: normalize_integer(entry["points"]),
      goals_diff: normalize_integer(entry["goalsDiff"]),
      form: present_string(entry["form"]),
      movement: present_string(entry["status"]),
      zone: present_string(entry["description"]),
      played: normalize_integer(all["played"]),
      won: normalize_integer(all["win"]),
      drawn: normalize_integer(all["draw"]),
      lost: normalize_integer(all["lose"]),
      goals_for: normalize_integer(goals["for"]),
      goals_against: normalize_integer(goals["against"])
    }
  end

  defp normalize_entry(_), do: nil

  defp filter_teams(table, team_names) do
    normalized =
      team_names
      |> List.wrap()
      |> Enum.map(&normalize_name/1)
      |> Enum.reject(&is_nil/1)
      |> MapSet.new()

    Enum.filter(table, fn entry ->
      MapSet.member?(normalized, normalize_name(entry.team_name))
    end)
  end

  defp normalize_name(value) when is_binary(value) do
    value
    |> String.downcase()
    |> String.trim()
  end

  defp normalize_name(_), do: nil

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
