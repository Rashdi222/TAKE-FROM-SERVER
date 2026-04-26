defmodule Back.Football.ApiSports.Normalizers.EventsNormalizer do
  @moduledoc false

  def normalize(rows) when is_list(rows) do
    rows
    |> Enum.map(&normalize_event/1)
    |> Enum.reject(&is_nil/1)
    |> Enum.sort_by(&{&1.minute || 0, &1.stoppage || 0, &1.sort_index || 0})
  end

  def normalize(_), do: []

  defp normalize_event(row) when is_map(row) do
    team = row["team"] || %{}
    player = row["player"] || %{}
    assist = row["assist"] || %{}
    time = row["time"] || %{}

    %{
      minute: normalize_integer(time["elapsed"]),
      stoppage: normalize_integer(time["extra"]),
      team_id: normalize_integer(team["id"]),
      team_name: present_string(team["name"]),
      player_name: present_string(player["name"]),
      assist_name: present_string(assist["name"]),
      type: normalize_type(row["type"]),
      detail: present_string(row["detail"]),
      comments: present_string(row["comments"]),
      sort_index: sort_index(row["type"], row["detail"]),
      label: build_label(row)
    }
  end

  defp normalize_event(_), do: nil

  defp build_label(row) do
    type = normalize_type(row["type"])
    detail = present_string(row["detail"])

    case {type, detail} do
      {"goal", "Penalty"} -> "Penalty Goal"
      {"goal", "Own Goal"} -> "Own Goal"
      {"goal", _} -> "Goal"
      {"card", "Yellow Card"} -> "Yellow Card"
      {"card", "Red Card"} -> "Red Card"
      {"card", "Second Yellow card"} -> "Second Yellow"
      {"subst", _} -> "Substitution"
      {"var", _} -> "VAR"
      {_, detail} when is_binary(detail) and detail != "" -> detail
      {type, _} when is_binary(type) and type != "" -> String.capitalize(type)
      _ -> "Match Event"
    end
  end

  defp sort_index(type, detail) do
    case {normalize_type(type), present_string(detail)} do
      {"goal", _} -> 10
      {"var", _} -> 20
      {"card", "Red Card"} -> 30
      {"card", _} -> 40
      {"subst", _} -> 50
      _ -> 90
    end
  end

  defp normalize_type(value) when is_binary(value) do
    value
    |> String.downcase()
    |> String.trim()
  end

  defp normalize_type(_), do: nil

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
