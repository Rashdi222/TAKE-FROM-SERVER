from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


DEFAULT_LEAGUE_AVERAGE_STRIKE_RATE = 130.0


@dataclass
class BoundaryPressureOutcome:
    runs_required: int
    balls_remaining: int
    required_run_rate: float
    average_strike_rate: float
    finisher_capacity_index: float
    boundary_density: float
    required_boundary_runs: float
    required_boundary_count: float
    required_boundary_interval: float | None
    capability_boundary_interval: float | None
    necessity_gap: float
    desperate_chase: bool
    aggressive_mode: bool
    flags: list[str] = field(default_factory=list)
    summary: dict[str, Any] = field(default_factory=dict)


def calculate_boundary_pressure(
    *,
    runs_required: int | None,
    balls_remaining: int | None,
    wickets_fallen: int | None,
    batsman_strike_rates: list[float] | None,
    required_run_rate: float | None,
    inning: int | None,
) -> BoundaryPressureOutcome:
    safe_runs_required = max(int(runs_required or 0), 0)
    safe_balls_remaining = max(int(balls_remaining or 0), 0)
    safe_wickets = max(int(wickets_fallen or 0), 0)
    inning_number = int(inning or 0)

    if inning_number < 2 or safe_runs_required <= 0 or safe_balls_remaining <= 0:
      return neutral_outcome(
          runs_required=safe_runs_required,
          balls_remaining=safe_balls_remaining,
          required_run_rate=float(required_run_rate or 0.0),
      )

    rates = normalize_strike_rates(batsman_strike_rates)
    average_sr = sum(rates) / len(rates)
    top_sr = max(rates)
    weighted_finisher_sr = (average_sr * 0.72) + (top_sr * 0.28)
    wicket_drag = max(0.55, 1.0 - (safe_wickets * 0.045))
    effective_sr = weighted_finisher_sr * wicket_drag

    required_rpb = safe_runs_required / max(safe_balls_remaining, 1)
    expected_rpb = effective_sr / 100.0

    singles_doubles_capacity = max(0.85, min(expected_rpb, 1.65))
    excess_rpb = max(required_rpb - singles_doubles_capacity, 0.0)
    required_boundary_runs = excess_rpb * safe_balls_remaining
    required_boundary_count = required_boundary_runs / 5.0
    boundary_density = required_boundary_count / max(safe_balls_remaining, 1)

    capability_boundary_share = max(0.08, min(0.48, ((effective_sr - 95.0) / 185.0)))
    required_boundary_interval = (
        safe_balls_remaining / required_boundary_count if required_boundary_count > 0 else None
    )
    capability_boundary_interval = 1.0 / capability_boundary_share if capability_boundary_share > 0 else None
    finisher_capacity_index = capability_boundary_share / max(boundary_density, 0.0001) if boundary_density > 0 else 1.0
    necessity_gap = max(boundary_density - capability_boundary_share, 0.0)

    desperate_chase = boundary_density > 0 and finisher_capacity_index < 1.0
    aggressive_mode = desperate_chase and volatility_pressure_score(
        required_rpb=required_rpb,
        expected_rpb=expected_rpb,
        wickets_fallen=safe_wickets,
        balls_remaining=safe_balls_remaining,
    ) >= 1.0

    flags: list[str] = []
    if desperate_chase:
        flags.append("desperate_chase")
    if aggressive_mode:
        flags.append("volatility_mode_active")
    if not batsman_strike_rates:
        flags.append("boundary_pressure_league_average_fallback")

    summary = {
        "runs_required": safe_runs_required,
        "balls_remaining": safe_balls_remaining,
        "required_run_rate": round(required_run_rate or (required_rpb * 6.0), 4),
        "average_strike_rate": round(average_sr, 4),
        "effective_strike_rate": round(effective_sr, 4),
        "required_runs_per_ball": round(required_rpb, 4),
        "expected_runs_per_ball": round(expected_rpb, 4),
        "boundary_density": round(boundary_density, 6),
        "required_boundary_runs": round(required_boundary_runs, 4),
        "required_boundary_count": round(required_boundary_count, 4),
        "required_boundary_interval": round(required_boundary_interval, 4) if required_boundary_interval else None,
        "capability_boundary_interval": round(capability_boundary_interval, 4)
        if capability_boundary_interval
        else None,
        "capability_boundary_share": round(capability_boundary_share, 6),
        "finisher_capacity_index": round(finisher_capacity_index, 6),
        "necessity_gap": round(necessity_gap, 6),
        "desperate_chase": desperate_chase,
        "aggressive_mode": aggressive_mode,
    }

    return BoundaryPressureOutcome(
        runs_required=safe_runs_required,
        balls_remaining=safe_balls_remaining,
        required_run_rate=float(required_run_rate or (required_rpb * 6.0)),
        average_strike_rate=average_sr,
        finisher_capacity_index=finisher_capacity_index,
        boundary_density=boundary_density,
        required_boundary_runs=required_boundary_runs,
        required_boundary_count=required_boundary_count,
        required_boundary_interval=required_boundary_interval,
        capability_boundary_interval=capability_boundary_interval,
        necessity_gap=necessity_gap,
        desperate_chase=desperate_chase,
        aggressive_mode=aggressive_mode,
        flags=flags,
        summary=summary,
    )


def normalize_strike_rates(values: list[float] | None) -> list[float]:
    normalized = [float(value) for value in (values or []) if value and float(value) > 0]
    return normalized if normalized else [DEFAULT_LEAGUE_AVERAGE_STRIKE_RATE]


def volatility_pressure_score(
    *,
    required_rpb: float,
    expected_rpb: float,
    wickets_fallen: int,
    balls_remaining: int,
) -> float:
    required_ratio = required_rpb / max(expected_rpb, 0.01)
    wicket_stress = 1.0 + (wickets_fallen * 0.06)
    endgame_stress = 1.0 + max(0.0, (24 - balls_remaining) / 24.0)
    return required_ratio * wicket_stress * endgame_stress


def neutral_outcome(*, runs_required: int, balls_remaining: int, required_run_rate: float) -> BoundaryPressureOutcome:
    summary = {
        "runs_required": runs_required,
        "balls_remaining": balls_remaining,
        "required_run_rate": round(required_run_rate, 4),
        "boundary_density": 0.0,
        "required_boundary_runs": 0.0,
        "required_boundary_count": 0.0,
        "desperate_chase": False,
        "aggressive_mode": False,
    }
    return BoundaryPressureOutcome(
        runs_required=runs_required,
        balls_remaining=balls_remaining,
        required_run_rate=required_run_rate,
        average_strike_rate=DEFAULT_LEAGUE_AVERAGE_STRIKE_RATE,
        finisher_capacity_index=1.0,
        boundary_density=0.0,
        required_boundary_runs=0.0,
        required_boundary_count=0.0,
        required_boundary_interval=None,
        capability_boundary_interval=None,
        necessity_gap=0.0,
        desperate_chase=False,
        aggressive_mode=False,
        flags=[],
        summary=summary,
    )
