from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AI_ENGINE_ROOT = ROOT / "ai_engine"
if str(AI_ENGINE_ROOT) not in sys.path:
    sys.path.insert(0, str(AI_ENGINE_ROOT))

from cricket.orchestrator import (  # noqa: E402
    CurrentOddsRow,
    CalculateOddsRequest,
    MatchState,
    RuntimeConfig,
    TriggerPayload,
    GRAPH,
    persist_memory_snapshot,
)


def make_request(
    *,
    match_id: str,
    event_seq: int,
    state_version: int,
    event_type: str,
    severity: str,
    over: str,
    ball_in_over: int,
    runs_total: int,
    wickets_total: int,
    current_run_rate: str,
    required_run_rate: str | None,
    event_time: str,
) -> CalculateOddsRequest:
    return CalculateOddsRequest(
        match_id=match_id,
        event_seq=event_seq,
        state_version=state_version,
        trigger=TriggerPayload(event_type=event_type, severity=severity, reason=f"replay_{event_type}"),
        current_odds=[
            CurrentOddsRow(
                market_key="match_winner",
                selection_key="team1",
                label="Karachi Kings",
                price="1.86",
            ),
            CurrentOddsRow(
                market_key="match_winner",
                selection_key="team2",
                label="Lahore Qalandars",
                price="1.96",
            ),
        ],
        runtime_config=RuntimeConfig(
            llm_enabled=False,
            fallback_allowed=True,
            config_provider="test_replay",
            max_price_jump_threshold=0.20,
        ),
        liability_book={
            "policy": {
                "selection_soft_share": 0.58,
                "selection_hard_share": 0.68,
                "max_probability_shade": 0.035,
                "high_user_concentration_ratio": 0.45,
            },
            "markets": {
                "match_winner": {
                    "selections": {
                        "team1": {
                            "potential_payout": 7400,
                            "max_user_potential": 2600,
                        },
                        "team2": {
                            "potential_payout": 2600,
                            "max_user_potential": 950,
                        },
                    }
                }
            },
        },
        match_state=MatchState(
            match_id=match_id,
            provider="sportmonks",
            sport="cricket",
            event_seq=event_seq,
            state_version=state_version,
            event_time=event_time,
            event_type=event_type,
            inning=2,
            over=over,
            ball_in_over=ball_in_over,
            team1="Karachi Kings",
            team2="Lahore Qalandars",
            batting_team="Karachi Kings",
            bowling_team="Lahore Qalandars",
            runs_total=runs_total,
            wickets_total=wickets_total,
            target_runs=186,
            current_run_rate=current_run_rate,
            required_run_rate=required_run_rate,
            momentum_index="0.4",
            market_state={},
            score={},
            raw_data={
                "venue": {"name": "National Stadium", "city": "Karachi"},
                "league": {"name": "Pakistan Super League"},
                "season_name": "2026",
                "toss": {"winner": "Karachi Kings", "decision": "bowl"},
                "teams": {
                    "home": {"name": "Karachi Kings"},
                    "away": {"name": "Lahore Qalandars"},
                },
                "_competition_feed": {"id": "test-feed"},
                "venue_profile": {"track_hint": "slow", "pitch_degradation": 0.82},
            },
        ),
    )


def run_state(request: CalculateOddsRequest) -> dict:
    graph_state = GRAPH.invoke(
        {
            "request": request,
            "started_at": 0.0,
            "engine_trace_id": f"replay-{request.event_seq}",
            "thread_id": request.match_id,
            "memory_context": {},
        },
        config={"configurable": {"thread_id": request.match_id}},
    )
    persist_memory_snapshot(request, graph_state)
    return graph_state


def main() -> None:
    match_id = "replay-bookmaker-001"

    sequence = [
        make_request(
            match_id=match_id,
            event_seq=1,
            state_version=1,
            event_type="wicket",
            severity="major",
            over="2.1",
            ball_in_over=1,
            runs_total=21,
            wickets_total=1,
            current_run_rate="10.0",
            required_run_rate="9.2",
            event_time="2026-03-28T20:00:00Z",
        ),
        make_request(
            match_id=match_id,
            event_seq=2,
            state_version=2,
            event_type="dot",
            severity="minor",
            over="2.2",
            ball_in_over=2,
            runs_total=21,
            wickets_total=1,
            current_run_rate="9.55",
            required_run_rate="9.4",
            event_time="2026-03-28T20:00:20Z",
        ),
        make_request(
            match_id=match_id,
            event_seq=3,
            state_version=3,
            event_type="dot",
            severity="minor",
            over="2.3",
            ball_in_over=3,
            runs_total=21,
            wickets_total=1,
            current_run_rate="9.1",
            required_run_rate="9.7",
            event_time="2026-03-28T20:00:40Z",
        ),
        make_request(
            match_id=match_id,
            event_seq=4,
            state_version=4,
            event_type="dot",
            severity="minor",
            over="2.4",
            ball_in_over=4,
            runs_total=21,
            wickets_total=1,
            current_run_rate="8.7",
            required_run_rate="10.0",
            event_time="2026-03-28T20:01:00Z",
        ),
        make_request(
            match_id=match_id,
            event_seq=5,
            state_version=5,
            event_type="dot",
            severity="minor",
            over="2.5",
            ball_in_over=5,
            runs_total=21,
            wickets_total=1,
            current_run_rate="8.4",
            required_run_rate="10.3",
            event_time="2026-03-28T20:01:20Z",
        ),
    ]

    early_wicket_state = {}
    final_state = {}
    for request in sequence:
        current_state = run_state(request)
        if request.event_seq == 1:
            early_wicket_state = current_state
        final_state = current_state

    fancy_summary = final_state.get("fancy_summary", {})
    first_fancy = next(iter(fancy_summary.values()), {})
    output = {
        "core_early_wicket": {
            "reviewer_decision": early_wicket_state.get("reviewer_decision"),
            "fair_probability_team1": round(early_wicket_state.get("fair_probability_team1", 0.0), 4),
            "display_probability_team1": round(early_wicket_state.get("display_probability_team1", 0.0), 4),
            "approved_probability_team1": round(early_wicket_state.get("approved_probability_team1", 0.0), 4),
            "bookmaker_flags": early_wicket_state.get("bookmaker_flags", []),
            "exposure_flags": early_wicket_state.get("exposure_flags", []),
            "active_playbooks": early_wicket_state.get("active_playbooks", []),
        },
        "fancy_dead_over_pressure": {
            "reviewer_decision": final_state.get("reviewer_decision"),
            "fancy_market_example": first_fancy,
        },
    }
    print(json.dumps(output, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
