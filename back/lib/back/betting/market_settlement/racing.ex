defmodule Back.Betting.MarketSettlement.Racing do
  @moduledoc false

  alias Back.Betting.Match

  @place_cutoff 3

  def settle_place(%Match{} = match, outcome) when is_binary(outcome) do
    normalized_outcome = normalize_name(outcome)

    with {:ok, positions} <- extract_positions(match),
         {:ok, placed_name} <- find_position_name(positions, normalized_outcome) do
      {:ok, true, placed_name}
    else
      {:error, :runner_not_placed} -> {:ok, false, normalized_outcome}
      {:error, _} = err -> err
    end
  end

  def settle_place(_, _), do: {:error, :invalid_market_outcome}

  def extract_positions(%Match{} = match) do
    positions =
      get_in(match.score || %{}, ["positions"]) ||
        get_in(match.raw_data || %{}, ["result", "positions"]) ||
        []

    if is_list(positions) and positions != [] do
      {:ok, positions}
    else
      {:error, :market_settlement_not_supported}
    end
  end

  defp find_position_name(positions, normalized_outcome) do
    positions
    |> Enum.find_value(fn row ->
      position = parse_position(row["position"] || row[:position])
      name = row["name"] || row[:name]

      if is_integer(position) and position <= @place_cutoff and
           normalize_name(name) == normalized_outcome do
        {:ok, name}
      end
    end)
    |> case do
      {:ok, name} -> {:ok, name}
      _ -> {:error, :runner_not_placed}
    end
  end

  defp parse_position(value) when is_integer(value), do: value

  defp parse_position(value) when is_binary(value) do
    case Integer.parse(String.trim(value)) do
      {parsed, _} -> parsed
      _ -> nil
    end
  end

  defp parse_position(_), do: nil

  defp normalize_name(nil), do: ""

  defp normalize_name(value) do
    value
    |> to_string()
    |> String.trim()
    |> String.downcase()
    |> String.replace(" ", "_")
  end
end
