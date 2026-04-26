defmodule Back.Tennis.ApiClient do
  require Logger

  alias Back.Providers
  alias Back.Tennis.Fixture
  alias Back.Tennis.LiveOdds
  alias Back.Tennis.MatchState
  alias Back.Tennis.ApiTennis.ContextLoader
  alias Back.Tennis.SimulationAdapter
  alias Back.Tennis.SimulationState

  @default_base_url "https://api.api-tennis.com/tennis/"
  @provider_name "api_tennis"
  @default_timezone "Asia/Karachi"

  def fetch_fixtures(opts \\ []) do
    date_start = Keyword.get(opts, :date_start, Date.utc_today())
    date_stop = Keyword.get(opts, :date_stop, Date.add(Date.utc_today(), 1))

    request("get_fixtures",
      date_start: Date.to_string(date_start),
      date_stop: Date.to_string(date_stop),
      timezone: Keyword.get(opts, :timezone, @default_timezone)
    )
    |> map_rows(&to_fixture/1)
  end

  def fetch_livescore(opts \\ []) do
    request("get_livescore", timezone: Keyword.get(opts, :timezone, @default_timezone))
    |> map_rows(fn row -> to_match_state(row, embedded_live_odds(row)) end)
  end

  def fetch_live_odds(opts \\ []) do
    request("get_live_odds", timezone: Keyword.get(opts, :timezone, @default_timezone))
    |> case do
      {:ok, rows} when is_list(rows) ->
        {:ok, Enum.flat_map(rows, &to_live_odds/1)}

      other ->
        other
    end
  end

  def fetch_standings(event_type) when is_binary(event_type) do
    request("get_standings", event_type: event_type)
  end

  def fetch_player_profile(player_key) when is_binary(player_key) do
    case request("get_players", player_key: player_key) do
      {:ok, [%{} = row | _]} -> {:ok, row}
      {:ok, %{} = row} -> {:ok, row}
      {:ok, _} -> {:error, :not_found}
      other -> other
    end
  end

  def extract_embedded_live_odds(%{} = row), do: embedded_live_odds(row)
  def extract_embedded_live_odds(_), do: []

  def fetch_live_snapshot(opts \\ []) do
    case safe_simulation_state() do
      %{enabled: true, scenario: scenario} when is_binary(scenario) ->
        SimulationAdapter.load_snapshot(scenario)

      _ ->
        with {:ok, states} <- fetch_livescore(opts) do
          live_odds_result = fetch_live_odds(opts)

          live_odds =
            case live_odds_result do
              {:ok, rows} when is_list(rows) ->
                rows

              {:error, reason} ->
                Logger.warning(
                  "[TENNIS] live odds snapshot unavailable; keeping prior odds #{inspect(reason)}"
                )

                []
            end

          odds_by_event = Enum.group_by(live_odds, & &1.event_key)

          merged_states =
            Enum.map(states, fn %MatchState{event_key: event_key} = state ->
              merged_odds =
                case Map.get(odds_by_event, event_key) do
                  nil -> state.raw_live_odds || []
                  [] -> state.raw_live_odds || []
                  rows -> rows
                end

              %{state | raw_live_odds: merged_odds}
            end)

          {:ok, merged_states}
        end
    end
  end

  defp safe_simulation_state do
    try do
      SimulationState.get()
    catch
      :exit, _ -> %{enabled: false, scenario: nil}
    end
  end

  defp request(method, params) do
    with {:ok, provider} <- Providers.get_enabled_provider_by_name(@provider_name),
         {:ok, api_key} <- fetch_api_key(provider) do
      base_url =
        provider.base_url
        |> to_string()
        |> String.trim()
        |> case do
          "" -> @default_base_url
          value -> value
        end

      query_key =
        provider.config
        |> extract_config_value(["api_key_param", :api_key_param], "APIkey")

      req_params = [{:method, method}, {String.to_atom(query_key), api_key} | params]

      case Req.get(base_url, params: req_params, headers: [{"Accept", "application/json"}]) do
        {:ok, %{status: 200, body: %{"success" => 1} = body}} ->
          rows = Map.get(body, "result", [])
          {:ok, normalize_result_rows(rows)}

        {:ok, %{status: 200, body: %{"error" => "1", "result" => [%{"cod" => 1006} | _]}}} ->
          Logger.warning("[TENNIS] subscription inactive (provider code 1006), backing off")
          {:error, :subscription_required}

        {:ok, %{status: 429}} ->
          {:error, {:rate_limited, 429}}

        {:ok, %{status: 503}} ->
          {:error, {:service_unavailable, 503}}

        {:ok, %{status: status, body: body}} ->
          Logger.error("Tennis ApiClient HTTP error #{status}: #{inspect(body)}")
          {:error, {:http_error, status, body}}

        {:error, reason} ->
          Logger.error("Tennis ApiClient request failed: #{inspect(reason)}")
          {:error, reason}
      end
    end
  end

  defp fetch_api_key(provider) do
    case provider.api_key |> to_string() |> String.trim() do
      "" -> {:error, :missing_api_tennis_key}
      key -> {:ok, key}
    end
  end

  defp map_rows({:ok, rows}, mapper) when is_list(rows) do
    {:ok, Enum.map(rows, mapper)}
  end

  defp map_rows(other, _mapper), do: other

  defp to_fixture(row) do
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
  end

  defp to_match_state(row, odds) do
    point_score = normalize_point_score(row["pointbypoint"], row["event_game_result"])
    flags = extract_pressure_flags(row)
    tennis_context = ContextLoader.fetch_context(row)

    %MatchState{
      event_key: string_value(row, "event_key"),
      status: normalize_status(row),
      server: normalize_server(row["event_serve"], row),
      event_status: row["event_status"],
      current_set: infer_current_set(row["scores"]),
      current_game_score: row["event_game_result"],
      current_point_score: point_score,
      game_result: row["event_game_result"],
      final_result: row["event_final_result"],
      deuce?: point_score == "deuce",
      advantage_player: extract_advantage(point_score, row),
      tiebreak?: tiebreak?(row),
      set_point?: flags.set_point?,
      match_point?: flags.match_point?,
      break_point?: flags.break_point?,
      player_1_name: row["event_first_player"],
      player_2_name: row["event_second_player"],
      player_1_key: string_value(row, "first_player_key"),
      player_2_key: string_value(row, "second_player_key"),
      sets: normalize_sets(row["scores"]),
      point_by_point: normalize_point_by_point(row["pointbypoint"]),
      tennis_context: tennis_context,
      raw_live_odds: odds,
      raw_fixture: row,
      raw_livescore: row,
      updated_at: DateTime.utc_now()
    }
  end

  defp to_live_odds(row) do
    event_key = string_value(row, "event_key")

    updated_at =
      combine_datetime(row["odd_date"], row["odd_time"]) ||
        combine_datetime(row["event_date"], row["event_time"])

    cond do
      is_list(row["live_odds"]) ->
        normalize_embedded_live_odds(event_key, row["live_odds"])

      true ->
        row
        |> Map.drop(["event_key", "odd_date", "odd_time"])
        |> Enum.flat_map(fn {market_name, selections} ->
          normalize_market_rows(event_key, market_name, selections, updated_at)
        end)
    end
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

  defp normalize_embedded_live_odds(event_key, selections) when is_list(selections) do
    Enum.map(selections, fn selection ->
      market_name = selection["odd_name"] || selection["market_name"] || "Market"
      selection_name = selection["type"] || selection["name"] || selection["value"] || "Selection"

      %LiveOdds{
        event_key: event_key,
        market_key: normalize_key(market_name),
        market_name: to_string(market_name),
        selection_key: normalize_key(selection_name),
        selection_name: selection_name,
        odds_value: selection["value"] || selection["odd"] || selection["odds"],
        line: selection["handicap"] || selection["line"],
        scope: selection["scope"] || "match",
        provider_updated_at: selection["upd"],
        raw: selection
      }
    end)
  end

  defp normalize_embedded_live_odds(_event_key, _), do: []

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

  defp normalize_status(%{"event_live" => value}) when value in [1, "1", true, "true"], do: :live
  defp normalize_status(%{"event_status" => "Finished"}), do: :finished
  defp normalize_status(%{"event_status" => status}) when status in [nil, ""], do: :scheduled

  defp normalize_status(%{"event_status" => status}) when is_binary(status) do
    normalized = status |> String.downcase() |> String.trim()

    cond do
      normalized in ["finished", "ft", "ended"] -> :finished
      String.contains?(normalized, "set") -> :live
      String.contains?(normalized, "live") -> :live
      true -> :scheduled
    end
  end

  defp normalize_status(_), do: :scheduled

  defp normalize_server(nil, row), do: row["event_serve_who"] || row["event_serve"]
  defp normalize_server("", row), do: row["event_serve_who"] || row["event_serve"]
  defp normalize_server(server, _row), do: server

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

  defp extract_advantage("adv 1", row), do: row["event_first_player"]
  defp extract_advantage("adv 2", row), do: row["event_second_player"]

  defp extract_advantage(score, row) when is_binary(score) do
    cond do
      String.contains?(score, "adv") and String.contains?(score, "1") ->
        row["event_first_player"]

      String.contains?(score, "adv") and String.contains?(score, "2") ->
        row["event_second_player"]

      true ->
        nil
    end
  end

  defp extract_advantage(_, _), do: nil

  defp tiebreak?(row) do
    truthy?(row["event_tiebreak"]) or
      String.contains?(to_string(row["event_status"] || ""), "Tie Break")
  end

  defp extract_pressure_flags(row) do
    entries = normalize_point_by_point(row["pointbypoint"])
    last_entry = List.last(entries) || %{}

    %{
      break_point?: truthy?(last_entry[:break_point?]) or truthy?(row["break_point"]),
      set_point?: truthy?(last_entry[:set_point?]) or truthy?(row["set_point"]),
      match_point?: truthy?(last_entry[:match_point?]) or truthy?(row["match_point"])
    }
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

  defp normalize_result_rows(rows) when is_list(rows), do: Enum.filter(rows, &is_map/1)

  defp normalize_result_rows(rows) when is_map(rows) do
    rows
    |> Map.values()
    |> Enum.filter(&is_map/1)
  end

  defp normalize_result_rows(_), do: []

  defp embedded_live_odds(row) when is_map(row),
    do: normalize_embedded_live_odds(string_value(row, "event_key"), row["live_odds"])

  defp embedded_live_odds(_), do: []

  defp extract_config_value(nil, _keys, default), do: default

  defp extract_config_value(config, keys, default) when is_map(config) do
    keys
    |> Enum.find_value(fn key ->
      case Map.get(config, key) do
        value when is_binary(value) and value != "" -> String.trim(value)
        _ -> nil
      end
    end)
    |> case do
      nil -> default
      value -> value
    end
  end
end
