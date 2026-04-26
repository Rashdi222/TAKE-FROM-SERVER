from __future__ import annotations

from typing import Any


def evaluate_early_wicket_trap(*, event_type: str | None, over_number: float, batting_side: str) -> dict[str, Any] | None:
    if event_type != "wicket":
        return None
    if over_number > 3.0:
        return None
    if batting_side not in {"team1", "team2"}:
        return None

    shift = 0.018
    direction = "toward_batting_team"
    if batting_side == "team1":
        team1_delta = shift
    else:
        team1_delta = -shift

    return {
        "id": "early_wicket_trap",
        "team1_delta": team1_delta,
        "intensity": 0.018,
        "reason": "Dampen the first-innings wicket crash in the opening three overs.",
        "direction": direction,
    }
