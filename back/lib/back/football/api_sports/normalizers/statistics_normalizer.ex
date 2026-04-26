defmodule Back.Football.ApiSports.Normalizers.StatisticsNormalizer do
  @moduledoc false

  def normalize(rows) when is_list(rows) do
    rows
    |> Enum.map(&normalize_team_statistics/1)
    |> Enum.reject(&is_nil/1)
  end

  def normalize(_), do: []

  defp normalize_team_statistics(row) when is_map(row) do
    team = row["team"] || %{}

    stats =
      List.wrap(row["statistics"])
      |> Enum.reduce(%{}, fn item, acc ->
        case normalize_stat(item) do
          {key, value} when is_binary(key) -> Map.put(acc, key, value)
          _ -> acc
        end
      end)

    %{
      team_id: normalize_integer(team["id"]),
      team_name: present_string(team["name"]),
      stats: stats
    }
  end

  defp normalize_team_statistics(_), do: nil

  defp normalize_stat(item) when is_map(item) do
    key =
      item["type"]
      |> present_string()
      |> normalize_key()

    {key, normalize_value(item["value"])}
  end

  defp normalize_stat(_), do: nil

  defp normalize_value(nil), do: nil

  defp normalize_value(value) when is_binary(value) do
    trimmed = String.trim(value)

    cond do
      trimmed == "" -> nil
      String.ends_with?(trimmed, "%") -> normalize_integer(String.trim_trailing(trimmed, "%"))
      true -> normalize_integer(trimmed) || trimmed
    end
  end

  defp normalize_value(value) when is_integer(value) or is_float(value), do: value
  defp normalize_value(value), do: value

  defp normalize_key(nil), do: nil

  defp normalize_key(value) do
    value
    |> String.downcase()
    |> String.replace("%", " percent")
    |> String.replace(~r/[^a-z0-9]+/u, "_")
    |> String.trim("_")
  end

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
