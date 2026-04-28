defmodule BackWeb.MatchController do
  use BackWeb, :controller

  action_fallback BackWeb.FallbackController

  alias Back.Betting
  alias Back.Auth.Guardian
  alias Back.Providers.SportmonksLiveIndex
  alias Back.State.MarketManager
  alias Back.Tennis
  alias BackWeb.JsonHelpers

  # GET /api/matches
  def index(conn, params) do
    maybe_warm_tennis_catalog(params)

    limit = parse_limit(params["limit"])
    offset = parse_offset(params["offset"])

    filters =
      []
      |> maybe_filter(:sport, params["sport"])
      |> maybe_filter(:status, params["status"])
      |> maybe_filter(:competition_feed_id, params["competition_feed_id"])
      |> maybe_filter(:competition_key, params["competition_key"])
      |> maybe_filter(:live_only, params["live_only"])
      |> maybe_filter(:limit, limit)
      |> maybe_filter(:offset, offset)
      |> maybe_add_state_bucket(params["state_bucket"])
      |> maybe_require_public_odds(params)

    {matches, meta} = list_matches_with_meta(filters, params, limit, offset)
    json(conn, %{data: Enum.map(matches, &match_json/1), meta: meta})
  end

  # GET /api/matches/competition-aggregates
  def competition_aggregates(conn, params) do
    maybe_warm_tennis_catalog(params)

    filters =
      []
      |> maybe_filter(:sport, params["sport"])
      |> maybe_filter(:status, params["status"])
      |> maybe_filter(:competition_feed_id, params["competition_feed_id"])
      |> maybe_filter(:competition_key, params["competition_key"])
      |> maybe_filter(:live_only, params["live_only"])
      |> maybe_add_state_bucket(params["state_bucket"])

    aggregates =
      filters
      |> Betting.list_match_competition_aggregates()
      |> maybe_filter_public_aggregate_quality(params)

    json(conn, %{data: Enum.map(aggregates, &competition_aggregate_json/1)})
  end

  # GET /api/matches/:id
  def show(conn, %{"id" => id}) do
    match = Betting.get_match!(id)
    json(conn, %{data: match_json(match)})
  end

  # POST /api/matches
  def create(conn, params) do
    current_user = Guardian.Plug.current_resource(conn)

    with {:ok, match} <- Betting.create_match(params, current_user.id) do
      conn |> put_status(:created) |> json(%{data: match_json(match)})
    end
  end

  # PUT /api/matches/:id
  def update(conn, %{"id" => id} = params) do
    match = Betting.get_match!(id)

    with {:ok, updated} <- Betting.update_match(match, params) do
      json(conn, %{data: match_json(updated)})
    end
  end

  # POST /api/matches/:id/start-live
  def start_live(conn, %{"id" => id}) do
    match = Betting.get_match!(id)

    with {:ok, updated} <- Betting.start_live(match) do
      json(conn, %{data: match_json(updated)})
    end
  end

  # POST /api/matches/:id/close
  def close(conn, %{"id" => id}) do
    match = Betting.get_match!(id)

    with {:ok, updated} <- Betting.close_match(match) do
      json(conn, %{data: match_json(updated)})
    end
  end

  # POST /api/matches/:id/settle
  def settle(conn, %{"id" => id, "winner" => winner}) do
    match = Betting.get_match!(id)

    with {:ok, %{match: settled}} <- Betting.settle_match(match, winner) do
      json(conn, %{data: match_json(settled)})
    end
  end

  # POST /api/matches/:id/cancel
  def cancel(conn, %{"id" => id}) do
    match = Betting.get_match!(id)

    with {:ok, %{match: cancelled}} <- Betting.cancel_match(match) do
      json(conn, %{data: match_json(cancelled)})
    end
  end

  # POST /api/admin/matches/:id/emergency_suspend
  def emergency_suspend(conn, %{"id" => id} = params) do
    current_user = Guardian.Plug.current_resource(conn)
    reason = parse_emergency_reason(params["reason"], "emergency_suspend")

    with {:ok, match} <-
           MarketManager.suspend_match(id, reason, %{
             actor_id: current_user.id,
             actor_role: current_user.role,
             note: params["note"]
           }) do
      json(conn, %{data: match_json(match)})
    end
  end

  # POST /api/admin/matches/:id/emergency_resume
  def emergency_resume(conn, %{"id" => id} = params) do
    current_user = Guardian.Plug.current_resource(conn)

    with {:ok, match} <-
           MarketManager.resume_match(id, %{
             actor_id: current_user.id,
             actor_role: current_user.role,
             note: params["note"]
           }) do
      json(conn, %{data: match_json(match)})
    end
  end

  def suspend_market(conn, %{"id" => id, "market_key" => market_key} = params) do
    current_user = Guardian.Plug.current_resource(conn)
    reason = parse_emergency_reason(params["reason"], "manual_market_suspend")

    with {:ok, match} <-
           MarketManager.suspend_market(id, market_key, reason, %{
             actor_id: current_user.id,
             actor_role: current_user.role,
             note: params["note"]
           }) do
      json(conn, %{data: match_json(match)})
    end
  end

  def resume_market(conn, %{"id" => id, "market_key" => market_key} = params) do
    current_user = Guardian.Plug.current_resource(conn)

    with {:ok, match} <-
           MarketManager.resume_market(id, market_key, %{
             actor_id: current_user.id,
             actor_role: current_user.role,
             note: params["note"]
           }) do
      json(conn, %{data: match_json(match)})
    end
  end

  # POST /api/admin/cricket/emergency_suspend_all
  def emergency_suspend_all_cricket(conn, params) do
    current_user = Guardian.Plug.current_resource(conn)

    with {:ok, ids} <-
           MarketManager.suspend_all_live_cricket_matches(%{
             actor_id: current_user.id,
             actor_role: current_user.role,
             note: params["note"]
           }) do
      json(conn, %{data: %{match_ids: ids, suspended_count: length(ids)}})
    end
  end

  # POST /api/admin/matches/:id/manual_override_publish
  def manual_override_publish(conn, %{"id" => id} = params) do
    current_user = Guardian.Plug.current_resource(conn)

    attrs = %{
      market_key: params["market_key"],
      bet_type: params["bet_type"],
      selection_key: params["selection_key"],
      label: params["label"] || params["outcome"],
      outcome: params["outcome"] || params["label"],
      odds_value: params["odds_value"],
      admin_note: params["admin_note"] || params["note"] || "Manual override publish"
    }

    with {:ok, result} <- MarketManager.manual_override_publish(id, current_user.id, attrs) do
      json(conn, %{
        data: %{
          match: match_json(result.match),
          odds: odds_json(result.odds),
          version_no: result.version_no,
          archived_count: result.archived_count
        }
      })
    end
  end

  def force_reprice(conn, %{"id" => id}) do
    match = Betting.get_match!(id)

    with :ok <- Back.Live.LangGraphClient.force_reprice_async(match) do
      json(conn, %{data: %{match_id: id, queued: true}})
    end
  end

  defp match_json(m) do
    quality = public_quality(m)

    %{
      id: m.id,
      sport: m.sport,
      team1: m.team1,
      team2: m.team2,
      start_time: m.start_time,
      status: m.status,
      winner: m.winner,
      in_play_enabled: m.in_play_enabled,
      external_id: m.external_id,
      slug: m.slug,
      competition_feed_id: m.competition_feed_id,
      competition: competition_json(m),
      team1_logo: get_in(m.raw_data || %{}, ["team1_logo"]),
      team2_logo: get_in(m.raw_data || %{}, ["team2_logo"]),
      venue_name: get_in(m.raw_data || %{}, ["venue_name"]),
      round_name: get_in(m.raw_data || %{}, ["round_name"]),
      season_name: get_in(m.raw_data || %{}, ["season_name"]),
      quality: %{
        public_renderable: quality.renderable?,
        issues: quality.issues
      },
      live_state_version: m.live_state_version,
      live_event_seq: m.live_event_seq,
      current_innings: m.current_innings,
      current_over: JsonHelpers.decimal(m.current_over),
      current_ball_in_over: m.current_ball_in_over,
      batting_team: m.batting_team,
      bowling_team: m.bowling_team,
      runs_total: m.runs_total,
      wickets_total: m.wickets_total,
      target_runs: m.target_runs,
      required_run_rate: JsonHelpers.decimal(m.required_run_rate),
      current_run_rate: JsonHelpers.decimal(m.current_run_rate),
      momentum_index: JsonHelpers.decimal(m.momentum_index),
      elapsed_minute: m.elapsed_minute,
      stoppage_minute: m.stoppage_minute,
      home_score: m.home_score,
      away_score: m.away_score,
      home_red_cards: m.home_red_cards,
      away_red_cards: m.away_red_cards,
      home_corners: m.home_corners,
      away_corners: m.away_corners,
      home_shots_on_target: m.home_shots_on_target,
      away_shots_on_target: m.away_shots_on_target,
      tempo_index: JsonHelpers.decimal(m.tempo_index),
      market_state: JsonHelpers.json_safe(m.market_state),
      suspended_markets: JsonHelpers.json_safe(m.suspended_markets),
      suspended_at: m.suspended_at,
      suspension_reason: m.suspension_reason,
      score: JsonHelpers.json_safe(m.score),
      raw_data: JsonHelpers.json_safe(m.raw_data),
      inserted_at: m.inserted_at,
      updated_at: m.updated_at
    }
  end

  defp competition_json(m) do
    case m.competition_feed_id do
      nil ->
        provider_competition_json(m)

      id ->
        %{
          id: id,
          name: get_in(m.raw_data || %{}, ["_competition_feed", "name"]),
          competition_key: get_in(m.raw_data || %{}, ["_competition_feed", "competition_key"])
        }
    end
  end

  defp provider_competition_json(m) do
    raw = m.raw_data || %{}
    name = get_in(raw, ["league", "name"]) || raw["competition_name"] || raw["league_name"]
    key = get_in(raw, ["league", "id"]) || raw["league_id"] || name

    if blank?(name) do
      nil
    else
      %{
        id: nil,
        name: name,
        competition_key: provider_competition_key(m.sport, key)
      }
    end
  end

  defp competition_aggregate_json(item) do
    %{
      sport: item.sport,
      competition_feed_id: item.competition_feed_id,
      competition_key: item.competition_key,
      name: item.name,
      match_count: item.match_count,
      next_match_time: item.next_match_time
    }
  end

  defp odds_json(odds) do
    %{
      id: odds.id,
      match_id: odds.match_id,
      bet_type: odds.bet_type,
      outcome: odds.outcome,
      odds_value: JsonHelpers.decimal(odds.odds_value),
      visibility_status: odds.visibility_status,
      version_no: odds.version_no,
      source_market_key: odds.source_market_key,
      source_provider: odds.source_provider,
      is_active: odds.is_active,
      published_at: odds.published_at,
      admin_note: odds.admin_note
    }
  end

  defp maybe_filter(filters, _key, nil), do: filters

  defp maybe_filter(filters, :competition_feed_id, val),
    do: [{:competition_feed_id, val} | filters]

  defp maybe_filter(filters, :competition_key, val), do: [{:competition_key, val} | filters]
  defp maybe_filter(filters, :live_only, val), do: [{:live_only, truthy?(val)} | filters]
  defp maybe_filter(filters, :limit, val), do: maybe_add_limit(filters, val)
  defp maybe_filter(filters, :offset, val), do: maybe_add_offset(filters, val)
  defp maybe_filter(filters, key, val), do: [{key, String.to_existing_atom(val)} | filters]

  defp maybe_require_public_odds(filters, %{"quality_mode" => "public"} = params) do
    # Public match boards should never disappear just because odds are delayed.
    # Odds can load independently on the detail page and in the match panels.
    filters
  end

  defp maybe_require_public_odds(filters, _params), do: filters

  defp maybe_add_limit(filters, val) when is_binary(val) do
    case Integer.parse(val) do
      {limit, ""} when limit > 0 -> [{:limit, limit} | filters]
      _ -> filters
    end
  end

  defp maybe_add_limit(filters, val) when is_integer(val) and val > 0,
    do: [{:limit, val} | filters]

  defp maybe_add_limit(filters, _), do: filters

  defp maybe_add_offset(filters, val) when is_integer(val) and val >= 0,
    do: [{:offset, val} | filters]

  defp maybe_add_offset(filters, _), do: filters

  defp maybe_add_state_bucket(filters, nil), do: filters

  defp maybe_add_state_bucket(filters, bucket) do
    now = DateTime.utc_now() |> DateTime.truncate(:second)
    today_start = start_of_day(now)
    upcoming_floor = DateTime.add(now, -12 * 60 * 60, :second) |> DateTime.truncate(:second)
    tomorrow_start = shift_days(today_start, 1)
    day_after_tomorrow_start = shift_days(today_start, 2)
    week_end = shift_days(today_start, 8)

    case bucket do
      "live" ->
        [{:status, :live} | filters]

      "today" ->
        [{:date_to, tomorrow_start}, {:date_from, today_start}, {:status, :upcoming} | filters]

      "tomorrow" ->
        [
          {:date_to, day_after_tomorrow_start},
          {:date_from, tomorrow_start},
          {:status, :upcoming} | filters
        ]

      "week" ->
        [{:date_to, week_end}, {:date_from, today_start}, {:status, :upcoming} | filters]

      "upcoming" ->
        [{:date_from, upcoming_floor}, {:status, :upcoming} | filters]

      _ ->
        filters
    end
  end

  defp truthy?(value) when value in [true, "true", "1", 1], do: true
  defp truthy?(_), do: false

  defp start_of_day(%DateTime{} = datetime) do
    %{datetime | hour: 0, minute: 0, second: 0, microsecond: {0, 0}}
  end

  defp shift_days(%DateTime{} = datetime, days) do
    DateTime.add(datetime, days * 86_400, :second)
  end

  defp maybe_filter_public_quality(matches, %{"quality_mode" => "public"} = params) do
    if truthy?(params["include_low_quality"]) do
      matches
    else
      Enum.filter(matches, &public_quality(&1).renderable?)
    end
  end

  defp maybe_filter_public_quality(matches, _params), do: matches

  defp maybe_filter_public_aggregate_quality(items, %{"quality_mode" => "public"}) do
    Enum.filter(items, fn item ->
      not blank?(item.name) and not blank?(item.competition_key) and item.match_count > 0
    end)
  end

  defp maybe_filter_public_aggregate_quality(items, _params), do: items

  defp list_matches_with_meta(filters, %{"quality_mode" => "public"} = params, limit, offset) do
    raw_limit = limit + 40

    raw_matches =
      filters
      |> Keyword.put(:limit, raw_limit)
      |> Betting.list_matches()

    filtered_matches = maybe_filter_public_quality(raw_matches, params)
    visible_matches = Enum.take(filtered_matches, limit)
    fetched_count = length(raw_matches)
    next_offset = offset + fetched_count

    meta = %{
      limit: limit,
      offset: offset,
      returned: length(visible_matches),
      has_more: length(filtered_matches) > limit or fetched_count == raw_limit,
      next_offset: next_offset
    }

    {visible_matches, meta}
  end

  defp list_matches_with_meta(filters, _params, limit, offset) do
    matches = Betting.list_matches(filters)

    meta = %{
      limit: limit,
      offset: offset,
      returned: length(matches),
      has_more: length(matches) == limit,
      next_offset: offset + length(matches)
    }

    {matches, meta}
  end

  defp public_quality(match) do
    team1 = match.team1 |> to_string_safe() |> String.trim()
    team2 = match.team2 |> to_string_safe() |> String.trim()
    competition_name =
      get_in(match.raw_data || %{}, ["_competition_feed", "name"]) ||
        get_in(match.raw_data || %{}, ["league", "name"]) ||
        get_in(match.raw_data || %{}, ["competition_name"]) ||
        get_in(match.raw_data || %{}, ["league_name"])

    issues =
      []
      |> maybe_add_issue(team1 == "", "missing_team1")
      |> maybe_add_issue(team2 == "", "missing_team2")
      |> maybe_add_issue(team1 in ["Team 1", "Unknown Team"], "placeholder_team1")
      |> maybe_add_issue(team2 in ["Team 2", "Unknown Team"], "placeholder_team2")
      |> maybe_add_issue(is_nil(match.start_time), "missing_start_time")
      |> maybe_add_issue(match.status == :cancelled, "cancelled")
      |> maybe_add_issue(
        is_nil(match.competition_feed_id) and blank?(competition_name),
        "missing_competition"
      )
      |> maybe_add_issue(stale_live_provider_row?(match), "stale_live_provider_row")

    %{renderable?: issues == [], issues: issues}
  end

  defp stale_live_provider_row?(match) do
    match.status == :live and match.provider == "sportmonks" and
      is_binary(match.external_id) and match.external_id != "" and
      not SportmonksLiveIndex.fresh_fixture?(match.external_id)
  end

  defp maybe_add_issue(issues, true, issue), do: [issue | issues]
  defp maybe_add_issue(issues, false, _issue), do: issues

  defp provider_competition_key(sport, value) do
    value =
      value
      |> to_string_safe()
      |> String.downcase()
      |> String.replace(~r/[^a-z0-9]+/, "-")
      |> String.trim("-")

    sport_key = sport |> to_string_safe() |> String.downcase() |> String.trim()

    cond do
      value == "" -> nil
      sport_key == "" -> value
      true -> sport_key <> "-" <> value
    end
  end

  defp maybe_warm_tennis_catalog(%{"sport" => "tennis"}) do
    _ =
      Tennis.list_fixtures(
        date_start: Date.utc_today(),
        date_stop: Date.add(Date.utc_today(), 3)
      )

    _ = Tennis.list_public_live_states()
    :ok
  end

  defp maybe_warm_tennis_catalog(_params), do: :ok

  defp parse_limit(value) when is_integer(value) and value > 0, do: value

  defp parse_limit(value) when is_binary(value) do
    case Integer.parse(value) do
      {limit, ""} when limit > 0 -> limit
      _ -> 50
    end
  end

  defp parse_limit(_), do: 50

  defp parse_offset(value) when is_integer(value) and value >= 0, do: value

  defp parse_offset(value) when is_binary(value) do
    case Integer.parse(value) do
      {offset, ""} when offset >= 0 -> offset
      _ -> 0
    end
  end

  defp parse_offset(_), do: 0

  defp parse_emergency_reason(nil, fallback), do: fallback

  defp parse_emergency_reason(value, fallback) when is_binary(value) do
    case String.trim(value) do
      "" -> fallback
      trimmed -> trimmed
    end
  end

  defp parse_emergency_reason(_, fallback), do: fallback

  defp blank?(value) when is_binary(value), do: String.trim(value) == ""
  defp blank?(nil), do: true
  defp blank?(_), do: false

  defp to_string_safe(nil), do: ""
  defp to_string_safe(value) when is_binary(value), do: value
  defp to_string_safe(value), do: to_string(value)
end
