from __future__ import annotations

from typing import Any


def evaluate_tail_exposed(
    *,
    batting_side: str,
    wickets_total: int,
    over_number: float,
    target_runs: int | None,
    required_run_rate: float | None,
    balls_remaining: int | None,
    boundary_pressure: dict[str, Any],
) -> dict[str, Any] | None:
    if batting_side not in {"team1", "team2"}:
        return None
    if wickets_total < 7:
        return None

    chasing = target_runs is not None
    desperate = bool(boundary_pressure.get("desperate_chase"))
    death_overs = over_number >= 15.0 or (balls_remaining is not None and balls_remaining <= 30)

    shift = 0.014 + ((wickets_total - 7) * 0.006)
    if chasing and (required_run_rate or 0.0) >= 10.0:
        shift += 0.01
    if desperate:
        shift += 0.008
    if death_overs:
        shift += 0.006

    shift = min(0.048, shift)
    team1_delta = -shift if batting_side == "team1" else shift

    return {
        "id": "tail_exposed",
        "team1_delta": team1_delta,
        "intensity": shift,
        "reason": "Lower-order exposure increases collapse risk and reduces finishing quality.",
        "direction": "against_batting_team",
    }
