defmodule Back.Providers.Sportmonks do
  @behaviour Back.Providers.Behaviour
  alias Back.Providers.AdapterUtils
  alias Back.Cricket.Sportsmonks.Normalizers

  @default_base_url "https://cricket.sportmonks.com/api/v2.0"
  @connect_timeout 5_000
  @receive_timeout 20_000
  @default_includes [
    "localteam",
    "visitorteam",
    "league",
    "season",
    "venue",
    "stage",
    "runs",
    "scoreboards"
  ]
  @detail_includes [
    "localteam",
    "visitorteam",
    "league",
    "season",
    "venue",
    "runs",
    "batting",
    "bowling",
    "balls",
    "scoreboards"
  ]

  @impl true
  def fetch_fixtures(config), do: fetch(config, Map.get(config, "fixtures_endpoint", "/fixtures"))

  @impl true
  def fetch_live(config) do
    with {:ok, rows} <-
           fetch(config, Map.get(config, "live_endpoint", "/livescores"), include: false) do
      {:ok, mark_live_source(rows)}
    end
  end

  @impl true
  def fetch_fixtures_for_feed(config, feed) do
    endpoint = Map.get(config, "fixtures_endpoint", "/fixtures")
    params = AdapterUtils.sportmonks_feed_params(feed)

    case fetch_with_params(config, build_feed_endpoint(endpoint, feed), params) do
      {:ok, rows} -> {:ok, enrich_fixture_rows(config, rows)}
      {:error, {:http_error, 400, _body}} -> fetch_feed_fixtures_fallback(config, feed, params)
      other -> other
    end
  end

  @impl true
  def fetch_live_for_feed(config, feed) do
    endpoint = build_feed_endpoint(Map.get(config, "live_endpoint", "/livescores"), feed)
    feed_params = AdapterUtils.sportmonks_feed_params(feed)

    case fetch_with_params(config, endpoint, feed_params, include: false) do
      {:ok, rows} when is_list(rows) and rows != [] ->
        {:ok, enrich_fixture_rows(config, mark_live_source(rows))}

      {:ok, []} ->
        fetch_live_for_feed_fallback(config, feed, endpoint)

      {:error, {:http_error, status, _body}}
      when status in [400, 404, 422] ->
        fetch_live_for_feed_fallback(config, feed, endpoint)

      other ->
        other
    end
  end

  @impl true
  def fetch_odds_for_match(config, match) do
    fixture_id = match["external_id"] || match[:external_id]

    if is_binary(fixture_id) and String.trim(fixture_id) != "" do
      endpoint_template =
        Map.get(
          config,
          "provider_odds_endpoint",
          Map.get(config, "odds_endpoint", "/odds/fixtures/{fixture_id}")
        )

      endpoint = AdapterUtils.build_endpoint(endpoint_template, %{"fixture_id" => fixture_id})

      params =
        config
        |> Map.get("provider_odds_params", %{})
        |> AdapterUtils.merge_params(%{"fixture_id" => fixture_id})

      fetch_with_params(config, endpoint, params)
    else
      {:error, :missing_fixture_id}
    end
  end

  def fetch_fixture_detail_for_fixture(config, fixture_id)
      when is_map(config) and (is_binary(fixture_id) or is_integer(fixture_id)) do
    fetch_fixture_detail(config, fixture_id)
  end

  @impl true
  def normalize(raw) do
    {team1, team2, team1_logo, team2_logo} = extract_teams(raw)
    live_state = extract_live_state(raw, team1, team2)
    cricket_context = Normalizers.normalize(raw)
    normalized_status = normalize_status(raw["status"], live_state, raw)

    %{
      external_id: to_string(raw["id"] || raw["fixture_id"] || raw["match_id"]),
      provider: "sportmonks",
      sport: AdapterUtils.infer_sport(raw, "cricket"),
      team1: team1,
      team2: team2,
      start_time:
        AdapterUtils.first_non_nil([raw["starting_at"], raw["start_time"], raw["date"]]),
      status: normalized_status,
      score: live_state.score,
      live_state_version: 0,
      current_innings: live_state.current_innings,
      current_over: live_state.current_over,
      current_ball_in_over: live_state.current_ball_in_over,
      batting_team: live_state.batting_team,
      bowling_team: live_state.bowling_team,
      runs_total: live_state.runs_total,
      wickets_total: live_state.wickets_total,
      target_runs: live_state.target_runs,
      required_run_rate: live_state.required_run_rate,
      current_run_rate: live_state.current_run_rate,
      market_state: %{"last_6_balls_pattern" => live_state.last_6_balls_pattern},
      last_ball_event_type: live_state.last_ball_event_type,
      raw:
        raw
        |> Map.put("cricket_context", cricket_context)
        |> maybe_put_meta("team1_logo", team1_logo)
        |> maybe_put_meta("team2_logo", team2_logo)
        |> maybe_put_meta("competition_name", extract_competition_name(raw))
        |> maybe_put_meta("season_name", extract_season_name(raw))
        |> maybe_put_meta("venue_name", extract_venue_name(raw))
        |> maybe_put_meta("round_name", extract_round_name(raw))
        |> maybe_put_meta("last_6_balls_pattern", live_state.last_6_balls_pattern)
    }
  end

  defp fetch(config, endpoint, opts \\ []) do
    fetch_with_params(config, endpoint, %{}, opts)
  end

  defp fetch_with_params(config, endpoint, extra_params, opts \\ []) do
    base_url =
      config
      |> Map.get("base_url", @default_base_url)
      |> normalize_base_url()

    api_key = Map.get(config, "api_key")

    params =
      config
      |> Map.get("params", %{})
      |> AdapterUtils.merge_params(extra_params)
      |> with_default_include(opts)

    Enum.reduce_while(
      build_auth_attempts(api_key),
      {:error, {:http_error, 400, "provider request failed"}},
      fn attempt, _acc ->
        case perform_request(base_url, endpoint, params, attempt) do
          {:ok, _body} = ok ->
            {:halt, ok}

          {:error, {:http_error, status, _body} = reason}
          when status in [400, 401, 403, 404, 422, 523] ->
            {:cont, {:error, reason}}

          {:error, {:http_error, 429, _body}} ->
            # Rate limited — back off and halt (caller will retry on next scheduled refresh)
            Process.sleep(2_000)
            {:halt, {:error, {:http_error, 429, "rate_limited"}}}

          other ->
            {:halt, other}
        end
      end
    )
  end

  defp perform_request(base_url, endpoint, params, %{headers: headers, extra_params: extra_params}) do
    merged_params = AdapterUtils.merge_params(params, extra_params)

    case Req.get(base_url <> endpoint,
           headers: headers,
           params: merged_params,
           receive_timeout: @receive_timeout,
           connect_options: [timeout: @connect_timeout]
         ) do
      {:ok, %{status: 200, body: body}} -> {:ok, AdapterUtils.as_list(body)}
      {:ok, %{status: status, body: body}} -> {:error, {:http_error, status, body}}
      {:error, reason} -> {:error, reason}
    end
  end

  defp build_auth_attempts(api_key) when is_binary(api_key) do
    trimmed = String.trim(api_key)

    if trimmed == "" do
      [%{headers: [{"Accept", "application/json"}], extra_params: %{}}]
    else
      [
        %{
          headers: [{"Accept", "application/json"}],
          extra_params: %{"api_token" => trimmed}
        },
        %{
          headers: [
            {"Accept", "application/json"},
            {"Authorization", "Bearer #{trimmed}"}
          ],
          extra_params: %{}
        }
      ]
    end
  end

  defp build_auth_attempts(_),
    do: [%{headers: [{"Accept", "application/json"}], extra_params: %{}}]

  defp fetch_feed_fixtures_fallback(config, feed, params) do
    season_id = feed["season_id"] || feed[:season_id]

    if is_binary(season_id) and String.trim(season_id) != "" do
      stripped_params = Map.drop(params, ["filter[league_id]", "filter[season_id]"])

      case fetch_with_params(config, "/seasons/#{season_id}/fixtures", stripped_params) do
        {:ok, rows} -> {:ok, enrich_fixture_rows(config, rows)}

        {:error, {:http_error, status, _body}} when status in [400, 404, 422] ->
          case fetch_with_params(config, "/fixtures", params, include: false) do
            {:ok, rows} -> {:ok, enrich_fixture_rows(config, rows)}
            other -> other
          end

        other ->
          other
      end
    else
      {:error,
       {:http_error, 400, "sportmonks feed requires a valid season_id for fixture import"}}
    end
  end

  defp fetch_live_for_feed_fallback(config, feed, endpoint) do
    with {:ok, rows} <- fetch_with_params(config, endpoint, %{}, include: false) do
      filtered =
        rows
        |> mark_live_source()
        |> Enum.filter(&sportmonks_live_row_matches_feed?(&1, feed))

      {:ok, enrich_fixture_rows(config, filtered)}
    end
  end

  defp sportmonks_live_row_matches_feed?(row, feed) when is_map(row) and is_map(feed) do
    feed_league = to_string(feed["league_id"] || feed[:league_id] || "")
    feed_season = to_string(feed["season_id"] || feed[:season_id] || "")

    row_league =
      to_string(
        row["league_id"] ||
          get_in(row, ["league", "id"]) ||
          row[:league_id] ||
          get_in(row, [:league, :id]) ||
          ""
      )

    row_season =
      to_string(
        row["season_id"] ||
          get_in(row, ["season", "id"]) ||
          row[:season_id] ||
          get_in(row, [:season, :id]) ||
          ""
      )

    cond do
      feed_season != "" and row_season != "" -> row_season == feed_season
      feed_league != "" and row_league != "" -> row_league == feed_league
      true -> true
    end
  end

  defp sportmonks_live_row_matches_feed?(_row, _feed), do: false

  defp enrich_fixture_rows(config, rows) when is_list(rows) do
    Enum.map(rows, fn row ->
      maybe_enrich_fixture_row(config, row)
    end)
  end

  defp maybe_enrich_fixture_row(config, row) when is_map(row) do
    if has_team_context?(row) do
      row
    else
      fixture_id = row["id"] || row[:id]

      case fetch_fixture_detail(config, fixture_id) do
        {:ok, detail} when is_map(detail) -> Map.merge(row, detail)
        _ -> row
      end
    end
  end

  defp maybe_enrich_fixture_row(_config, row), do: row

  defp fetch_fixture_detail(_config, nil), do: {:error, :missing_fixture_id}

  defp fetch_fixture_detail(config, fixture_id) do
    base_url =
      config
      |> Map.get("base_url", @default_base_url)
      |> normalize_base_url()

    base_params = Map.get(config, "params", %{})
    minimal_detail_params = with_detail_include(base_params)
    fallback_params = Map.delete(base_params, "include")

    api_key = Map.get(config, "api_key")

    Enum.reduce_while(
      build_auth_attempts(api_key),
      {:error, {:http_error, 400, "provider request failed"}},
      fn attempt, _acc ->
        primary_params = AdapterUtils.merge_params(minimal_detail_params, attempt.extra_params)

        case request_fixture_detail(base_url, fixture_id, attempt.headers, primary_params) do
          {:ok, detail} ->
            {:halt, {:ok, detail}}

          {:error, {:http_error, status, _body}}
          when status in [400, 404, 422] ->
            secondary_params = AdapterUtils.merge_params(fallback_params, attempt.extra_params)

            case request_fixture_detail(base_url, fixture_id, attempt.headers, secondary_params) do
              {:ok, detail} ->
                {:halt, {:ok, detail}}

              {:error, {:http_error, retry_status, _}}
              when retry_status in [400, 401, 403, 404, 422, 523] ->
                {:cont, {:error, {:http_error, retry_status, "provider request failed"}}}

              {:error, reason} ->
                {:halt, {:error, reason}}
            end

          {:error, {:http_error, status, _body}} when status in [401, 403, 523] ->
            {:cont, {:error, {:http_error, status, "provider request failed"}}}

          {:error, reason} ->
            {:halt, {:error, reason}}
        end
      end
    )
  end

  defp request_fixture_detail(base_url, fixture_id, headers, params) do
    case Req.get(base_url <> "/fixtures/#{fixture_id}",
           headers: headers,
           params: params,
           receive_timeout: @receive_timeout,
           connect_options: [timeout: @connect_timeout]
         ) do
      {:ok, %{status: 200, body: %{"data" => detail}}} when is_map(detail) ->
        {:ok, detail}

      {:ok, %{status: 200, body: detail}} when is_map(detail) ->
        {:ok, detail}

      {:ok, %{status: status, body: body}} ->
        {:error, {:http_error, status, body}}

      {:error, reason} ->
        {:error, reason}

      other ->
        {:error, other}
    end
  end

  defp has_team_context?(row) when is_map(row) do
    teams_present? =
      (present_map?(row["localteam"]) and present_map?(row["visitorteam"])) or
        (present_map?(row["localTeam"]) and present_map?(row["visitorTeam"]))

    participants = row["participants"] || row["teams"] || []

    teams_present? or (is_list(participants) and length(participants) >= 2)
  end

  defp present_map?(value) when is_map(value), do: map_size(value) > 0
  defp present_map?(_), do: false

  defp build_feed_endpoint(endpoint, feed) do
    AdapterUtils.build_endpoint(endpoint, %{
      "season_id" => feed["season_id"] || feed[:season_id],
      "league_id" => feed["league_id"] || feed[:league_id],
      "competition_key" => feed["competition_key"] || feed[:competition_key]
    })
  end

  defp extract_teams(raw) do
    localteam = raw["localteam"] || raw["localTeam"] || raw["home_team"] || %{}
    visitorteam = raw["visitorteam"] || raw["visitorTeam"] || raw["away_team"] || %{}
    participants = get_in(raw, ["participants"]) || get_in(raw, ["teams"]) || []

    cond do
      is_map(localteam) and map_size(localteam) > 0 and is_map(visitorteam) and
          map_size(visitorteam) > 0 ->
        {
          team_name(localteam, "Team 1"),
          team_name(visitorteam, "Team 2"),
          team_logo(localteam),
          team_logo(visitorteam)
        }

      is_list(participants) and length(participants) >= 2 ->
        [a, b | _] = participants

        {
          team_name(a, "Team 1"),
          team_name(b, "Team 2"),
          team_logo(a),
          team_logo(b)
        }

      true ->
        {
          raw["team1"] || "Team 1",
          raw["team2"] || "Team 2",
          nil,
          nil
        }
    end
  end

  defp team_name(team, fallback) when is_map(team) do
    team["name"] || team["fullname"] || team["short_code"] || fallback
  end

  defp team_logo(team) when is_map(team) do
    team["image_path"] || team["logo_path"] || team["logo"] || team["image"]
  end

  defp extract_competition_name(raw) do
    get_in(raw, ["league", "name"]) || raw["league_name"] || raw["name"]
  end

  defp extract_season_name(raw) do
    get_in(raw, ["season", "name"]) || raw["season_name"]
  end

  defp extract_venue_name(raw) do
    get_in(raw, ["venue", "name"]) || raw["venue_name"]
  end

  defp extract_round_name(raw) do
    raw["round"] || get_in(raw, ["stage", "name"])
  end

  defp maybe_put_meta(raw, _key, nil), do: raw
  defp maybe_put_meta(raw, key, value), do: Map.put(raw, key, value)

  defp with_default_include(params, opts) when is_map(params) do
    include? = Keyword.get(opts, :include, true)

    if not include? do
      params
    else
      with_default_include_enabled(params)
    end
  end

  defp with_default_include_enabled(params) when is_map(params) do
    case params["include"] || params[:include] do
      nil ->
        Map.put(params, "include", Enum.join(@default_includes, ","))

      include when is_binary(include) ->
        merged =
          include
          |> String.split(",", trim: true)
          |> Enum.concat(@default_includes)
          |> Enum.map(&String.trim/1)
          |> Enum.reject(&(&1 == ""))
          |> Enum.uniq()
          |> Enum.join(",")

        Map.put(params, "include", merged)

      _ ->
        params
    end
  end

  defp with_detail_include(params) when is_map(params) do
    existing =
      case params["include"] || params[:include] do
        include when is_binary(include) ->
          include
          |> String.split(",", trim: true)
          |> Enum.map(&String.trim/1)
          |> Enum.reject(&(&1 == ""))

        _ ->
          []
      end

    include =
      existing
      |> Enum.concat(@detail_includes)
      |> Enum.uniq()
      |> Enum.join(",")

    Map.put(params, "include", include)
  end

  defp normalize_base_url(url) when is_binary(url) do
    case String.trim(url) do
      "https://api.sportmonks.com/v3/cricket" -> @default_base_url
      "https://api.sportmonks.com/v3/cricket/" -> @default_base_url
      other -> String.trim_trailing(other, "/")
    end
  end

  defp normalize_base_url(_), do: @default_base_url

  defp normalize_status(%{"state" => state}), do: normalize_status(state)
  defp normalize_status(state), do: AdapterUtils.normalize_status(state)

  defp normalize_status(raw_status, live_state, raw) do
    status = normalize_status(raw_status)

    cond do
      status in ["completed", "cancelled"] or terminal_status_text?(raw_status) ->
        status

      status == "scheduled" ->
        status

      livescores_feed_row?(raw) ->
        "live"

      live_signal?(live_state, raw) ->
        "live"

      true ->
        status
    end
  end

  defp terminal_status_text?(value) do
    value
    |> to_string()
    |> String.downcase()
    |> String.trim()
    |> String.replace(~r/[^a-z0-9]+/, " ")
    |> then(fn status ->
      status in ["aban", "abandoned", "postp", "postponed", "canc", "cancelled", "no result"] or
        String.contains?(status, "abandon") or
        String.contains?(status, "postpon") or
        String.contains?(status, "cancel")
    end)
  end

  defp live_signal?(live_state, raw) do
    truthy?(raw["live"]) or
      truthy?(raw["is_live"]) or
      positive_integer?(live_state.runs_total) or
      positive_integer?(live_state.wickets_total) or
      positive_decimal?(live_state.current_over)
  end

  defp livescores_feed_row?(raw) when is_map(raw) do
    raw["_source_kind"] == "livescores" or raw["_source_endpoint"] == "/livescores"
  end

  defp livescores_feed_row?(_), do: false

  defp positive_integer?(value) when is_integer(value), do: value > 0
  defp positive_integer?(_), do: false

  defp positive_decimal?(%Decimal{} = value), do: Decimal.compare(value, Decimal.new(0)) == :gt
  defp positive_decimal?(_), do: false

  defp extract_live_state(raw, team1, team2) do
    runs = List.wrap(raw["runs"])
    batting = List.wrap(raw["batting"])
    bowling = List.wrap(raw["bowling"])
    balls = List.wrap(raw["balls"])

    scoreboard_key = active_scoreboard_key(raw, runs, batting, bowling, balls)
    innings_no = scoreboard_inning(scoreboard_key)
    active_runs = runs_for_scoreboard(runs, scoreboard_key)
    previous_runs = previous_runs_for_inning(runs, innings_no)
    latest_ball = latest_ball_for_scoreboard(balls, scoreboard_key)
    batting_team = resolve_batting_team(raw, active_runs, latest_ball, team1, team2)
    bowling_team = resolve_bowling_team(raw, batting_team, team1, team2)
    current_over = resolve_current_over(active_runs, latest_ball)
    runs_total = integer_or_zero(active_runs["score"])
    wickets_total = integer_or_zero(active_runs["wickets"])
    target_runs = resolve_target_runs(previous_runs, innings_no)
    current_run_rate = resolve_current_run_rate(runs_total, current_over)
    required_run_rate = resolve_required_run_rate(target_runs, runs_total, current_over, raw)
    last_6_balls_pattern = build_last_6_balls_pattern(balls, scoreboard_key)

    %{
      current_innings: innings_no,
      current_over: current_over,
      current_ball_in_over: resolve_current_ball_in_over(latest_ball),
      batting_team: batting_team,
      bowling_team: bowling_team,
      runs_total: runs_total,
      wickets_total: wickets_total,
      target_runs: target_runs,
      required_run_rate: required_run_rate,
      current_run_rate: current_run_rate,
      last_6_balls_pattern: last_6_balls_pattern,
      last_ball_event_type: resolve_last_ball_event_type(latest_ball),
      score: %{
        "score" => %{
          "runs" => runs_total,
          "wickets" => wickets_total,
          "overs" => decimal_or_string(current_over),
          "batting_team" => batting_team,
          "bowling_team" => bowling_team,
          "target_runs" => target_runs,
          "current_run_rate" => decimal_or_string(current_run_rate),
          "required_run_rate" => decimal_or_string(required_run_rate),
          "last_6_balls_pattern" => last_6_balls_pattern
        }
      }
    }
  end

  defp active_scoreboard_key(raw, runs, batting, bowling, balls) do
    batting_active =
      Enum.find_value(batting, fn entry ->
        if truthy?(entry["active"]), do: entry["scoreboard"], else: nil
      end)

    bowling_active =
      Enum.find_value(bowling, fn entry ->
        if truthy?(entry["active"]), do: entry["scoreboard"], else: nil
      end)

    latest_ball_scoreboard =
      balls
      |> Enum.sort_by(&ball_sort_key/1)
      |> List.last()
      |> case do
        nil -> nil
        ball -> ball["scoreboard"]
      end

    cond do
      present?(batting_active) ->
        batting_active

      present?(bowling_active) ->
        bowling_active

      present?(latest_ball_scoreboard) ->
        latest_ball_scoreboard

      truthy?(raw["live"]) and Enum.any?(runs) ->
        runs
        |> Enum.max_by(&integer_or_zero(&1["inning"]))
        |> Map.get("inning")
        |> inning_to_scoreboard()

      Enum.any?(runs) ->
        runs
        |> Enum.max_by(&integer_or_zero(&1["inning"]))
        |> Map.get("inning")
        |> inning_to_scoreboard()

      true ->
        "S1"
    end
  end

  defp runs_for_scoreboard(runs, scoreboard_key) do
    inning = scoreboard_inning(scoreboard_key)
    Enum.find(runs, %{}, fn entry -> integer_or_zero(entry["inning"]) == inning end)
  end

  defp previous_runs_for_inning(runs, inning) when inning > 1 do
    Enum.find(runs, %{}, fn entry -> integer_or_zero(entry["inning"]) == inning - 1 end)
  end

  defp previous_runs_for_inning(_runs, _inning), do: %{}

  defp latest_ball_for_scoreboard(balls, scoreboard_key) do
    balls
    |> Enum.filter(fn ball -> ball["scoreboard"] == scoreboard_key end)
    |> Enum.sort_by(&ball_sort_key/1)
    |> List.last()
  end

  defp ball_sort_key(ball) do
    case ball["ball"] do
      value when is_integer(value) ->
        value * 10

      value when is_float(value) ->
        round(value * 10)

      value when is_binary(value) ->
        case Float.parse(value) do
          {parsed, _} -> round(parsed * 10)
          _ -> 0
        end

      _ ->
        0
    end
  end

  defp resolve_batting_team(raw, active_runs, latest_ball, team1, team2) do
    team_id =
      active_runs["team_id"] ||
        get_in(latest_ball || %{}, ["team_id"])

    team_name_by_id(raw, team_id) || get_in(latest_ball || %{}, ["team", "name"]) ||
      raw["batting_team"] || team1 || team2
  end

  defp resolve_bowling_team(raw, batting_team, team1, team2) do
    cond do
      batting_team == team1 ->
        team2

      batting_team == team2 ->
        team1

      true ->
        raw["bowling_team"] ||
          get_in(raw, ["bowling", Access.at(0), "team", "name"]) ||
          team2
    end
  end

  defp resolve_current_over(active_runs, latest_ball) do
    cond do
      is_map(latest_ball) and not is_nil(latest_ball["ball"]) ->
        normalize_decimal(latest_ball["ball"])

      not is_nil(active_runs["overs"]) ->
        normalize_decimal(active_runs["overs"])

      true ->
        nil
    end
  end

  defp resolve_current_ball_in_over(latest_ball) when is_map(latest_ball) do
    case latest_ball["ball"] do
      value when is_float(value) ->
        value
        |> Float.to_string()
        |> String.split(".")
        |> List.last()
        |> integer_or_zero()

      value when is_binary(value) ->
        value
        |> String.split(".")
        |> List.last()
        |> integer_or_zero()

      _ ->
        0
    end
  end

  defp resolve_current_ball_in_over(_), do: 0

  defp resolve_target_runs(previous_runs, inning) when inning > 1 do
    case previous_runs["score"] do
      nil -> nil
      score -> integer_or_zero(score) + 1
    end
  end

  defp resolve_target_runs(_, _), do: nil

  defp resolve_current_run_rate(runs_total, %Decimal{} = current_over) do
    case Decimal.compare(current_over, Decimal.new(0)) do
      :gt -> Decimal.div(Decimal.new(runs_total), current_over) |> Decimal.round(3)
      _ -> nil
    end
  end

  defp resolve_current_run_rate(_, _), do: nil

  defp resolve_required_run_rate(nil, _runs_total, _current_over, _raw), do: nil

  defp resolve_required_run_rate(target_runs, runs_total, %Decimal{} = current_over, raw) do
    overs_limit =
      raw["overs"] ||
        raw["total_overs"] ||
        raw["scheduled_overs"] ||
        raw["total_overs_played"] ||
        20

    with overs_limit when is_integer(overs_limit) and overs_limit > 0 <-
           integer_or_zero(overs_limit),
         remaining_runs when remaining_runs > 0 <- target_runs - runs_total,
         remaining_overs <- Decimal.sub(Decimal.new(overs_limit), current_over),
         :gt <- Decimal.compare(remaining_overs, Decimal.new(0)) do
      Decimal.div(Decimal.new(remaining_runs), remaining_overs) |> Decimal.round(3)
    else
      _ -> nil
    end
  end

  defp resolve_required_run_rate(_, _, _, _), do: nil

  defp build_last_6_balls_pattern(balls, scoreboard_key) do
    balls
    |> Enum.filter(fn ball ->
      ball["scoreboard"] == scoreboard_key and get_in(ball, ["score", "ball"]) == true
    end)
    |> Enum.sort_by(&ball_sort_key/1)
    |> Enum.take(-6)
    |> Enum.map(&ball_pattern_value/1)
  end

  defp ball_pattern_value(ball) do
    score = ball["score"] || %{}

    cond do
      truthy?(score["is_wicket"]) or truthy?(score["out"]) -> "W"
      truthy?(score["four"]) -> "4"
      truthy?(score["six"]) -> "6"
      true -> Integer.to_string(integer_or_zero(score["runs"]))
    end
  end

  defp resolve_last_ball_event_type(ball) when is_map(ball) do
    score = ball["score"] || %{}

    cond do
      truthy?(score["is_wicket"]) or truthy?(score["out"]) -> "wicket"
      truthy?(score["four"]) -> "four"
      truthy?(score["six"]) -> "six"
      integer_or_zero(score["runs"]) == 0 -> "dot"
      integer_or_zero(score["runs"]) == 1 -> "single"
      integer_or_zero(score["runs"]) == 2 -> "double"
      integer_or_zero(score["runs"]) == 3 -> "triple"
      true -> normalize_event_name(score["name"])
    end
  end

  defp resolve_last_ball_event_type(_), do: nil

  defp normalize_event_name(nil), do: nil

  defp normalize_event_name(value) do
    value
    |> to_string()
    |> String.downcase()
    |> String.trim()
    |> String.replace(~r/[^a-z0-9]+/, "_")
    |> String.trim("_")
  end

  defp team_name_by_id(_raw, nil), do: nil

  defp team_name_by_id(raw, team_id) do
    normalized_team_id = integer_or_zero(team_id)

    cond do
      integer_or_zero(get_in(raw, ["localteam", "id"])) == normalized_team_id ->
        get_in(raw, ["localteam", "name"])

      integer_or_zero(get_in(raw, ["visitorteam", "id"])) == normalized_team_id ->
        get_in(raw, ["visitorteam", "name"])

      true ->
        nil
    end
  end

  defp inning_to_scoreboard(1), do: "S1"
  defp inning_to_scoreboard(2), do: "S2"
  defp inning_to_scoreboard(3), do: "S3"
  defp inning_to_scoreboard(4), do: "S4"
  defp inning_to_scoreboard(_), do: "S1"

  defp scoreboard_inning("S1"), do: 1
  defp scoreboard_inning("S2"), do: 2
  defp scoreboard_inning("S3"), do: 3
  defp scoreboard_inning("S4"), do: 4
  defp scoreboard_inning(_), do: 1

  defp integer_or_zero(value) when is_integer(value), do: value
  defp integer_or_zero(value) when is_float(value), do: trunc(value)

  defp integer_or_zero(value) when is_binary(value) do
    case Integer.parse(String.trim(value)) do
      {parsed, _} -> parsed
      _ -> 0
    end
  end

  defp integer_or_zero(_), do: 0

  defp decimal_or_string(nil), do: nil
  defp decimal_or_string(%Decimal{} = value), do: Decimal.to_string(value)
  defp decimal_or_string(value), do: value

  defp normalize_decimal(nil), do: nil
  defp normalize_decimal(%Decimal{} = value), do: value
  defp normalize_decimal(value) when is_integer(value), do: Decimal.new(value)
  defp normalize_decimal(value) when is_float(value), do: Decimal.from_float(value)

  defp normalize_decimal(value) when is_binary(value) do
    case Decimal.parse(String.trim(value)) do
      {decimal, ""} -> decimal
      _ -> nil
    end
  end

  defp normalize_decimal(_), do: nil

  defp mark_live_source(rows) when is_list(rows) do
    Enum.map(rows, fn
      row when is_map(row) ->
        row
        |> Map.put_new("_source_kind", "livescores")
        |> Map.put_new("_source_endpoint", "/livescores")

      other ->
        other
    end)
  end

  defp truthy?(value) when value in [true, 1, "1", "true"], do: true
  defp truthy?(_), do: false

  defp present?(value) when is_binary(value), do: String.trim(value) != ""
  defp present?(value), do: not is_nil(value)
end
