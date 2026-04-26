defmodule Back.SportsData.Parser do
  @moduledoc false

  def parse_iso_date_time_utc(nil, _), do: nil
  def parse_iso_date_time_utc(_, nil), do: nil

  def parse_iso_date_time_utc(date, time) when is_binary(date) and is_binary(time) do
    with {:ok, d} <- Date.from_iso8601(String.trim(date)),
         {:ok, t} <- parse_time(time),
         {:ok, naive} <- NaiveDateTime.new(d, t) do
      DateTime.from_naive!(naive, "Etc/UTC")
    else
      _ -> nil
    end
  end

  def parse_goalserve_datetime(datetime_str, timezone \\ "Europe/London")
  def parse_goalserve_datetime(nil, _timezone), do: nil

  def parse_goalserve_datetime(datetime_str, timezone) when is_binary(datetime_str) do
    with [date_part, time_part] <- String.split(String.trim(datetime_str), " ", parts: 2),
         [day, month, year] <- split_int(date_part, "."),
         [hour, minute] <- split_int(time_part, ":"),
         {:ok, naive} <- NaiveDateTime.new(year, month, day, hour, minute, 0),
         {:ok, dt} <- DateTime.from_naive(naive, timezone),
         {:ok, utc} <- DateTime.shift_zone(dt, "Etc/UTC") do
      utc
    else
      _ -> nil
    end
  end

  def unix_to_datetime(nil), do: nil

  def unix_to_datetime(unix) when is_integer(unix) do
    case DateTime.from_unix(unix) do
      {:ok, dt} -> dt
      _ -> nil
    end
  end

  def unix_to_datetime(unix) when is_binary(unix) do
    case Integer.parse(unix) do
      {value, ""} -> unix_to_datetime(value)
      _ -> nil
    end
  end

  def unix_to_datetime(_), do: nil

  def compact_string(nil), do: nil

  def compact_string(value) when is_binary(value) do
    case String.trim(value) do
      "" -> nil
      trimmed -> trimmed
    end
  end

  def compact_string(value), do: to_string(value)

  def to_string_or_nil(nil), do: nil
  def to_string_or_nil(value), do: to_string(value)

  def list_wrap(nil), do: []
  def list_wrap(list) when is_list(list), do: list
  def list_wrap(item), do: [item]

  def map_or_empty(map) when is_map(map), do: map
  def map_or_empty(_), do: %{}

  def to_int(nil), do: nil
  def to_int(value) when is_integer(value), do: value

  def to_int(value) when is_binary(value) do
    case Integer.parse(value) do
      {int, ""} -> int
      _ -> nil
    end
  end

  def to_int(_), do: nil

  defp parse_time(time) do
    cleaned = String.trim(time)

    cond do
      String.length(cleaned) == 5 ->
        Time.from_iso8601(cleaned <> ":00")

      String.length(cleaned) == 8 ->
        Time.from_iso8601(cleaned)

      true ->
        {:error, :invalid_time}
    end
  end

  defp split_int(value, separator) do
    value
    |> String.split(separator)
    |> Enum.map(&to_int/1)
  end
end
