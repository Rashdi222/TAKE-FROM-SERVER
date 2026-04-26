from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from cricket.risk_limits import clamp_probability, parse_float


@dataclass
class ExposureOutcome:
    adjusted_probability: float
    confidence_penalty: float = 0.0
    max_allowed_low: float | None = None
    max_allowed_high: float | None = None
    summary: dict[str, Any] = field(default_factory=dict)
    flags: list[str] = field(default_factory=list)
    shading_recommendation: str | None = None


def apply_exposure_shading(
    *,
    liability_book: dict[str, Any] | None,
    candidate_probability: float,
    current_published_probability: float | None,
    prior_probability: float | None,
    match_state: Any | None = None,
    batting_side: str = "unknown",
    balls_remaining: int | None = None,
    boundary_pressure: dict[str, Any] | None = None,
) -> ExposureOutcome:
    if not liability_book:
        return ExposureOutcome(adjusted_probability=clamp_probability(candidate_probability))

    policy = liability_book.get("policy") or {}
    match_winner = ((liability_book.get("markets") or {}).get("match_winner") or {}).get("selections") or {}
    team1 = match_winner.get("team1") or {}
    team2 = match_winner.get("team2") or {}

    team1_potential = parse_float(team1.get("potential_payout")) or 0.0
    team2_potential = parse_float(team2.get("potential_payout")) or 0.0
    total_potential = team1_potential + team2_potential

    if total_potential <= 0:
        return ExposureOutcome(adjusted_probability=clamp_probability(candidate_probability))

    team1_share = team1_potential / total_potential
    team2_share = team2_potential / total_potential
    dominant_side = "team1" if team1_share >= team2_share else "team2"
    dominant_share = max(team1_share, team2_share)
    soft_share = float(policy.get("selection_soft_share", 0.58))
    hard_share = float(policy.get("selection_hard_share", 0.68))
    max_probability_shade = float(policy.get("max_probability_shade", 0.04))
    concentration_threshold = float(policy.get("high_user_concentration_ratio", 0.45))
    phase_profile = resolve_phase_profile(
        match_state=match_state,
        batting_side=batting_side,
        balls_remaining=balls_remaining,
        boundary_pressure=boundary_pressure or {},
    )
    concentration_ratio = max(
        user_concentration_ratio(team1),
        user_concentration_ratio(team2),
    )

    flags: list[str] = []
    if dominant_share <= 0.5:
        return ExposureOutcome(
            adjusted_probability=clamp_probability(candidate_probability),
            summary=build_summary(team1_share, team2_share, concentration_ratio, dominant_side, dominant_share),
            flags=flags,
        )

    imbalance = (dominant_share - 0.5) * 2.0
    soft_share = max(0.52, soft_share - phase_profile["soft_share_tightening"])
    hard_share = max(soft_share + 0.04, hard_share - phase_profile["hard_share_tightening"])
    phase_cap = min(0.08, max_probability_shade + phase_profile["additional_max_shade"])
    base_shift = min(phase_cap, imbalance * phase_profile["imbalance_multiplier"])
    concentration_bonus = phase_profile["concentration_bonus"] if concentration_ratio >= concentration_threshold else 0.0
    probability_shift = min(phase_cap, base_shift + concentration_bonus)

    if dominant_side == "team1":
        adjusted_probability = clamp_probability(candidate_probability + probability_shift)
        recommendation = "shorten_team1_lengthen_team2"
    else:
        adjusted_probability = clamp_probability(candidate_probability - probability_shift)
        recommendation = "shorten_team2_lengthen_team1"

    envelope_radius = phase_profile["base_envelope_radius"]
    confidence_penalty = 0.0

    if dominant_share >= soft_share:
        flags.append(f"exposure_soft_pressure:{dominant_side}:{dominant_share:.4f}")
        envelope_radius = 0.10
        confidence_penalty += 0.03

    if dominant_share >= hard_share:
        flags.append(f"exposure_hard_pressure:{dominant_side}:{dominant_share:.4f}")
        envelope_radius = 0.08
        confidence_penalty += 0.05

    if concentration_ratio >= concentration_threshold:
        flags.append(f"exposure_user_concentration:{concentration_ratio:.4f}")
        confidence_penalty += 0.02

    envelope_radius = min(envelope_radius, phase_profile["base_envelope_radius"])

    current_anchor = current_published_probability if current_published_probability is not None else candidate_probability
    prior_anchor = prior_probability if prior_probability is not None else current_anchor
    anchor = clamp_probability((current_anchor * 0.55) + (prior_anchor * 0.45))
    low = clamp_probability(anchor - envelope_radius)
    high = clamp_probability(anchor + envelope_radius)

    return ExposureOutcome(
        adjusted_probability=adjusted_probability,
        confidence_penalty=confidence_penalty,
        max_allowed_low=low,
        max_allowed_high=high,
        summary=build_summary(
            team1_share,
            team2_share,
            concentration_ratio,
            dominant_side,
            dominant_share,
            phase_profile,
        ),
        flags=flags + [f"exposure_shading:{recommendation}:{probability_shift:.4f}"],
        shading_recommendation=recommendation,
    )


def user_concentration_ratio(selection: dict[str, Any]) -> float:
    total = parse_float(selection.get("potential_payout")) or 0.0
    max_user = parse_float(selection.get("max_user_potential")) or 0.0
    if total <= 0:
        return 0.0
    return max_user / total


def build_summary(
    team1_share: float,
    team2_share: float,
    concentration_ratio: float,
    dominant_side: str,
    dominant_share: float,
    phase_profile: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "team1_share": round(team1_share, 4),
        "team2_share": round(team2_share, 4),
        "dominant_side": dominant_side,
        "dominant_share": round(dominant_share, 4),
        "user_concentration_ratio": round(concentration_ratio, 4),
        "phase_profile": phase_profile or {},
    }


def resolve_phase_profile(
    *,
    match_state: Any | None,
    batting_side: str,
    balls_remaining: int | None,
    boundary_pressure: dict[str, Any],
) -> dict[str, Any]:
    if match_state is None:
        return {
            "name": "neutral",
            "imbalance_multiplier": 0.03,
            "additional_max_shade": 0.0,
            "concentration_bonus": 0.01,
            "base_envelope_radius": 0.12,
            "soft_share_tightening": 0.0,
            "hard_share_tightening": 0.0,
        }

    inning = int(getattr(match_state, "target_runs", None) is not None)
    wickets_total = int(getattr(match_state, "wickets_total", 0) or 0)
    desperate_chase = bool(boundary_pressure.get("desperate_chase"))

    if inning and batting_side in {"team1", "team2"} and balls_remaining is not None and balls_remaining <= 24:
        return {
            "name": "death_over_chase",
            "imbalance_multiplier": 0.05,
            "additional_max_shade": 0.03 if desperate_chase else 0.02,
            "concentration_bonus": 0.015,
            "base_envelope_radius": 0.07 if desperate_chase else 0.09,
            "soft_share_tightening": 0.03,
            "hard_share_tightening": 0.04,
        }

    if inning and wickets_total >= 7:
        return {
            "name": "fragile_chase",
            "imbalance_multiplier": 0.04,
            "additional_max_shade": 0.02,
            "concentration_bonus": 0.012,
            "base_envelope_radius": 0.10,
            "soft_share_tightening": 0.02,
            "hard_share_tightening": 0.03,
        }

    return {
        "name": "neutral",
        "imbalance_multiplier": 0.03,
        "additional_max_shade": 0.0,
        "concentration_bonus": 0.01,
        "base_envelope_radius": 0.12,
        "soft_share_tightening": 0.0,
        "hard_share_tightening": 0.0,
    }
