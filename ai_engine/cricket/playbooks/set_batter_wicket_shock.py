from __future__ import annotations

from typing import Any


def evaluate_set_batter_wicket_shock(
    *,
    event_type: str | None,
    batting_side: str,
    over_number: float,
    inning: int,
    recent_events: list[dict[str, Any]],
    batsman_strike_rates: list[float],
    target_runs: int | None,
    required_run_rate: float | None,
) -> dict[str, Any] | None:
    if event_type != "wicket":
        return None
    if batting_side not in {"team1", "team2"}:
        return None
    if over_number < 6.0:
        return None

    recent = recent_events[-6:]
    boundary_burst = sum(1 for event in recent if event.get("event_type") in {"four", "six", "boundary"})
    average_sr = (sum(float(value) for value in batsman_strike_rates) / len(batsman_strike_rates)) if batsman_strike_rates else 0.0
    chase_pressure = target_runs is not None and (required_run_rate or 0.0) >= 9.5

    if boundary_burst < 2 and average_sr < 135.0 and not chase_pressure:
        return None

    shift = 0.014
    if boundary_burst >= 3:
        shift += 0.008
    if average_sr >= 145.0:
        shift += 0.008
    if chase_pressure:
        shift += 0.01
    if inning >= 2 and over_number >= 14.0:
        shift += 0.006

    shift = min(0.042, shift)
    team1_delta = -shift if batting_side == "team1" else shift

    return {
        "id": "set_batter_wicket_shock",
        "team1_delta": team1_delta,
        "intensity": shift,
        "reason": "Dismissal of a set or accelerating batter should hit the batting side harder than a generic wicket.",
        "direction": "against_batting_team",
    }
