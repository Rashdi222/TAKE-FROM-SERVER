defmodule Back.Betting.MarketSettlement.InPlay.Tennis do
  @moduledoc false

  alias Back.Betting.Match

  @market_family "tennis_another_game"

  def snapshot(%Match{} = match) do
    with {:ok, total_games} <- extract_total_games(match) do
      %{
        "in_play_snapshot" => true,
        "market_family" => @market_family,
        "total_games" => total_games,
        "captured_at" => DateTime.utc_now() |> DateTime.truncate(:second) |> DateTime.to_iso8601()
      }
    else
      _ -> nil
    end
  end

  def normalize_outcome(value) when is_binary(value) do
    case value |> String.trim() |> String.downcase() do
      "another_game_yes" -> {:ok, :yes}
      "another_game_no" -> {:ok, :no}
      _ -> {:error, :invalid_market_outcome}
    end
  end

  def normalize_outcome(_), do: {:error, :invalid_market_outcome}

  def supported_snapshot?(%{"market_family" => @market_family, "total_games" => total})
      when is_integer(total),
      do: true

  def supported_snapshot?(_), do: false

  def settle(%Match{} = match, outcome, snapshot) do
    with {:ok, expected} <- normalize_outcome(outcome),
         true <- supported_snapshot?(snapshot),
         {:ok, final_total_games} <- extract_total_games(match) do
      snapshot_total = snapshot["total_games"]
      another_game? = final_total_games > snapshot_total

      won =
        case expected do
          :yes -> another_game?
          :no -> not another_game?
        end

      {:ok, won, Integer.to_string(final_total_games)}
    else
      false -> {:error, :market_settlement_not_supported}
      {:error, _} = err -> err
    end
  end

  def extract_total_games(%Match{} = match) do
    raw = match.raw_data || %{}

    total =
      first_positive_total([
        get_in(raw, ["result", "scores"]),
        get_in(raw, ["scores"]),
        get_in(raw, ["score"]),
        get_in(raw, ["result", "game_result"]),
        get_in(raw, ["event_game_result"]),
        get_in(raw, ["event_final_result"])
      ])

    if total > 0, do: {:ok, total}, else: {:error, :market_settlement_not_supported}
  end

  defp sum_integers_from_term(value) when is_list(value) do
    value
    |> Enum.map(&sum_integers_from_term/1)
    |> Enum.sum()
  end

  defp sum_integers_from_term(value) when is_map(value) do
    value
    |> Map.values()
    |> Enum.map(&sum_integers_from_term/1)
    |> Enum.sum()
  end

  defp sum_integers_from_term(value) when is_integer(value), do: value
  defp sum_integers_from_term(value) when is_float(value), do: trunc(value)

  defp sum_integers_from_term(value) when is_binary(value) do
    Regex.scan(~r/\d+/, value)
    |> List.flatten()
    |> Enum.map(&String.to_integer/1)
    |> Enum.sum()
  end

  defp sum_integers_from_term(_), do: 0

  defp first_positive_total(values) when is_list(values) do
    Enum.find_value(values, 0, fn value ->
      total = sum_integers_from_term(value)
      if total > 0, do: total, else: nil
    end)
  end
end
