from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from cricket.policy import get_engine_policy
from cricket.playbooks import resolve_playbooks
from cricket.risk_limits import clamp_probability, parse_float


@dataclass
class BiasOutcome:
    fair_probability: float
    display_probability: float
    total_skew: float
    structural_skew: float
    playbook_skew: float
    active_playbooks: list[str] = field(default_factory=list)
    flags: list[str] = field(default_factory=list)
    summary: dict[str, Any] = field(default_factory=dict)


def apply_bookmaker_bias(
    *,
    fair_probability: float,
    request: Any,
    batting_side: str,
    over_number: float,
    dossier: dict[str, Any],
    boundary_pressure: dict[str, Any] | None = None,
    balls_remaining: int | None = None,
    recent_events: list[dict[str, Any]] | None = None,
    batsman_strike_rates: list[float] | None = None,
    margin: float = 0.04,
) -> BiasOutcome:
    boundary_pressure = boundary_pressure or {}
    structural_skew = structural_bias(
        fair_probability=fair_probability,
        dossier=dossier,
        batting_side=batting_side,
        target_runs=request.match_state.target_runs,
    )

    playbooks = resolve_playbooks(
        dossier=dossier,
        event_type=request.trigger.event_type,
        over_number=over_number,
        batting_side=batting_side,
        inning=int(getattr(request.match_state, "inning", 0) or 0),
        target_runs=request.match_state.target_runs,
        runs_total=int(getattr(request.match_state, "runs_total", 0) or 0),
        wickets_total=int(getattr(request.match_state, "wickets_total", 0) or 0),
        required_run_rate=parse_float(getattr(request.match_state, "required_run_rate", None)),
        balls_remaining=balls_remaining,
        recent_events=recent_events or [],
        batsman_strike_rates=batsman_strike_rates or [],
        boundary_pressure=boundary_pressure,
    )
    playbook_skew = sum(float(item.get("team1_delta") or 0.0) for item in playbooks)
    volatility_skew = volatility_long_shot_skew(
        batting_side=batting_side,
        boundary_pressure=boundary_pressure,
    )
    max_skew = resolve_max_skew(boundary_pressure)
    
    # Cap skew at margin × 3 to prevent negative margins on one side
    # Example: 4% margin → max skew 12%, prevents house losing money
    margin_based_cap = margin * 3.0
    max_skew = min(max_skew, margin_based_cap)
    
    total_skew = cap_skew(structural_skew + playbook_skew + volatility_skew, max_skew=max_skew)
    display_probability = clamp_probability(fair_probability + total_skew)

    flags = []
    if structural_skew != 0.0:
        flags.append(f"bookmaker_structural_skew:{structural_skew:.4f}")
    if playbook_skew != 0.0:
        flags.append(f"bookmaker_playbook_skew:{playbook_skew:.4f}")
    if volatility_skew != 0.0:
        flags.append(f"boundary_necessity_skew:{volatility_skew:.4f}")
    if boundary_pressure.get("aggressive_mode"):
        flags.append("volatility_mode_active")
    if total_skew != structural_skew + playbook_skew + volatility_skew:
        flags.append(f"bookmaker_skew_capped:{total_skew:.4f}")
    flags.extend(f"playbook:{item['id']}:{item['intensity']:.4f}" for item in playbooks)
    flags.extend(str(flag) for flag in boundary_pressure.get("flags", []))

    summary = {
        "fair_probability": round(fair_probability, 6),
        "display_probability": round(display_probability, 6),
        "structural_skew": round(structural_skew, 6),
        "playbook_skew": round(playbook_skew, 6),
        "volatility_skew": round(volatility_skew, 6),
        "total_skew": round(total_skew, 6),
        "max_absolute_skew": max_skew,
        "volatility_mode_active": bool(boundary_pressure.get("aggressive_mode")),
        "boundary_pressure": boundary_pressure,
    }

    return BiasOutcome(
        fair_probability=fair_probability,
        display_probability=display_probability,
        total_skew=total_skew,
        structural_skew=structural_skew,
        playbook_skew=playbook_skew,
        active_playbooks=[item["id"] for item in playbooks],
        flags=flags,
        summary=summary,
    )


def structural_bias(
    *,
    fair_probability: float,
    dossier: dict[str, Any],
    batting_side: str,
    target_runs: int | None,
) -> float:
    policy = get_engine_policy()
    team_personas = dossier.get("team_personas") or {}
    team1_bias = float((team_personas.get("team1") or {}).get("brand_bias") or 0.0)
    team2_bias = float((team_personas.get("team2") or {}).get("brand_bias") or 0.0)
    venue_bias = dossier.get("venue_bias") or {}

    skew = 0.0

    bias_gap = team1_bias - team2_bias
    if 0.35 <= fair_probability <= 0.65:
        skew -= max(-0.012, min(0.012, bias_gap * 0.08))

    if target_runs is not None and batting_side in {"team1", "team2"}:
        chasing_bias = float(venue_bias.get("chasing_bias") or 0.0)
        defending_bias = float(venue_bias.get("defending_bias") or 0.0)
        if batting_side == "team1":
            skew += max(-0.014, min(0.014, chasing_bias - defending_bias))
        else:
            skew -= max(-0.014, min(0.014, chasing_bias - defending_bias))

    return cap_skew(skew, max_skew=policy.bookmaker_max_absolute_skew)


def cap_skew(value: float, *, max_skew: float) -> float:
    return max(-max_skew, min(max_skew, value))


def resolve_max_skew(boundary_pressure: dict[str, Any]) -> float:
    policy = get_engine_policy()
    if not boundary_pressure.get("aggressive_mode"):
        return policy.bookmaker_max_absolute_skew

    necessity_gap = max(float(boundary_pressure.get("necessity_gap") or 0.0), 0.0)
    
    # Use critical skew cap for severe events (necessity_gap > 0.15)
    if necessity_gap > 0.15:
        dynamic_skew = policy.bookmaker_max_absolute_skew + min(
            policy.bookmaker_max_critical_skew - policy.bookmaker_max_absolute_skew,
            necessity_gap * 0.4
        )
        return max(policy.bookmaker_max_absolute_skew, min(policy.bookmaker_max_critical_skew, dynamic_skew))
    
    # Normal aggressive mode
    dynamic_skew = policy.bookmaker_max_absolute_skew + min(
        policy.bookmaker_dynamic_necessity_cap, necessity_gap * 0.55
    )
    return max(policy.bookmaker_max_absolute_skew, min(policy.bookmaker_max_volatility_skew, dynamic_skew))


def volatility_long_shot_skew(*, batting_side: str, boundary_pressure: dict[str, Any]) -> float:
    policy = get_engine_policy()
    if batting_side not in {"team1", "team2"}:
        return 0.0
    if not boundary_pressure.get("desperate_chase"):
        return 0.0

    necessity_gap = max(float(boundary_pressure.get("necessity_gap") or 0.0), 0.0)
    finisher_capacity_index = float(boundary_pressure.get("finisher_capacity_index") or 1.0)
    density = max(float(boundary_pressure.get("boundary_density") or 0.0), 0.0)
    multiplier = 1.0 if boundary_pressure.get("aggressive_mode") else 0.55

    pressure_score = (necessity_gap * 0.6) + (max(1.0 - finisher_capacity_index, 0.0) * 0.35) + (density * 0.25)
    skew = min(policy.bookmaker_max_volatility_skew, pressure_score * 0.18) * multiplier
    if skew <= 0:
        return 0.0

    # Inflate the chasing team's displayed odds by cutting its display probability.
    return -skew if batting_side == "team1" else skew
