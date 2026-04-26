from __future__ import annotations

from typing import Any


def evaluate_pitch_degradation(
    *,
    dossier: dict[str, Any],
    batting_side: str,
    inning: int,
    target_runs: int | None,
    over_number: float,
) -> dict[str, Any] | None:
    if target_runs is None:
        return None
    if inning < 2:
        return None
    if batting_side not in {"team1", "team2"}:
        return None

    venue_bias = dossier.get("venue_bias") or {}
    track_hint = str(venue_bias.get("track_hint") or "").lower()
    pitch_degradation = float(venue_bias.get("pitch_degradation") or 0.0)

    if track_hint not in {"slowing_surface", "spin_drag"} and pitch_degradation <= 0.03:
        return None

    shift = min(0.024, 0.01 + pitch_degradation + max(over_number - 10.0, 0.0) * 0.001)
    if batting_side == "team1":
        team1_delta = -shift
    else:
        team1_delta = shift

    return {
        "id": "pitch_degradation",
        "team1_delta": team1_delta,
        "intensity": shift,
        "reason": "Slow second-innings surface compounds pressure on the chasing side.",
        "direction": "against_chasing_team",
    }
