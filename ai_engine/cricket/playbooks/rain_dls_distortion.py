from __future__ import annotations

from typing import Any


def evaluate_rain_dls_distortion(
    *,
    dossier: dict[str, Any],
    event_type: str | None,
    batting_side: str,
    target_runs: int | None,
    required_run_rate: float | None,
    balls_remaining: int | None,
) -> dict[str, Any] | None:
    if batting_side not in {"team1", "team2"}:
        return None

    weather = (dossier.get("weather_profile") or {}) if isinstance(dossier, dict) else {}
    interruption_risk = float(weather.get("interruption_risk") or 0.0)
    event_name = str(event_type or "").lower()
    pressure = required_run_rate or 0.0

    if event_name not in {"rain_break", "rain_delay", "weather_alert"} and interruption_risk < 0.45:
        return None
    if target_runs is None:
        return None

    shift = 0.01
    if interruption_risk >= 0.65:
        shift += 0.006
    if pressure >= 9.0:
        shift += 0.008
    if balls_remaining is not None and balls_remaining <= 30:
        shift += 0.006

    shift = min(0.03, shift)
    team1_delta = -shift if batting_side == "team1" else shift

    return {
        "id": "rain_dls_distortion",
        "team1_delta": team1_delta,
        "intensity": shift,
        "reason": "Weather-interruption pressure and DLS uncertainty should reduce confidence in the chasing side.",
        "direction": "against_batting_team",
    }
