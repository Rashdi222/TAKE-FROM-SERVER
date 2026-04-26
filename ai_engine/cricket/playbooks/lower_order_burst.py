from __future__ import annotations

from typing import Any


def evaluate_lower_order_burst(
    *,
    batting_side: str,
    wickets_total: int,
    over_number: float,
    recent_events: list[dict[str, Any]],
    target_runs: int | None,
    required_run_rate: float | None,
) -> dict[str, Any] | None:
    if batting_side not in {"team1", "team2"}:
        return None
    if wickets_total < 6:
        return None
    if over_number < 14.0:
        return None

    recent = recent_events[-6:]
    boundaries = sum(1 for event in recent if event.get("event_type") in {"four", "six", "boundary"})
    scoring = sum(1 for event in recent if event.get("event_type") in {"single", "double", "triple", "four", "six", "boundary"})
    chase_pressure = target_runs is not None and (required_run_rate or 0.0) >= 9.5

    if boundaries < 2 or scoring < 4:
        return None

    shift = 0.008
    if boundaries >= 3:
        shift += 0.006
    if chase_pressure:
        shift += 0.006
    if wickets_total >= 8:
        shift += 0.004

    shift = min(0.024, shift)
    team1_delta = shift if batting_side == "team1" else -shift

    return {
        "id": "lower_order_burst",
        "team1_delta": team1_delta,
        "intensity": shift,
        "reason": "A lower-order boundary burst should not be over-faded when late-over volatility is real.",
        "direction": "toward_batting_team",
    }
