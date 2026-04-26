defmodule Back.Tennis.MarginControl do
  alias Back.Tennis.LiveOdds

  @minimum_odds Decimal.new("1.01")
  @maximum_odds Decimal.new("50.0")

  def apply_margin(nil, _margin), do: nil

  def apply_margin(odds_value, margin) do
    with {:ok, decimal_odds} <- cast_decimal(odds_value),
         {:ok, decimal_margin} <- cast_decimal(margin),
         true <- Decimal.compare(decimal_odds, Decimal.new("0")) == :gt do
      implied_probability = Decimal.div(Decimal.new("1"), decimal_odds)

      adjusted_probability =
        Decimal.mult(implied_probability, Decimal.add(Decimal.new("1"), decimal_margin))

      adjusted_probability
      |> Decimal.max(Decimal.div(Decimal.new("1"), @maximum_odds))
      |> Decimal.min(Decimal.div(Decimal.new("1"), @minimum_odds))
      |> then(&Decimal.div(Decimal.new("1"), &1))
      |> Decimal.max(@minimum_odds)
      |> Decimal.round(2)
      |> Decimal.to_string(:normal)
    else
      _ -> nil
    end
  end

  def apply_to_odds(%LiveOdds{} = odd, margin) do
    %LiveOdds{odd | odds_value: apply_margin(odd.odds_value, margin)}
  end

  defp cast_decimal(%Decimal{} = value), do: {:ok, value}
  defp cast_decimal(value) when is_integer(value), do: {:ok, Decimal.new(value)}
  defp cast_decimal(value) when is_float(value), do: {:ok, Decimal.from_float(value)}

  defp cast_decimal(value) when is_binary(value) do
    case Decimal.parse(String.trim(value)) do
      {decimal, ""} -> {:ok, decimal}
      _ -> :error
    end
  end

  defp cast_decimal(_), do: :error
end
