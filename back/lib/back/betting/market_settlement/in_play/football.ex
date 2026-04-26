defmodule Back.Betting.MarketSettlement.InPlay.Football do
  @moduledoc false

  alias Back.Betting.Match

  @market_family "football_another_goal"

  def snapshot(%Match{} = match) do
    with {:ok, home_goals, away_goals} <- extract_goal_pair(match) do
      %{
        "in_play_snapshot" => true,
        "market_family" => @market_family,
        "home_goals" => home_goals,
        "away_goals" => away_goals,
        "total_goals" => home_goals + away_goals,
        "captured_at" => DateTime.utc_now() |> DateTime.truncate(:second) |> DateTime.to_iso8601()
      }
    else
      _ -> nil
    end
  end

  def normalize_outcome(value) when is_binary(value) do
    case value |> String.trim() |> String.downcase() do
      "another_goal_yes" -> {:ok, :yes}
      "another_goal_no" -> {:ok, :no}
      _ -> {:error, :invalid_market_outcome}
    end
  end

  def normalize_outcome(_), do: {:error, :invalid_market_outcome}

  def supported_snapshot?(%{"market_family" => @market_family, "total_goals" => total})
      when is_integer(total),
      do: true

  def supported_snapshot?(_), do: false

  def settle(%Match{} = match, outcome, snapshot) do
    with {:ok, expected} <- normalize_outcome(outcome),
         true <- supported_snapshot?(snapshot),
         {:ok, home_goals, away_goals} <- extract_goal_pair(match) do
      snapshot_total = snapshot["total_goals"]
      final_total = home_goals + away_goals
      another_goal? = final_total > snapshot_total

      won =
        case expected do
          :yes -> another_goal?
          :no -> not another_goal?
        end

      {:ok, won, Integer.to_string(final_total)}
    else
      false -> {:error, :market_settlement_not_supported}
      {:error, _} = err -> err
    end
  end

  def extract_goal_pair(%Match{} = match) do
    score = match.score || %{}
    raw = match.raw_data || %{}
    nested_score = normalize_score_container(get_in(score, ["score"]))

    home =
      first_integer([
        get_in(nested_score, ["home"]),
        get_in(nested_score, [:home]),
        get_in(nested_score, ["home_score"]),
        get_in(nested_score, ["fulltime", "home"]),
        get_in(nested_score, ["full_time", "home"]),
        get_in(nested_score, ["goals", "home"]),
        get_in(raw, ["goals", "home"]),
        get_in(raw, ["score", "home"])
      ])

    away =
      first_integer([
        get_in(nested_score, ["away"]),
        get_in(nested_score, [:away]),
        get_in(nested_score, ["away_score"]),
        get_in(nested_score, ["fulltime", "away"]),
        get_in(nested_score, ["full_time", "away"]),
        get_in(nested_score, ["goals", "away"]),
        get_in(raw, ["goals", "away"]),
        get_in(raw, ["score", "away"])
      ])

    cond do
      is_integer(home) and is_integer(away) ->
        {:ok, home, away}

      is_binary(get_in(score, ["score"])) ->
        parse_goal_pair_from_string(get_in(score, ["score"]))

      is_binary(get_in(raw, ["score"])) ->
        parse_goal_pair_from_string(get_in(raw, ["score"]))

      true ->
        {:error, :market_settlement_not_supported}
    end
  end

  defp parse_goal_pair_from_string(value) when is_binary(value) do
    normalized = String.trim(value)

    case Regex.run(~r/(?:^|\b)(\d{1,2})\s*[-:]\s*(\d{1,2})(?:\b|$)/, normalized) do
      [_, home, away] ->
        {:ok, String.to_integer(home), String.to_integer(away)}

      _ ->
        case normalized
             |> Regex.scan(~r/\d+/)
             |> List.flatten()
             |> Enum.map(&String.to_integer/1)
             |> Enum.take(-2) do
          [home, away] -> {:ok, home, away}
          _ -> {:error, :market_settlement_not_supported}
        end
    end
  end

  defp parse_goal_pair_from_string(_), do: {:error, :market_settlement_not_supported}

  defp normalize_score_container(%{} = value), do: value
  defp normalize_score_container(_), do: %{}

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
