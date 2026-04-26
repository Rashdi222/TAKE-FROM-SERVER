from __future__ import annotations


def evaluate_super_over_surge(
    *,
    event_type: str | None,
    batting_side: str,
    over_number: float,
    balls_remaining: int | None,
) -> dict[str, object] | None:
    if batting_side not in {"team1", "team2"}:
        return None

    normalized = str(event_type or "").lower()
    if normalized not in {"super_over", "super over"} and not (over_number >= 19.0 and balls_remaining is not None and balls_remaining <= 6):
        return None

    shift = 0.012
    team1_delta = shift if batting_side == "team1" else -shift

    return {
        "id": "super_over_surge",
        "team1_delta": team1_delta,
        "intensity": shift,
        "reason": "Extreme endgame volatility should leave more upside room for the batting side rather than crushing prices too early.",
        "direction": "toward_batting_team",
    }
