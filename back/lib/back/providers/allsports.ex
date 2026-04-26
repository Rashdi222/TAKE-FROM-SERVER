defmodule Back.Providers.Allsports do
  @behaviour Back.Providers.Behaviour
  alias Back.Providers.AdapterUtils

  @default_base_url "https://apiv2.allsportsapi.com"

  @impl true
  def fetch_fixtures(config),
    do: fetch(config, Map.get(config, "fixtures_endpoint", "/football/"), "Fixtures")

  @impl true
  def fetch_live(config),
    do: fetch(config, Map.get(config, "live_endpoint", "/football/"), "Livescore")

  @impl true
  def fetch_fixtures_for_feed(config, feed),
    do:
      fetch_for_feed(config, Map.get(config, "fixtures_endpoint", "/football/"), "Fixtures", feed)

  @impl true
  def fetch_live_for_feed(config, feed),
    do: fetch_for_feed(config, Map.get(config, "live_endpoint", "/football/"), "Livescore", feed)

  @impl true
  def fetch_odds_for_match(config, match) do
    match_id =
      match[:external_id] ||
        get_in(match, [:raw_data, "event_key"]) ||
        get_in(match, [:raw_data, "match_id"])

    if is_nil(match_id) do
      {:error, :provider_match_id_missing}
    else
      if match[:status] in [:live, "live"] do
        with {:ok, rows} <-
               fetch_for_feed(
                 config,
                 Map.get(config, "live_odds_endpoint", "/football/"),
                 "OddsLive",
                 %{"matchId" => match_id}
               ) do
          {:ok, normalize_live_odds_rows(rows, match_id)}
        end
      else
        with {:ok, rows} <-
               fetch_for_feed(
                 config,
                 Map.get(config, "full_odds_endpoint", "/football/"),
                 "FullOdds",
                 %{"matchId" => match_id}
               ) do
          normalized = normalize_full_odds_rows(rows, match_id)

          if normalized == [] do
            with {:ok, fallback_rows} <-
                   fetch_for_feed(
                     config,
                     Map.get(config, "odds_endpoint", "/football/"),
                     "Odds",
                     %{"matchId" => match_id}
                   ) do
              {:ok, normalize_standard_odds_rows(fallback_rows, match_id)}
            end
          else
            {:ok, normalized}
          end
        end
      end
    end
  end

  @impl true
  def normalize(raw) do
    team1_logo = raw["home_team_logo"] || raw["event_home_team_logo"]
    team2_logo = raw["away_team_logo"] || raw["event_away_team_logo"]
    season_name = raw["league_season"] || raw["season_name"]
    venue_name = raw["event_stadium"] || raw["venue_name"]
    round_name = raw["league_round"] || raw["round_name"]

    %{
      external_id: to_string(raw["event_key"] || raw["id"] || raw["match_id"]),
      provider: "allsports",
      sport: infer_sport(raw),
      team1: raw["event_home_team"] || raw["home_team"] || "Team 1",
      team2: raw["event_away_team"] || raw["away_team"] || "Team 2",
      start_time:
        AdapterUtils.first_non_nil([raw["event_date"], raw["event_time"], raw["start_time"]]),
      status: normalize_status(raw["event_status"] || raw["match_status"]),
      score: %{"score" => raw["event_final_result"] || raw["score"] || %{}},
      raw:
        raw
        |> maybe_put_meta("team1_logo", team1_logo)
        |> maybe_put_meta("team2_logo", team2_logo)
        |> maybe_put_meta("season_name", season_name)
        |> maybe_put_meta("venue_name", venue_name)
        |> maybe_put_meta("round_name", round_name)
    }
  end

  defp fetch(config, endpoint, met) do
    fetch_for_feed(config, endpoint, met, %{})
  end

  defp fetch_for_feed(config, endpoint, met, feed) do
    base_url = Map.get(config, "base_url", @default_base_url)
    api_key = Map.get(config, "api_key")

    params =
      config
      |> Map.get("params", %{})
      |> Map.merge(%{"met" => met})
      |> AdapterUtils.merge_params(AdapterUtils.feed_params(feed))
      |> maybe_put_api_key(api_key)

    case Req.get(base_url <> endpoint, params: params, headers: [{"Accept", "application/json"}]) do
      {:ok, %{status: 200, body: body}} -> {:ok, AdapterUtils.as_list(body)}
      {:ok, %{status: status, body: body}} -> {:error, {:http_error, status, body}}
      {:error, reason} -> {:error, reason}
    end
  end

  defp normalize_full_odds_rows(rows, match_id) when is_list(rows) do
    rows
    |> Enum.flat_map(fn row ->
      payload =
        cond do
          is_map(row) and Map.has_key?(row, to_string(match_id)) -> row[to_string(match_id)]
          is_map(row) -> row
          true -> %{}
        end

      Enum.flat_map(payload, fn {market_name, outcomes} ->
        if is_map(outcomes) do
          [
            %{
              "id" => "#{match_id}:#{market_name}",
              "market" => market_name,
              "outcomes" =>
                Enum.flat_map(outcomes, fn {outcome_name, books} ->
                  best =
                    books
                    |> Enum.map(fn
                      {_book, odd} -> parse_decimal(odd)
                      _ -> nil
                    end)
                    |> Enum.reject(&is_nil/1)
                    |> Enum.max(fn -> nil end)

                  if is_nil(best) do
                    []
                  else
                    [%{"name" => outcome_name, "odds" => best}]
                  end
                end)
            }
          ]
        else
          []
        end
      end)
    end)
  end

  defp normalize_full_odds_rows(_, _), do: []

  defp normalize_standard_odds_rows(rows, match_id) when is_list(rows) do
    rows
    |> Enum.flat_map(fn row ->
      if to_string(row["match_id"] || row["event_key"] || "") == to_string(match_id) do
        compact_rows([
          winner_market(row, match_id),
          double_chance_market(row, match_id),
          totals_market(row, match_id, "0.5"),
          totals_market(row, match_id, "1.5"),
          totals_market(row, match_id, "2.5"),
          totals_market(row, match_id, "3.5"),
          btts_market(row, match_id)
        ])
      else
        []
      end
    end)
  end

  defp normalize_standard_odds_rows(_, _), do: []

  defp normalize_live_odds_rows(rows, match_id) when is_list(rows) do
    rows
    |> Enum.flat_map(fn row ->
      if to_string(row["match_id"] || row["event_key"] || "") == to_string(match_id) do
        [
          %{
            "id" => "#{match_id}:#{row["odd_name"] || "live"}",
            "market" => row["odd_name"] || "In-Play",
            "status" => "active",
            "outcomes" =>
              compact_outcomes([
                %{
                  "name" => row["home_team"] || "Home",
                  "odds" => row["odd_1"],
                  "status" => "active"
                },
                %{"name" => "Draw", "odds" => row["odd_x"], "status" => "active"},
                %{
                  "name" => row["away_team"] || "Away",
                  "odds" => row["odd_2"],
                  "status" => "active"
                }
              ])
          }
        ]
      else
        []
      end
    end)
  end

  defp normalize_live_odds_rows(_, _), do: []

  defp winner_market(row, match_id) do
    %{
      "id" => "#{match_id}:match_winner",
      "market" => "Match Winner",
      "outcomes" =>
        compact_outcomes([
          %{"name" => "Home", "odds" => row["odd_1"]},
          %{"name" => "Draw", "odds" => row["odd_x"]},
          %{"name" => "Away", "odds" => row["odd_2"]}
        ])
    }
  end

  defp double_chance_market(row, match_id) do
    %{
      "id" => "#{match_id}:double_chance",
      "market" => "Double Chance",
      "outcomes" =>
        compact_outcomes([
          %{"name" => "1X", "odds" => row["odd_1x"]},
          %{"name" => "12", "odds" => row["odd_12"]},
          %{"name" => "X2", "odds" => row["odd_x2"]}
        ])
    }
  end

  defp totals_market(row, match_id, line) do
    %{
      "id" => "#{match_id}:over_under:#{line}",
      "market" => "Over/Under #{line}",
      "outcomes" =>
        compact_outcomes([
          %{"name" => "Over #{line}", "odds" => row["o+#{line}"]},
          %{"name" => "Under #{line}", "odds" => row["u+#{line}"]}
        ])
    }
  end

  defp btts_market(row, match_id) do
    %{
      "id" => "#{match_id}:btts",
      "market" => "Both Teams to Score",
      "outcomes" =>
        compact_outcomes([
          %{"name" => "Yes", "odds" => row["bts_yes"]},
          %{"name" => "No", "odds" => row["bts_no"]}
        ])
    }
  end

  defp compact_rows(rows), do: Enum.reject(rows, fn row -> (row["outcomes"] || []) == [] end)

  defp compact_outcomes(outcomes) do
    Enum.reject(outcomes, fn outcome ->
      odds = outcome["odds"]
      is_nil(parse_decimal(odds))
    end)
  end

  defp parse_decimal(nil), do: nil
  defp parse_decimal(value) when is_number(value), do: value

  defp parse_decimal(value) when is_binary(value) do
    case Float.parse(String.trim(value)) do
      {parsed, ""} -> parsed
      _ -> nil
    end
  end

  defp parse_decimal(_), do: nil

  defp maybe_put_api_key(params, nil), do: params
  defp maybe_put_api_key(params, key), do: Map.put_new(params, "APIkey", key)

  defp normalize_status(status), do: AdapterUtils.normalize_status(status)

  defp infer_sport(raw), do: AdapterUtils.infer_sport(raw, "football")

  defp maybe_put_meta(map, _key, nil), do: map
  defp maybe_put_meta(map, _key, ""), do: map
  defp maybe_put_meta(map, key, value), do: Map.put(map, key, value)
end
