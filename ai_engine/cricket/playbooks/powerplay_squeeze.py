from __future__ import annotations


def evaluate_powerplay_squeeze(
    *,
    batting_side: str,
    over_number: float,
    inning: int,
    recent_events: list[dict],
    batsman_strike_rates: list[float],
) -> dict | None:
    if batting_side not in {"team1", "team2"}:
        return None
    if inning != 1:
        return None
    if over_number > 6.0:
        return None

    recent = recent_events[-6:]
    if len(recent) < 4:
        return None

    dots = sum(1 for event in recent if event.get("event_type") in {"dot", "dot_ball"})
    wickets = sum(1 for event in recent if event.get("event_type") == "wicket")
    average_sr = (sum(float(value) for value in batsman_strike_rates) / len(batsman_strike_rates)) if batsman_strike_rates else 130.0

    if dots < 4 and wickets == 0:
        return None
    if average_sr >= 145.0 and wickets == 0:
        return None

    shift = 0.012 + (dots * 0.0035) + (wickets * 0.008)
    if average_sr < 120.0:
        shift += 0.006
    shift = min(0.032, shift)
    team1_delta = -shift if batting_side == "team1" else shift

    return {
        "id": "powerplay_squeeze",
        "team1_delta": team1_delta,
        "intensity": shift,
        "reason": "Powerplay dot-ball squeeze and low tempo reduce batting-side upside.",
        "direction": "against_batting_team",
    }
