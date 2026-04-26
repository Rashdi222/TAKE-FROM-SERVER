from __future__ import annotations

from typing import Any


def evaluate_partnership_break(
    *,
    event_type: str | None,
    batting_side: str,
    over_number: float,
    recent_events: list[dict[str, Any]],
    wickets_total: int,
    target_runs: int | None,
    required_run_rate: float | None,
) -> dict[str, Any] | None:
    if batting_side not in {"team1", "team2"}:
        return None
    if event_type != "wicket":
        return None
    if over_number < 8.0:
        return None

    recent = recent_events[-8:]
    boundary_count = sum(1 for event in recent if event.get("event_type") in {"four", "six", "boundary"})
    scoring_count = sum(1 for event in recent if event.get("event_type") in {"single", "double", "triple", "four", "six", "boundary"})
    chase_pressure = target_runs is not None and (required_run_rate or 0.0) >= 8.5

    if boundary_count < 2 and scoring_count < 5 and not chase_pressure:
        return None

    shift = 0.012
    if boundary_count >= 3:
        shift += 0.008
    if scoring_count >= 6:
        shift += 0.006
    if chase_pressure:
        shift += 0.008
    if wickets_total >= 5:
        shift += 0.004

    shift = min(0.036, shift)
    team1_delta = -shift if batting_side == "team1" else shift

    return {
        "id": "partnership_break",
        "team1_delta": team1_delta,
        "intensity": shift,
        "reason": "A wicket that breaks a flowing partnership should hit the batting side harder than the generic event delta.",
        "direction": "against_batting_team",
    }
