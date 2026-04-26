from __future__ import annotations

from typing import Any


def evaluate_fake_chase_surge(
    *,
    batting_side: str,
    target_runs: int | None,
    over_number: float,
    recent_events: list[dict[str, Any]],
    boundary_pressure: dict[str, Any],
    required_run_rate: float | None,
) -> dict[str, Any] | None:
    if batting_side not in {"team1", "team2"}:
        return None
    if target_runs is None:
        return None
    if over_number < 12.0:
        return None

    recent = recent_events[-6:]
    if len(recent) < 4:
        return None

    recent_types = [str(event.get("event_type") or "") for event in recent]
    boundaries = sum(1 for event_type in recent_types if event_type in {"four", "six", "boundary"})
    dots = sum(1 for event_type in recent_types if event_type in {"dot", "dot_ball"})
    desperate = bool(boundary_pressure.get("desperate_chase"))

    if boundaries < 2:
        return None
    if dots < 2 and not desperate:
        return None
    if (required_run_rate or 0.0) < 9.0 and not desperate:
        return None

    shift = 0.01
    if desperate:
        shift += 0.008
    if dots >= 3:
        shift += 0.006

    shift = min(0.028, shift)
    team1_delta = -shift if batting_side == "team1" else shift

    return {
        "id": "fake_chase_surge",
        "team1_delta": team1_delta,
        "intensity": shift,
        "reason": "Do not overprice a chase from a short boundary burst when underlying pressure remains high.",
        "direction": "against_batting_team",
    }
