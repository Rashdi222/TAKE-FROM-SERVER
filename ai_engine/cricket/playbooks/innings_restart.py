from __future__ import annotations


def evaluate_innings_restart(
    *,
    event_type: str | None,
    batting_side: str,
    over_number: float,
    target_runs: int | None,
    balls_remaining: int | None,
) -> dict[str, object] | None:
    if batting_side not in {"team1", "team2"}:
        return None

    event_name = str(event_type or "").lower()
    if event_name not in {"innings_break", "innings_start", "over_complete"}:
        return None

    if target_runs is None:
        return None

    if over_number > 1.0 and (balls_remaining is None or balls_remaining < 114):
        return None

    shift = 0.008
    if event_name == "innings_break":
        shift += 0.004

    team1_delta = -shift if batting_side == "team1" else shift

    return {
        "id": "innings_restart",
        "team1_delta": team1_delta,
        "intensity": shift,
        "reason": "Immediately after an innings restart the chase side should not be overcommitted before fresh rhythm is established.",
        "direction": "against_batting_team",
    }
