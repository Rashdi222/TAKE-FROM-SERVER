defmodule Back.AI.OddsStrategies.Shared do
  @moduledoc false

  def racing_runner_names(match) do
    match
    |> participant_rows()
    |> Enum.map(fn row -> row[:name] || row["name"] end)
    |> Enum.filter(&(is_binary(&1) and String.trim(&1) != ""))
    |> Enum.uniq()
  end

  def participant_rows(match) do
    raw_data = Map.get(match, :raw_data) || Map.get(match, "raw_data") || %{}

    direct =
      Map.get(raw_data, "participants") ||
        Map.get(raw_data, :participants)

    nested =
      get_in(raw_data, ["raw", "participants"]) ||
        get_in(raw_data, [:raw, :participants])

    rows = direct || nested || []
    if is_list(rows), do: rows, else: []
  end
end
