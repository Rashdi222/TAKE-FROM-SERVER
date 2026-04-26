defmodule Back.Tennis.SimulationAdapter do
  alias Back.Tennis.Fixture
  alias Back.Tennis.LiveOdds
  alias Back.Tennis.MatchState

  @scenario_dir Path.expand("../../../priv/scenarios/tennis", __DIR__)
  @allowed ~w(scenario_deuce_pressure scenario_tiebreak scenario_break_point)

  def load_snapshot(scenario) when scenario in @allowed do
    with {:ok, payload} <- read_payload(scenario),
         {:ok, livescore_rows} <- extract_rows(payload, "get_livescore"),
         {:ok, odds_rows} <- extract_rows(payload, "get_live_odds") do
      odds_by_event =
        odds_rows
        |> Enum.flat_map(&to_live_odds/1)
        |> Enum.group_by(& &1.event_key)

      states =
        Enum.map(livescore_rows, fn row ->
          event_key = string_value(row, "event_key")

          %MatchState{
            event_key: event_key,
            status: normalize_status(row),
            server: row["event_serve"],
            event_status: row["event_status"],
            current_set: infer_current_set(row["scores"]),
            current_game_score: row["event_game_result"],
            current_point_score:
              normalize_point_score(row["pointbypoint"], row["event_game_result"]),
            game_result: row["event_game_result"],
            final_result: row["event_final_result"],
            deuce?: false,
            advantage_player: nil,
            tiebreak?: row["event_tiebreak"] in ["1", 1, true],
            set_point?: truthy?(row["set_point"]),
            match_point?: truthy?(row["match_point"]),
            break_point?: truthy?(row["break_point"]),
            player_1_name: row["event_first_player"],
            player_2_name: row["event_second_player"],
            player_1_key: string_value(row, "first_player_key"),
            player_2_key: string_value(row, "second_player_key"),
            sets: normalize_sets(row["scores"]),
            point_by_point: normalize_point_by_point(row["pointbypoint"]),
            raw_live_odds: Map.get(odds_by_event, event_key, []),
            raw_fixture: row,
            raw_livescore: row,
            updated_at: DateTime.utc_now()
          }
        end)

      {:ok, states}
    end
  end

  def load_snapshot(_), do: {:error, :invalid_tennis_scenario}

  def list_scenarios do
    @allowed
  end

  def load_fixture_metadata(scenario) do
    with {:ok, payload} <- read_payload(scenario),
         {:ok, rows} <- extract_rows(payload, "get_livescore") do
      {:ok,
       Enum.map(rows, fn row ->
         %Fixture{
           event_key: string_value(row, "event_key"),
           status: row["event_status"],
           start_time: combine_datetime(row["event_date"], row["event_time"]),
           tournament_name: row["tournament_name"],
           round_name: row["event_round"],
           court_name: row["event_court"],
           player_1_name: row["event_first_player"],
           player_2_name: row["event_second_player"],
           player_1_key: string_value(row, "first_player_key"),
           player_2_key: string_value(row, "second_player_key"),
           season: row["league_season"],
           raw: row
         }
       end)}
    end
  end

  defp read_payload(scenario) do
    file = Path.join(@scenario_dir, "#{scenario}.json")

    with {:ok, raw} <- File.read(file),
         {:ok, decoded} <- Jason.decode(raw) do
      {:ok, decoded}
    end
  end

  defp extract_rows(payload, key) do
    case get_in(payload, [key, "result"]) do
      rows when is_list(rows) -> {:ok, rows}
      _ -> {:error, :invalid_simulation_payload}
    end
  end

  defp to_live_odds(row) do
    event_key = string_value(row, "event_key")
    updated_at = combine_datetime(row["odd_date"], row["odd_time"])

    row
    |> Map.drop(["event_key", "odd_date", "odd_time"])
    |> Enum.flat_map(fn {market_name, selections} ->
      normalize_market_rows(event_key, market_name, selections, updated_at)
    end)
  end

  defp normalize_market_rows(event_key, market_name, selections, updated_at)
       when is_list(selections) do
    Enum.flat_map(selections, &normalize_market_rows(event_key, market_name, &1, updated_at))
  end

  defp normalize_market_rows(event_key, market_name, %{} = selection, updated_at) do
    [
      %LiveOdds{
        event_key: event_key,
        market_key: normalize_key(market_name),
        market_name: to_string(market_name),
        selection_key:
          normalize_key(
            selection["value"] || selection["name"] || selection["type"] || market_name
          ),
        selection_name:
          selection["value"] || selection["name"] || selection["type"] || to_string(market_name),
        odds_value: selection["odd"] || selection["odds"] || selection["value"],
        line: selection["handicap"] || selection["line"],
        scope: selection["scope"] || "match",
        provider_updated_at: updated_at,
        raw: selection
      }
    ]
  end

  defp normalize_market_rows(_event_key, _market_name, _selections, _updated_at), do: []

  defp normalize_sets(rows) when is_list(rows) do
    Enum.map(rows, fn row ->
      %{
        set: row["score_set"] || row["set_number"] || row["set"],
        player_1_games: row["score_first"] || row["home_score"],
        player_2_games: row["score_second"] || row["away_score"],
        tiebreak: row["score_tiebreak"]
      }
    end)
  end

  defp normalize_sets(_), do: []

  defp normalize_point_by_point(rows) when is_list(rows) do
    Enum.map(rows, fn row ->
      %{
        set: row["set_number"] || row["set"],
        game: row["number_game"] || row["game_number"],
        points: row["points"] || row["point"] || [],
        score: row["score"],
        server: row["serve"],
        break_point?: truthy?(row["break_point"]),
        set_point?: truthy?(row["set_point"]),
        match_point?: truthy?(row["match_point"])
      }
    end)
  end

  defp normalize_point_by_point(_), do: []

  defp normalize_status(%{"event_live" => "1"}), do: :live
  defp normalize_status(%{"event_status" => "Finished"}), do: :finished
  defp normalize_status(%{"event_status" => status}) when status in [nil, ""], do: :scheduled
  defp normalize_status(_), do: :live

  defp infer_current_set(rows) when is_list(rows), do: length(rows)
  defp infer_current_set(_), do: 1

  defp normalize_point_score(rows, fallback) when is_list(rows) do
    rows
    |> List.last()
    |> case do
      %{"score" => score} when is_binary(score) -> simplify_point_score(score)
      _ -> simplify_point_score(fallback)
    end
  end

  defp normalize_point_score(_rows, fallback), do: simplify_point_score(fallback)

  defp simplify_point_score(nil), do: nil

  defp simplify_point_score(score) when is_binary(score) do
    normalized = score |> String.downcase() |> String.trim()

    cond do
      String.contains?(normalized, "adv") -> normalized
      normalized in ["40-40", "40 - 40"] -> "deuce"
      true -> normalized
    end
  end

  defp combine_datetime(nil, _time), do: nil
  defp combine_datetime(date, nil), do: date
  defp combine_datetime(date, time), do: "#{date} #{time}"

  defp string_value(row, key) do
    case Map.get(row, key) do
      nil -> nil
      value -> to_string(value)
    end
  end

  defp normalize_key(value) do
    value
    |> to_string()
    |> String.downcase()
    |> String.replace(~r/[^a-z0-9]+/u, "_")
    |> String.trim("_")
  end

  defp truthy?(value) when value in [true, "true", 1, "1", "yes", "Yes"], do: true
  defp truthy?(_), do: false
end
