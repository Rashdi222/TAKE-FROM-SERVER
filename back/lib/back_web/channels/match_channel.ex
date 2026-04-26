defmodule BackWeb.MatchChannel do
  use BackWeb, :channel

  alias Back.Betting.Match
  alias Back.FeatureFlags
  alias Back.MultiSource.Schemas.CanonicalMarketState
  alias Back.MultiSource.Schemas.CanonicalOddsState
  alias BackWeb.JsonHelpers

  @doc "Join a match room: 'match:MATCH_ID'"
  def join("match:" <> _match_id, _params, socket) do
    {:ok, socket}
  end

  def join(_, _, _), do: {:error, %{reason: "invalid topic"}}

  @doc "Broadcasts match status change to all subscribers of that match."
  def broadcast_status_change(match_id, status) do
    BackWeb.Endpoint.broadcast("match:#{match_id}", "status_changed", %{status: status})
  end

  @doc "Broadcasts the declared winner after settlement."
  def broadcast_winner(match_id, winner) do
    BackWeb.Endpoint.broadcast("match:#{match_id}", "match_settled", %{winner: winner})
  end

  @doc "Broadcasts updated odds to all match subscribers."
  def broadcast_odds_update(match_id, odds) do
    unless FeatureFlags.canonical_live_trading_enabled?() do
      BackWeb.Endpoint.broadcast("match:#{match_id}", "odds_updated", %{
        odds: JsonHelpers.json_safe(odds)
      })
    end
  end

  @doc "Broadcasts a structured match state delta to all subscribers."
  def broadcast_match_state_updated(%Match{} = match, payload \\ %{}) do
    BackWeb.Endpoint.broadcast("match:#{match.id}", "match_state_updated", %{
      match_id: match.id,
      status: match.status,
      live_state_version: match.live_state_version,
      live_event_seq: match.live_event_seq,
      current_innings: match.current_innings,
      current_over: JsonHelpers.decimal(match.current_over),
      current_ball_in_over: match.current_ball_in_over,
      runs_total: match.runs_total,
      wickets_total: match.wickets_total,
      batting_team: match.batting_team,
      bowling_team: match.bowling_team,
      momentum_index: JsonHelpers.decimal(match.momentum_index),
      market_state: JsonHelpers.json_safe(match.market_state),
      suspended_markets: JsonHelpers.json_safe(match.suspended_markets),
      score: JsonHelpers.json_safe(match.score),
      cricket_context: JsonHelpers.json_safe(extract_cricket_context(match)),
      football_context: JsonHelpers.json_safe(extract_football_context(match)),
      # Football live score fields
      home_score: match.home_score,
      away_score: match.away_score,
      elapsed_minute: match.elapsed_minute,
      stoppage_minute: match.stoppage_minute,
      home_red_cards: match.home_red_cards,
      away_red_cards: match.away_red_cards,
      home_corners: match.home_corners,
      away_corners: match.away_corners,
      home_shots_on_target: match.home_shots_on_target,
      away_shots_on_target: match.away_shots_on_target,
      tempo_index: JsonHelpers.decimal(match.tempo_index),
      payload: JsonHelpers.json_safe(payload)
    })
  end

  @doc "Broadcasts canonical multi-source market state changes to all subscribers."
  def broadcast_canonical_market_updated(%Match{} = match, %CanonicalMarketState{} = state) do
    BackWeb.Endpoint.broadcast("match:#{match.id}", "canonical_market_updated", %{
      match_id: match.id,
      market_key: state.market_key,
      canonical_status: state.status,
      market_status: state.status,
      is_suspended: state.status == "suspended",
      suspension_reason: state.suspension_reason,
      suspension_sources: JsonHelpers.json_safe(state.suspension_sources),
      last_consensus_source: state.last_consensus_source,
      consensus_version: state.consensus_version,
      last_consensus_at: state.last_consensus_at
    })
  end

  @doc "Broadcasts canonical multi-source odds updates to all subscribers."
  def broadcast_canonical_odds_updated(
        %Match{} = match,
        states,
        consensus_source_count \\ nil,
        degraded_sources \\ []
      )
      when is_list(states) do
    BackWeb.Endpoint.broadcast("match:#{match.id}", "canonical_odds_updated", %{
      match_id: match.id,
      consensus_source_count: consensus_source_count,
      degraded_sources: JsonHelpers.json_safe(degraded_sources),
      odds:
        Enum.map(states, fn %CanonicalOddsState{} = state ->
          %{
            market_key: state.market_key,
            selection_key: state.selection_key,
            canonical_status: state.status,
            odds_value: JsonHelpers.decimal(state.canonical_price),
            is_suspended: state.status == "suspended",
            last_consensus_source: state.last_consensus_source,
            consensus_version: state.consensus_version,
            high_water_mark_ms: state.high_water_mark_ms,
            payload: JsonHelpers.json_safe(state.payload),
            consensus_source_count:
              get_in(state.payload || %{}, ["source_count"]) || consensus_source_count,
            degraded_sources: JsonHelpers.json_safe(degraded_sources)
          }
        end)
    })
  end

  @doc "Broadcasts total canonical feed degradation when all sources expire."
  def broadcast_health_degraded(%Match{} = match, degraded_sources) do
    BackWeb.Endpoint.broadcast("match:#{match.id}", "health_degraded", %{
      match_id: match.id,
      degraded: true,
      consensus_source_count: 0,
      degraded_sources: JsonHelpers.json_safe(degraded_sources),
      warning: "Live feed interrupted - reconnecting..."
    })
  end

  @doc "Broadcasts an immediate market suspension event."
  def broadcast_market_suspended(%Match{} = match, reason, market_keys \\ nil) do
    unless FeatureFlags.canonical_live_trading_enabled?() do
      BackWeb.Endpoint.broadcast("match:#{match.id}", "market_suspended", %{
        match_id: match.id,
        status: match.status,
        market_status: "suspended",
        suspended_at: match.suspended_at,
        suspension_reason: reason,
        market_keys: market_keys,
        suspended_markets: JsonHelpers.json_safe(match.suspended_markets)
      })
    end
  end

  @doc "Broadcasts a legacy market resume event when canonical cutover is disabled."
  def broadcast_market_resumed(%Match{} = match, payload) when is_map(payload) do
    unless FeatureFlags.canonical_live_trading_enabled?() do
      BackWeb.Endpoint.broadcast(
        "match:#{match.id}",
        "market_resumed",
        JsonHelpers.json_safe(payload)
      )
    end
  end

  @doc "Broadcasts a new bet count (no sensitive data) to match subscribers."
  def broadcast_bet_placed(match_id, _bet_id) do
    BackWeb.Endpoint.broadcast("match:#{match_id}", "bet_placed", %{match_id: match_id})
  end

  defp extract_cricket_context(%Match{} = match) do
    match.raw_data
    |> case do
      %{} = raw_data ->
        Map.get(raw_data, "cricket_context") || Map.get(raw_data, :cricket_context)

      _ ->
        nil
    end
    |> case do
      %{} = cricket_context -> cricket_context
      _ -> %{}
    end
  end

  defp extract_football_context(%Match{} = match) do
    match.raw_data
    |> case do
      %{} = raw_data ->
        Map.get(raw_data, "football_context") || Map.get(raw_data, :football_context)

      _ ->
        nil
    end
    |> case do
      %{} = football_context -> football_context
      _ -> %{}
    end
  end
end
