alias Back.Repo
import Ecto.Query

match =
  Repo.one(
    from m in Back.Betting.Match,
      where: ilike(m.team1, ^"%Delhi Capitals%") and ilike(m.team2, ^"%Gujarat Titans%"),
      order_by: [desc: m.updated_at],
      limit: 1
  )

IO.puts("MATCH")

IO.inspect(
  match &&
    %{
      id: match.id,
      status: match.status,
      suspended_at: match.suspended_at,
      suspension_reason: match.suspension_reason,
      in_play_enabled: match.in_play_enabled,
      live_state_version: match.live_state_version,
      live_event_seq: match.live_event_seq,
      current_innings: match.current_innings,
      current_over: match.current_over,
      score: match.score,
      market_state: match.market_state,
      suspended_markets: match.suspended_markets,
      updated_at: match.updated_at
    },
  pretty: true,
  limit: :infinity
)

if match do
  IO.puts("ODDS")

  odds =
    Repo.all(
      from o in Back.Betting.Odds,
        where: o.match_id == ^match.id,
        order_by: [desc: o.inserted_at],
        limit: 20,
        select: %{
          id: o.id,
          source_type: o.source_type,
          visibility_status: o.visibility_status,
          is_active: o.is_active,
          is_suspended: o.is_suspended,
          bet_type: o.bet_type,
          market: o.market,
          outcome: o.outcome,
          odds_value: o.odds_value,
          version_no: o.version_no,
          updated_at: o.updated_at
        }
    )

  IO.inspect(odds, pretty: true, limit: :infinity)

  IO.puts("EVENTS")

  events =
    Repo.all(
      from e in Back.State.MatchLiveEvent,
        where: e.match_id == ^match.id,
        order_by: [desc: e.inserted_at],
        limit: 10,
        select: %{
          event_seq: e.event_seq,
          event_type: e.event_type,
          severity: e.severity,
          state_version: e.state_version,
          processed_at: e.processed_at
        }
    )

  IO.inspect(events, pretty: true, limit: :infinity)
end
