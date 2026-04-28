defmodule Back.Providers.ApiSports do
  @behaviour Back.Providers.Behaviour
  require Logger
  alias Back.Providers.AdapterUtils
  alias Back.Providers.ApiSportsLiveOddsIndex

  @default_base_url "https://v3.football.api-sports.io"
  @connect_timeout 5_000
  @receive_timeout 20_000

  @impl true
  def fetch_fixtures(config), do: fetch(config, Map.get(config, "fixtures_endpoint", "/fixtures"))

  @impl true
  def fetch_live(config),
    do:
      config
      |> without_fixture_window_params()
      |> fetch(Map.get(config, "live_endpoint", "/fixtures"), %{"live" => "all"})

  def fetch_live_odds_batch(config) do
    config
    |> without_fixture_window_params()
    |> fetch(Map.get(config, "live_odds_endpoint", "/odds/live"))
  end

  @impl true
  def fetch_fixtures_for_feed(config, feed) do
    fetch(
      config,
      Map.get(config, "fixtures_endpoint", "/fixtures"),
      AdapterUtils.api_sports_feed_params(feed)
    )
  end

  @impl true
  def fetch_live_for_feed(config, feed) do
    fetch(
      without_fixture_window_params(config),
      Map.get(config, "live_endpoint", "/fixtures"),
      AdapterUtils.api_sports_feed_params(feed, %{"live" => "all"})
    )
  end

  @impl true
  def fetch_odds_for_match(config, match) do
    fixture_id =
      match[:external_id] ||
        get_in(match, [:raw_data, "fixture", "id"]) ||
        get_in(match, [:raw_data, "fixture_id"])

    if is_nil(fixture_id) do
      {:error, :provider_match_id_missing}
    else
      params = %{"fixture" => fixture_id}

      if live_match_status?(match[:status]) do
        fixture_id
        |> to_string()
        |> fetch_live_odds_from_batch_index(config)
      else
        endpoint = Map.get(config, "odds_endpoint", "/odds")

        with {:ok, rows} <- fetch(without_fixture_window_params(config), endpoint, params) do
          {:ok, normalize_odds_rows(rows)}
        end
      end
    end
  end

  def fetch_fixture_events(config, fixture_id) when is_binary(fixture_id) do
    fetch(without_fixture_window_params(config), "/fixtures/events", %{"fixture" => fixture_id})
  end

  def fetch_fixture_lineups(config, fixture_id) when is_binary(fixture_id) do
    fetch(without_fixture_window_params(config), "/fixtures/lineups", %{"fixture" => fixture_id})
  end

  def fetch_fixture_statistics(config, fixture_id) when is_binary(fixture_id) do
    fetch(without_fixture_window_params(config), "/fixtures/statistics", %{"fixture" => fixture_id})
  end

  def fetch_standings(config, league_id, season_id)
      when is_binary(league_id) and is_binary(season_id) do
    fetch(config, "/standings", %{"league" => league_id, "season" => season_id})
  end

  @impl true
  def normalize(raw) do
    fixture = raw["fixture"] || %{}
    teams = raw["teams"] || %{}
    league = raw["league"] || %{}
    venue = fixture["venue"] || %{}
    team1_name = get_in(teams, ["home", "name"]) || raw["team1"] || "Team 1"
    team2_name = get_in(teams, ["away", "name"]) || raw["team2"] || "Team 2"
    team1_logo = get_in(teams, ["home", "logo"])
    team2_logo = get_in(teams, ["away", "logo"])
    season_name = normalize_season_name(league["season"])
    venue_name = venue["name"] || raw["venue_name"]
    round_name = league["round"] || raw["round_name"]
    elapsed_minute = normalize_integer(get_in(fixture, ["status", "elapsed"])) || 0
    stoppage_minute = normalize_integer(get_in(fixture, ["status", "extra"])) || 0
    home_score = resolve_score(raw, "home")
    away_score = resolve_score(raw, "away")
    home_red_cards = statistic_value(raw, "home", team1_name, "Red Cards")
    away_red_cards = statistic_value(raw, "away", team2_name, "Red Cards")
    home_corners = statistic_value(raw, "home", team1_name, "Corner Kicks")
    away_corners = statistic_value(raw, "away", team2_name, "Corner Kicks")
    home_shots_on_target = statistic_value(raw, "home", team1_name, "Shots on Goal")
    away_shots_on_target = statistic_value(raw, "away", team2_name, "Shots on Goal")

    tempo_index =
      tempo_index(
        elapsed_minute,
        home_shots_on_target,
        away_shots_on_target,
        home_corners,
        away_corners
      )

    %{
      external_id: to_string(fixture["id"] || raw["id"] || raw["match_id"]),
      provider: "api_sports",
      sport: infer_sport(raw),
      team1: team1_name,
      team2: team2_name,
      start_time: AdapterUtils.first_non_nil([fixture["date"], raw["start_time"], raw["date"]]),
      status:
        normalize_fixture_status(
          get_in(fixture, ["status", "short"]),
          get_in(fixture, ["status", "long"])
        ),
      score: %{
        "score" => raw["score"] || %{},
        "goals" =>
          (raw["goals"] || %{})
          |> Map.put_new("home", home_score)
          |> Map.put_new("away", away_score)
      },
      elapsed_minute: elapsed_minute,
      stoppage_minute: stoppage_minute,
      home_score: home_score,
      away_score: away_score,
      home_red_cards: home_red_cards,
      away_red_cards: away_red_cards,
      home_corners: home_corners,
      away_corners: away_corners,
      home_shots_on_target: home_shots_on_target,
      away_shots_on_target: away_shots_on_target,
      tempo_index: tempo_index,
      raw:
        raw
        |> maybe_put_meta("team1_logo", team1_logo)
        |> maybe_put_meta("team2_logo", team2_logo)
        |> maybe_put_meta("season_name", season_name)
        |> maybe_put_meta("venue_name", venue_name)
        |> maybe_put_meta("round_name", round_name)
        |> maybe_put_meta("elapsed_minute", elapsed_minute)
        |> maybe_put_meta("stoppage_minute", stoppage_minute)
        |> maybe_put_meta("home_red_cards", home_red_cards)
        |> maybe_put_meta("away_red_cards", away_red_cards)
        |> maybe_put_meta("home_corners", home_corners)
        |> maybe_put_meta("away_corners", away_corners)
        |> maybe_put_meta("home_shots_on_target", home_shots_on_target)
        |> maybe_put_meta("away_shots_on_target", away_shots_on_target)
        |> maybe_put_meta("tempo_index", tempo_index)
    }
  end

  defp fetch(config, endpoint, extra_params \\ %{}) do
    base_url = Map.get(config, "base_url", @default_base_url)
    api_key = Map.get(config, "api_key")

    headers =
      [{"Accept", "application/json"}] ++
        if(api_key, do: [{"x-apisports-key", api_key}], else: [])

    params =
      config
      |> Map.get("params", %{})
      |> Map.merge(extra_params)

    case Req.get(base_url <> endpoint,
           headers: headers,
           params: params,
           receive_timeout: @receive_timeout,
           connect_options: [timeout: @connect_timeout]
         ) do
      {:ok, %{status: 200, body: body}} ->
        with :ok <- ensure_success_body(body) do
          {:ok, AdapterUtils.as_list(body)}
        end

      {:ok, %{status: status, body: body}} ->
        {:error, {:http_error, status, body}}

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp without_fixture_window_params(config) when is_map(config) do
    update_in(config, ["params"], fn
      params when is_map(params) -> Map.drop(params, ["next", "last", :next, :last])
      other -> other
    end)
  end

  defp ensure_success_body(%{"errors" => errors}) when is_map(errors) and map_size(errors) > 0,
    do: {:error, {:provider_error, errors}}

  defp ensure_success_body(%{"errors" => errors}) when is_list(errors) and errors != [],
    do: {:error, {:provider_error, errors}}

  defp ensure_success_body(%{"error" => error}) when not is_nil(error) and error != "",
    do: {:error, {:provider_error, error}}

  defp ensure_success_body(_), do: :ok

  def normalize_odds_rows(rows) when is_list(rows) do
    rows
    |> Enum.flat_map(fn row ->
      row_status = normalize_market_availability(row)

      if row_status == :closed do
        []
      else
        normalize_row_odds(row, row_status)
      end
    end)
  end

  def normalize_odds_rows(_), do: []

  defp normalize_row_odds(row, row_status) when is_map(row) do
    fixture_ref =
      row["id"] ||
        row["fixture_id"] ||
        get_in(row, ["fixture", "id"]) ||
        "fixture"

    cond do
      is_list(row["bookmakers"]) and row["bookmakers"] != [] ->
        normalize_bookmaker_row(row, fixture_ref)

      is_list(row["odds"]) and row["odds"] != [] ->
        normalize_live_odds_row(row, row_status, fixture_ref)

      true ->
        []
    end
  end

  defp normalize_row_odds(_, _), do: []

  defp normalize_bookmaker_row(row, fixture_ref) do
    bookmakers = row["bookmakers"] || []

    Enum.flat_map(bookmakers, fn bookmaker ->
      bets = bookmaker["bets"] || []
      bookmaker_id = bookmaker["id"] || bookmaker["key"]
      bookmaker_name = bookmaker["name"] || bookmaker["title"] || "bookmaker"

      bets
      |> Enum.map(fn bet ->
        bet_status = normalize_market_availability(bet)

        if bet_status == :closed do
          nil
        else
          available_values =
            (bet["values"] || [])
            |> Enum.map(fn value ->
              value_status = normalize_market_availability(value)

              if value_status == :closed do
                nil
              else
                %{
                  "name" => value["value"] || value["label"],
                  "odds" => value["odd"] || value["value_odds"] || value["price"],
                  "status" => to_string(value_status),
                  "blocked" => value["blocked"],
                  "stopped" => value["stopped"],
                  "finished" => value["finished"],
                  "suspended" => value["suspended"],
                  "line" => value["handicap"],
                  "main" => value["main"]
                }
              end
            end)
            |> Enum.reject(&is_nil/1)

          if available_values == [] do
            nil
          else
            %{
              "id" => "#{fixture_ref}:#{bookmaker_id}:#{bet["id"] || bet["name"]}",
              "market_id" => bet["id"],
              "bookmaker_id" => bookmaker_id,
              "market" => bet["name"] || bet["label"] || "Market",
              "bookmaker" => bookmaker_name,
              "status" => to_string(bet_status),
              "blocked" => bet["blocked"] || row["blocked"],
              "stopped" => bet["stopped"] || row["stopped"],
              "finished" => bet["finished"] || row["finished"],
              "suspended" => bet["suspended"] || row["suspended"],
              "outcomes" => available_values
            }
          end
        end
      end)
      |> Enum.reject(&is_nil/1)
    end)
  end

  defp normalize_live_odds_row(row, row_status, fixture_ref) do
    status_meta = row["status"] || %{}

    row["odds"]
    |> Enum.map(fn market ->
      market_status = normalize_market_availability(market)

      if market_status == :closed do
        nil
      else
        available_values =
          (market["values"] || [])
          |> Enum.map(fn value ->
            value_status = normalize_market_availability(value)

            if value_status == :closed do
              nil
            else
              %{
                "name" => value["value"] || value["label"],
                "odds" => value["odd"] || value["value_odds"] || value["price"],
                "status" => to_string(value_status),
                "blocked" => value["blocked"] || status_meta["blocked"],
                "stopped" => value["stopped"] || status_meta["stopped"],
                "finished" => value["finished"] || status_meta["finished"],
                "suspended" => value["suspended"],
                "line" => value["handicap"],
                "main" => value["main"]
              }
            end
          end)
          |> Enum.reject(&is_nil/1)

        if available_values == [] do
          nil
        else
          %{
            "id" => "#{fixture_ref}:live:#{market["id"] || market["name"]}",
            "market_id" => market["id"],
            "bookmaker_id" => "live",
            "bookmaker" => "api_sports_live",
            "market" => market["name"] || market["label"] || "Market",
            "status" =>
              to_string(if(market_status == :active, do: row_status, else: market_status)),
            "blocked" => market["blocked"] || status_meta["blocked"],
            "stopped" => market["stopped"] || status_meta["stopped"],
            "finished" => market["finished"] || status_meta["finished"],
            "suspended" => market["suspended"],
            "outcomes" => available_values
          }
        end
      end
    end)
    |> Enum.reject(&is_nil/1)
  end

  defp fetch_live_odds_from_batch_index(fixture_id, config) when is_binary(fixture_id) do
    case ApiSportsLiveOddsIndex.get(fixture_id) do
      %{rows: rows} when is_list(rows) and rows != [] ->
        {:ok, rows}

      _ ->
        _ = ApiSportsLiveOddsIndex.request_refresh_async()

        case ApiSportsLiveOddsIndex.get(fixture_id, allow_stale?: true) do
          %{rows: rows} when is_list(rows) and rows != [] ->
            Logger.warning(
              "[API_SPORTS] using stale live odds batch cache for fixture=#{fixture_id}"
            )

            {:ok, rows}

          _ ->
            fetch_live_odds_direct_fallback(config, fixture_id)
        end
    end
  end

  defp fetch_live_odds_direct_fallback(config, fixture_id) when is_binary(fixture_id) do
    with {:error, _reason} <- fetch_live_odds_batch_for_fixture(config, fixture_id),
         true <- Application.get_env(:back, :api_sports_live_odds_direct_fallback_enabled, true) do
      endpoint = Map.get(config, "odds_endpoint", "/odds")

      case fetch(without_fixture_window_params(config), endpoint, %{"fixture" => fixture_id}) do
        {:ok, rows} ->
          normalized = normalize_odds_rows(rows)

          if normalized == [] do
            {:error, :live_odds_batch_unavailable}
          else
            Logger.warning(
              "[API_SPORTS] live odds batch cache miss fixture=#{fixture_id}; used per-fixture odds fallback"
            )

            {:ok, normalized}
          end

        {:error, _reason} = error ->
          error
      end
    else
      {:ok, rows} ->
        {:ok, rows}

      _ ->
        {:error, :live_odds_batch_unavailable}
    end
  end

  defp fetch_live_odds_batch_for_fixture(config, fixture_id) do
    case fetch_live_odds_batch(config) do
      {:ok, rows} ->
        filtered_rows =
          Enum.filter(rows, fn row ->
            row_fixture_id =
              row["fixture_id"] ||
                get_in(row, ["fixture", "id"]) ||
                get_in(row, ["fixture", "fixture_id"]) ||
                row["id"]

            to_string(row_fixture_id || "") == fixture_id
          end)

        normalized = normalize_odds_rows(filtered_rows)

        if normalized == [] do
          {:error, :live_odds_batch_unavailable}
        else
          Logger.warning(
            "[API_SPORTS] live odds batch cache miss fixture=#{fixture_id}; used direct /odds/live fallback"
          )

          {:ok, normalized}
        end

      {:error, _reason} = error ->
        error
    end
  end

  defp normalize_status(status), do: AdapterUtils.normalize_status(status)

  defp normalize_fixture_status(short, long) do
    long_text = normalized_text(long)

    if hold_fixture_status_text?(long_text) do
      normalize_status(long_text)
    else
      normalize_status(AdapterUtils.first_non_nil([short, long]))
    end
  end

  defp hold_fixture_status_text?(text) when is_binary(text) do
    Regex.match?(
      ~r/\b(pst|postpon|postponed|canc|cancel|cancelled|abd|abandon|abandoned|awd|technical loss|walkover|wo|susp|suspended|interrupted|int|delayed|delay)\b/,
      text
    )
  end

  defp hold_fixture_status_text?(_), do: false

  defp normalized_text(value) do
    value
    |> to_string()
    |> String.downcase()
    |> String.trim()
  end

  defp infer_sport(raw), do: AdapterUtils.infer_sport(raw, "football")

  defp normalize_season_name(value) when is_integer(value), do: Integer.to_string(value)
  defp normalize_season_name(value) when is_binary(value), do: value
  defp normalize_season_name(_), do: nil

  defp normalize_integer(nil), do: nil
  defp normalize_integer(value) when is_integer(value), do: value
  defp normalize_integer(value) when is_float(value), do: trunc(value)

  defp normalize_integer(value) when is_binary(value) do
    case Integer.parse(String.trim(value)) do
      {parsed, _} -> parsed
      _ -> nil
    end
  end

  defp normalize_integer(_), do: nil

  defp resolve_score(raw, side) when side in ["home", "away"] do
    direct =
      normalize_integer(
        get_in(raw, ["goals", side]) ||
          get_in(raw, ["score", "current", side]) ||
          get_in(raw, ["score", "fulltime", side]) ||
          get_in(raw, ["score", "halftime", side]) ||
          get_in(raw, ["score", "extratime", side]) ||
          get_in(raw, ["score", "penalty", side])
      )

    if is_integer(direct), do: max(direct, 0), else: 0
  end

  defp statistic_value(raw, side, team_name, type) do
    stats = raw["statistics"] || []

    row =
      Enum.find(stats, fn item ->
        team = item["team"] || %{}
        String.downcase(to_string(team["name"] || side)) == String.downcase(team_name || side)
      end) ||
        default_statistics_row(stats, side)

    statistic =
      (row && Enum.find(row["statistics"] || [], fn item -> item["type"] == type end)) || %{}

    normalize_integer(statistic["value"]) || 0
  end

  defp default_statistics_row(stats, "home") when is_list(stats), do: Enum.at(stats, 0)
  defp default_statistics_row(stats, "away") when is_list(stats), do: Enum.at(stats, 1)
  defp default_statistics_row(_, _), do: nil

  defp normalize_market_availability(%{} = value) do
    AdapterUtils.normalize_market_availability(value["status"])
  end

  defp normalize_market_availability(value), do: AdapterUtils.normalize_market_availability(value)

  defp tempo_index(elapsed, home_sot, away_sot, home_corners, away_corners) do
    total_pressure = home_sot + away_sot + home_corners + away_corners
    minute_weight = if elapsed > 0, do: min(elapsed / 90, 1.0), else: 0.2
    Decimal.from_float(Float.round(total_pressure * 0.1 + minute_weight, 4))
  end

  defp maybe_put_meta(map, _key, nil), do: map
  defp maybe_put_meta(map, _key, ""), do: map
  defp maybe_put_meta(map, key, value), do: Map.put(map, key, value)

  defp live_match_status?(status) do
    key = AdapterUtils.normalize_status(status)
    key == "live"
  end
end
