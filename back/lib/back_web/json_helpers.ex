defmodule BackWeb.JsonHelpers do
  @moduledoc false

  def decimal(nil), do: nil
  def decimal(%Decimal{} = value), do: Decimal.to_string(value, :normal)
  def decimal(value), do: value

  def json_safe(nil), do: nil
  def json_safe(%Decimal{} = value), do: decimal(value)
  def json_safe(%DateTime{} = value), do: value
  def json_safe(%NaiveDateTime{} = value), do: value
  def json_safe(%Date{} = value), do: value
  def json_safe(%Time{} = value), do: value

  def json_safe(%_{} = struct) do
    struct
    |> Map.from_struct()
    |> Map.drop([:__meta__])
    |> Enum.into(%{}, fn {key, value} -> {key, json_safe(value)} end)
  end

  def json_safe(map) when is_map(map) do
    Enum.into(map, %{}, fn {key, value} -> {key, json_safe(value)} end)
  end

  def json_safe(tuple) when is_tuple(tuple),
    do: tuple |> Tuple.to_list() |> Enum.map(&json_safe/1)

  def json_safe(list) when is_list(list), do: Enum.map(list, &json_safe/1)
  def json_safe(value), do: value
end
