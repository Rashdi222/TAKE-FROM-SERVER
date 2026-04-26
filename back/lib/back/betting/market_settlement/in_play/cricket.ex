defmodule Back.Betting.MarketSettlement.InPlay.Cricket do
  @moduledoc false

  alias Back.Betting.Match

  @market_family "cricket_another_run"

  def snapshot(%Match{} = match) do
    with {:ok, total_runs} <- extract_total_runs(match) do
      %{
        "in_play_snapshot" => true,
        "market_family" => @market_family,
        "total_runs" => total_runs,
        "captured_at" => DateTime.utc_now() |> DateTime.truncate(:second) |> DateTime.to_iso8601()
      }
    else
      _ -> nil
    end
  end

  def normalize_outcome(value) when is_binary(value) do
    case value |> String.trim() |> String.downcase() do
      "another_run_yes" -> {:ok, :yes}
      "another_run_no" -> {:ok, :no}
      _ -> {:error, :invalid_market_outcome}
    end
  end

  def normalize_outcome(_), do: {:error, :invalid_market_outcome}

  def supported_snapshot?(%{"market_family" => @market_family, "total_runs" => total})
      when is_integer(total),
      do: true

  def supported_snapshot?(_), do: false

  def settle(%Match{} = match, outcome, snapshot) do
    with {:ok, expected} <- normalize_outcome(outcome),
         true <- supported_snapshot?(snapshot),
         {:ok, final_total_runs} <- extract_total_runs(match) do
      snapshot_total = snapshot["total_runs"]
      another_run? = final_total_runs > snapshot_total

      won =
        case expected do
          :yes -> another_run?
          :no -> not another_run?
        end

      {:ok, won, Integer.to_string(final_total_runs)}
    else
      false -> {:error, :market_settlement_not_supported}
      {:error, _} = err -> err
    end
  end

  def extract_total_runs(%Match{} = match) do
    score = get_in(match.score || %{}, ["score"]) || %{}
    raw_score = get_in(match.raw_data || %{}, ["score"]) || score

    innings =
      cond do
        is_list(raw_score) -> raw_score
        is_list(score) -> score
        true -> []
      end

    case innings do
      [_ | _] ->
        total_runs =
          innings
          |> Enum.map(fn row ->
            first_integer([
              row["r"],
              row[:r],
              row["runs"],
              row[:runs],
              row["score"],
              row[:score]
            ]) || 0
          end)
          |> Enum.sum()

        {:ok, total_runs}

      _ ->
        total_from_score_string(extract_string_score(raw_score) || extract_string_score(score))
    end
  end

  defp total_from_score_string(nil), do: {:error, :market_settlement_not_supported}

  defp total_from_score_string(value) when is_binary(value) do
    with {:ok, runs} <- parse_cricket_runs_from_string(value) do
      if runs > 0, do: {:ok, runs}, else: {:error, :market_settlement_not_supported}
    end
  end

  defp total_from_score_string(_), do: {:error, :market_settlement_not_supported}

  defp parse_cricket_runs_from_string(value) when is_binary(value) do
    normalized = String.trim(value)

    case Regex.run(~r/(?:^|\s)(\d{1,3})\s*\/\s*\d{1,2}(?:\s|$)/, normalized) do
      [_, runs] ->
        {:ok, String.to_integer(runs)}

      _ ->
        case Regex.run(~r/(\d{1,3})/, normalized) do
          [_, runs] -> {:ok, String.to_integer(runs)}
          _ -> {:error, :market_settlement_not_supported}
        end
    end
  end

  defp parse_cricket_runs_from_string(_), do: {:error, :market_settlement_not_supported}

  defp extract_string_score(value) when is_binary(value), do: value

  defp extract_string_score(value) when is_map(value) do
    Enum.find_value(Map.values(value), &extract_string_score/1)
  end

  defp extract_string_score(_), do: nil

  defp first_integer(values) when is_list(values) do
    Enum.find_value(values, fn
      value when is_integer(value) ->
        value

      value when is_float(value) ->
        trunc(value)

      value when is_binary(value) ->
        case Integer.parse(String.trim(value)) do
          {parsed, _} -> parsed
          _ -> nil
        end

      _ ->
        nil
    end)
  end
end
