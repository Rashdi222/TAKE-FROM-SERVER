defmodule Back.Betting.MarketSettlement.Tennis do
  @moduledoc false

  alias Back.Betting.Match

  def settle_set_betting(%Match{} = match, outcome) when is_binary(outcome) do
    with {:ok, team1_sets, team2_sets} <- extract_set_wins(match),
         {:ok, expected} <- normalize_outcome(match, outcome) do
      actual = %{team1_sets: team1_sets, team2_sets: team2_sets}

      {:ok, actual == expected, "#{team1_sets}-#{team2_sets}"}
    end
  end

  def settle_set_betting(_, _), do: {:error, :invalid_market_outcome}

  def normalize_outcome(%Match{} = match, outcome) when is_binary(outcome) do
    normalized =
      outcome
      |> String.trim()
      |> String.downcase()
      |> String.replace(" ", "_")

    team1 = normalize_name(match.team1)
    team2 = normalize_name(match.team2)

    allowed =
      %{
        "#{team1}_2_0" => %{team1_sets: 2, team2_sets: 0},
        "#{team1}_2_1" => %{team1_sets: 2, team2_sets: 1},
        "#{team1}_3_0" => %{team1_sets: 3, team2_sets: 0},
        "#{team1}_3_1" => %{team1_sets: 3, team2_sets: 1},
        "#{team1}_3_2" => %{team1_sets: 3, team2_sets: 2},
        "#{team2}_2_0" => %{team1_sets: 0, team2_sets: 2},
        "#{team2}_2_1" => %{team1_sets: 1, team2_sets: 2},
        "#{team2}_3_0" => %{team1_sets: 0, team2_sets: 3},
        "#{team2}_3_1" => %{team1_sets: 1, team2_sets: 3},
        "#{team2}_3_2" => %{team1_sets: 2, team2_sets: 3},
        "team1_2_0" => %{team1_sets: 2, team2_sets: 0},
        "team1_2_1" => %{team1_sets: 2, team2_sets: 1},
        "team1_3_0" => %{team1_sets: 3, team2_sets: 0},
        "team1_3_1" => %{team1_sets: 3, team2_sets: 1},
        "team1_3_2" => %{team1_sets: 3, team2_sets: 2},
        "team2_2_0" => %{team1_sets: 0, team2_sets: 2},
        "team2_2_1" => %{team1_sets: 1, team2_sets: 2},
        "team2_3_0" => %{team1_sets: 0, team2_sets: 3},
        "team2_3_1" => %{team1_sets: 1, team2_sets: 3},
        "team2_3_2" => %{team1_sets: 2, team2_sets: 3}
      }

    case Map.fetch(allowed, normalized) do
      {:ok, value} -> {:ok, value}
      :error -> {:error, :invalid_market_outcome}
    end
  end

  def extract_set_wins(%Match{} = match) do
    raw = match.raw_data || %{}

    set_rows =
      get_in(raw, ["result", "scores"]) ||
        get_in(raw, ["scores"]) ||
        []

    cond do
      is_list(set_rows) and set_rows != [] ->
        rows_to_set_wins(set_rows)

      is_binary(get_in(raw, ["result", "final_result"])) ->
        parse_final_result(get_in(raw, ["result", "final_result"]))

      is_binary(get_in(raw, ["result", "game_result"])) ->
        parse_final_result(get_in(raw, ["result", "game_result"]))

      is_binary(get_in(raw, ["event_final_result"])) ->
        parse_final_result(get_in(raw, ["event_final_result"]))

      is_binary(get_in(raw, ["event_game_result"])) ->
        parse_final_result(get_in(raw, ["event_game_result"]))

      true ->
        {:error, :market_settlement_not_supported}
    end
  end

  defp rows_to_set_wins(rows) do
    totals =
      Enum.reduce(rows, {0, 0}, fn row, {team1_wins, team2_wins} ->
        {p1, p2} = extract_pair(row)

        cond do
          is_integer(p1) and is_integer(p2) and p1 > p2 -> {team1_wins + 1, team2_wins}
          is_integer(p1) and is_integer(p2) and p2 > p1 -> {team1_wins, team2_wins + 1}
          true -> {team1_wins, team2_wins}
        end
      end)

    case totals do
      {0, 0} -> {:error, :market_settlement_not_supported}
      {team1_sets, team2_sets} -> {:ok, team1_sets, team2_sets}
    end
  end

  defp extract_pair(%{} = row) do
    team1 =
      first_integer([
        row["score_first"],
        row["score_first_player"],
        row["home_score"],
        row["1"],
        row[:score_first],
        row[:score_first_player]
      ])

    team2 =
      first_integer([
        row["score_second"],
        row["score_second_player"],
        row["away_score"],
        row["2"],
        row[:score_second],
        row[:score_second_player]
      ])

    {team1, team2}
  end

  defp extract_pair(value) when is_binary(value) do
    case value
         |> Regex.scan(~r/\d+/)
         |> List.flatten()
         |> Enum.map(&String.to_integer/1) do
      [a, b | _] -> {a, b}
      _ -> {nil, nil}
    end
  end

  defp extract_pair(_), do: {nil, nil}

  defp parse_final_result(value) when is_binary(value) do
    case value
         |> Regex.scan(~r/\d+/)
         |> List.flatten()
         |> Enum.map(&String.to_integer/1) do
      [team1_sets, team2_sets | _] -> {:ok, team1_sets, team2_sets}
      _ -> {:error, :market_settlement_not_supported}
    end
  end

  defp parse_final_result(_), do: {:error, :market_settlement_not_supported}

  defp first_integer(values) when is_list(values) do
    Enum.find_value(values, fn
      value when is_integer(value) ->
        value

      value when is_binary(value) ->
        case Integer.parse(String.trim(value)) do
          {parsed, _} -> parsed
          _ -> nil
        end

      _ ->
        nil
    end)
  end

  defp normalize_name(value) do
    value
    |> to_string()
    |> String.trim()
    |> String.downcase()
    |> String.replace(" ", "_")
  end
end
