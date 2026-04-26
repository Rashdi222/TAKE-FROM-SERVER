from __future__ import annotations

from typing import Any


def evaluate_death_over_panic(
    *,
    over_number: float,
    batting_side: str,
    target_runs: int | None,
    runs_total: int,
    required_run_rate: float | None,
) -> dict[str, Any] | None:
    if target_runs is None:
        return None
    if over_number < 16.0:
        return None
    if batting_side not in {"team1", "team2"}:
        return None

    runs_required = max((target_runs or 0) - runs_total, 0)
    if runs_required <= 0:
        return None

    pressure_rr = required_run_rate or 0.0
    if pressure_rr < 10.5:
        return None

    shift = min(0.028, 0.012 + ((pressure_rr - 10.5) * 0.004))
    if batting_side == "team1":
        team1_delta = -shift
    else:
        team1_delta = shift

    return {
        "id": "death_over_panic",
        "team1_delta": team1_delta,
        "intensity": shift,
        "reason": "High required rate in death overs triggers hero-ball penalty against the batting side.",
        "direction": "against_batting_team",
    }
