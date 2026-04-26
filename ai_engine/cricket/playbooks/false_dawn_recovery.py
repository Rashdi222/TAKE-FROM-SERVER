from __future__ import annotations

from typing import Any


def evaluate_false_dawn_recovery(
    *,
    batting_side: str,
    target_runs: int | None,
    over_number: float,
    recent_events: list[dict[str, Any]],
    boundary_pressure: dict[str, Any],
) -> dict[str, Any] | None:
    if batting_side not in {"team1", "team2"}:
        return None
    if target_runs is None:
        return None
    if over_number < 10.0:
        return None

    recent = recent_events[-5:]
    if len(recent) < 3:
        return None

    last_types = [str(event.get("event_type") or "") for event in recent]
    last_two = last_types[-2:]
    recent_wickets = sum(1 for event_type in last_types if event_type == "wicket")
    desperate = bool(boundary_pressure.get("desperate_chase"))

    boundary_after_wicket = (
        len(last_two) == 2 and
        last_two[0] == "wicket" and
        last_two[1] in {"four", "six", "boundary"}
    )

    if not boundary_after_wicket and not (desperate and recent_wickets >= 1 and last_two[-1] in {"four", "six", "boundary"}):
        return None

    shift = 0.015 + (0.01 if desperate else 0.0) + (0.006 if recent_wickets >= 2 else 0.0)
    shift = min(0.034, shift)
    team1_delta = -shift if batting_side == "team1" else shift

    return {
        "id": "false_dawn_recovery",
        "team1_delta": team1_delta,
        "intensity": shift,
        "reason": "Do not overprice a chase comeback after a single boundary immediately following collapse pressure.",
        "direction": "against_batting_team",
    }
