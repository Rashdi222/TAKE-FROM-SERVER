from __future__ import annotations

import logging
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any

from cricket.coherence import evaluate_market_coherence
from cricket.market_factory import build_candidate_markets
from cricket.risk_limits import (
    DEFAULT_LIMITS,
    ReviewerLimits,
    clamp_probability,
    critical_event_exception,
    dampen_toward_anchor,
    preferred_anchor,
    target_probability_envelope,
)

logger = logging.getLogger(__name__)


@dataclass
class ReviewerOutcome:
    decision: str
    feedback: str | None
    flags: list[str] = field(default_factory=list)
    approved_probability: float | None = None
    approved_confidence: float = 0.0
    approved_markets: list[dict[str, Any]] = field(default_factory=list)
    correction_low: float | None = None
    correction_high: float | None = None
    dampening_applied: bool = False
    volatility_mode_active: bool = False
    elasticity_applied: bool = False
    elasticity_reason: str | None = None


def review_candidate(
    *,
    request: Any,
    team1_name: str,
    team2_name: str,
    batting_side: str,
    over_number: float,
    balls_remaining: int | None,
    candidate_probability: float,
    candidate_confidence: float,
    base_probability: float,
    prior_probability: float | None,
    current_published_probability: float | None,
    llm_error: str | None,
    generator_attempt: int,
    margin: Decimal,
    hard_jump_threshold: float,
    pre_flags: list[str] | None = None,
    max_allowed_low: float | None = None,
    max_allowed_high: float | None = None,
    fair_probability: float | None = None,
    display_probability: float | None = None,
    shading_magnitude: float | None = None,
    active_playbooks: list[str] | None = None,
    bookmaker_flags: list[str] | None = None,
    exposure_flags: list[str] | None = None,
    volatility_mode_active: bool = False,
    desperate_chase: bool = False,
    bookmaker_summary: dict[str, Any] | None = None,
    limits: ReviewerLimits = DEFAULT_LIMITS,
) -> ReviewerOutcome:
    event_type = request.trigger.event_type
    critical_event = critical_event_exception(event_type)
    preview_markets = build_candidate_markets(
        match_state=request.match_state,
        team1_name=team1_name,
        team2_name=team2_name,
        batting_side=batting_side,
        over_number=over_number,
        balls_remaining=balls_remaining,
        probability_team1=candidate_probability,
        confidence=candidate_confidence,
        margin=margin,
        liability_book=request.liability_book,
    )

    hard_flags, soft_flags = evaluate_market_coherence(
        markets=preview_markets,
        current_odds=request.current_odds,
        match_state=request.match_state,
        limits=limits,
    )

    current_jump = jump_ratio(candidate_probability, current_published_probability)
    prior_jump = jump_ratio(candidate_probability, prior_probability)
    biggest_jump = max(value for value in [current_jump, prior_jump, 0.0] if value is not None)
    flags = list(pre_flags or []) + list(hard_flags) + list(soft_flags)
    anchor = preferred_anchor(current_published_probability, prior_probability, base_probability)
    effective_hard_jump = min(hard_jump_threshold, limits.hard_reject_threshold)
    active_playbooks = list(active_playbooks or [])
    bookmaker_flags = list(bookmaker_flags or [])
    exposure_flags = list(exposure_flags or [])
    bookmaker_summary = dict(bookmaker_summary or {})
    fair_to_display_shift = shift_amount(display_probability, fair_probability)
    display_to_final_shift = shift_amount(candidate_probability, display_probability)
    total_skew = shift_amount(candidate_probability, fair_probability)
    declared_shading = abs(float(shading_magnitude or 0.0))
    boundary_pressure = dict(bookmaker_summary.get("boundary_pressure") or {})
    elasticity_reason = resolve_elasticity_reason(
        volatility_mode_active=volatility_mode_active,
        desperate_chase=desperate_chase,
        boundary_pressure=boundary_pressure,
    )
    elastic_exception = critical_event or (volatility_mode_active and desperate_chase)
    display_skew_ceiling = resolve_elasticity_ceiling(
        volatility_mode_active=volatility_mode_active,
        desperate_chase=desperate_chase,
        bookmaker_summary=bookmaker_summary,
        limits=limits,
    )
    elasticity_applied = bool(
        volatility_mode_active and desperate_chase and fair_to_display_shift is not None and fair_to_display_shift > 0.035
    )

    if current_jump is not None and current_jump > 0:
        flags.append(f"price_jump_current:{current_jump:.4f}")
    if prior_jump is not None and prior_jump > 0:
        flags.append(f"price_jump_prior:{prior_jump:.4f}")
    if llm_error:
        flags.append("llm_error")
    if candidate_confidence < limits.min_confidence:
        flags.append("low_confidence")
    if max_allowed_low is not None and candidate_probability < max_allowed_low:
        flags.append(f"exposure_envelope_breach:low:{candidate_probability:.4f}:{max_allowed_low:.4f}")
    if max_allowed_high is not None and candidate_probability > max_allowed_high:
        flags.append(f"exposure_envelope_breach:high:{candidate_probability:.4f}:{max_allowed_high:.4f}")
    if fair_to_display_shift is not None and fair_to_display_shift > 0:
        flags.append(f"bookmaker_shift:{fair_to_display_shift:.4f}")
    if display_to_final_shift is not None and display_to_final_shift > 0:
        flags.append(f"exposure_shift:{display_to_final_shift:.4f}")
    if total_skew is not None and total_skew > 0:
        flags.append(f"combined_skew:{total_skew:.4f}")

    if total_skew is not None and declared_shading and abs(total_skew - declared_shading) > 0.05:
        return retry_required(
            request=request,
            anchor=anchor,
            flags=flags + [f"shading_declaration_mismatch:{declared_shading:.4f}:{total_skew:.4f}"],
            reason_code="shading_declaration_mismatch",
            envelope_radius=limits.soft_jump_threshold,
            max_allowed_low=max_allowed_low,
            max_allowed_high=max_allowed_high,
            volatility_mode_active=volatility_mode_active,
            elasticity_applied=elasticity_applied,
            elasticity_reason=elasticity_reason,
        )

    if fair_to_display_shift is not None and fair_to_display_shift > 0.0 and not (bookmaker_flags or active_playbooks):
        return keep_suspended(
            flags=flags + ["unjustified_bookmaker_skew"],
            feedback="Rejected: bookmaker skew was applied without a declared playbook or bookmaker flag.",
            volatility_mode_active=volatility_mode_active,
            elasticity_applied=elasticity_applied,
            elasticity_reason=elasticity_reason,
        )

    if display_to_final_shift is not None and display_to_final_shift > 0.0 and not exposure_flags:
        return keep_suspended(
            flags=flags + ["unjustified_exposure_skew"],
            feedback="Rejected: exposure shading was applied without an exposure justification flag.",
            volatility_mode_active=volatility_mode_active,
            elasticity_applied=elasticity_applied,
            elasticity_reason=elasticity_reason,
        )

    if fair_to_display_shift is not None and fair_to_display_shift > display_skew_ceiling:
        return retry_required(
            request=request,
            anchor=anchor,
            flags=flags + [f"display_skew_ceiling_breach:{fair_to_display_shift:.4f}:{display_skew_ceiling:.4f}"],
            reason_code="display_skew_ceiling_breach",
            envelope_radius=limits.soft_jump_threshold,
            max_allowed_low=max_allowed_low,
            max_allowed_high=max_allowed_high,
            volatility_mode_active=volatility_mode_active,
            elasticity_applied=elasticity_applied,
            elasticity_reason=elasticity_reason,
        )

    if total_skew is not None and total_skew > effective_hard_jump:
        return keep_suspended(
            flags=flags + [f"combined_skew_hard_reject:{total_skew:.4f}"],
            feedback=(
                f"Rejected: combined bookmaker and exposure skew {total_skew:.4f} "
                f"exceeds hard limit {effective_hard_jump:.4f}."
            ),
            volatility_mode_active=volatility_mode_active,
            elasticity_applied=elasticity_applied,
            elasticity_reason=elasticity_reason,
        )

    elastic_retry_threshold = max(limits.retry_jump_threshold, min(display_skew_ceiling, limits.hard_reject_threshold))

    if total_skew is not None and total_skew > elastic_retry_threshold and not elastic_exception:
        return retry_required(
            request=request,
            anchor=anchor,
            flags=flags + [f"combined_skew_retry:{total_skew:.4f}"],
            reason_code="combined_skew_retry",
            envelope_radius=limits.soft_jump_threshold,
            max_allowed_low=max_allowed_low,
            max_allowed_high=max_allowed_high,
            volatility_mode_active=volatility_mode_active,
            elasticity_applied=elasticity_applied,
            elasticity_reason=elasticity_reason,
        )

    if any(flag.startswith("reviewer_hard_bound_violation") for flag in flags):
        return keep_suspended(
            flags=flags,
            feedback="Rejected: reviewer_hard_bound_violation. Proposed odds breached the hard trading ceiling or floor.",
            volatility_mode_active=volatility_mode_active,
            elasticity_applied=elasticity_applied,
            elasticity_reason=elasticity_reason,
        )

    if hard_flags and not all(flag.startswith("soft_ceiling_breach") for flag in hard_flags):
        return keep_suspended(
            flags=flags,
            feedback=f"Rejected: market coherence failure. {', '.join(hard_flags)}",
            volatility_mode_active=volatility_mode_active,
            elasticity_applied=elasticity_applied,
            elasticity_reason=elasticity_reason,
        )

    if biggest_jump > effective_hard_jump and not elastic_exception:
        return keep_suspended(
            flags=flags + [f"hard_jump_reject:{biggest_jump:.4f}"],
            feedback=f"Rejected: proposed move {biggest_jump:.4f} exceeds hard limit {effective_hard_jump:.4f}.",
            volatility_mode_active=volatility_mode_active,
            elasticity_applied=elasticity_applied,
            elasticity_reason=elasticity_reason,
        )

    if candidate_confidence < limits.min_confidence:
        if generator_attempt < 2:
            return retry_required(
                request=request,
                anchor=anchor,
                flags=flags,
                reason_code="low_confidence",
                envelope_radius=limits.soft_jump_threshold,
                max_allowed_low=max_allowed_low,
                max_allowed_high=max_allowed_high,
                volatility_mode_active=volatility_mode_active,
                elasticity_applied=elasticity_applied,
                elasticity_reason=elasticity_reason,
            )
        if volatility_mode_active or active_playbooks:
            dampened_probability = dampen_toward_anchor(candidate_probability, anchor, weight=0.42)
            return approve_with_dampening(
                request=request,
                team1_name=team1_name,
                team2_name=team2_name,
                batting_side=batting_side,
                over_number=over_number,
                balls_remaining=balls_remaining,
                margin=margin,
                confidence=limits.min_confidence,
                dampened_probability=dampened_probability,
                flags=flags + ["low_confidence_dampened_publish"],
                volatility_mode_active=volatility_mode_active,
                elasticity_applied=elasticity_applied,
                elasticity_reason=elasticity_reason,
            )
        return keep_suspended(
            flags=flags,
            feedback="Rejected: confidence remained below the minimum safe threshold after retry.",
            volatility_mode_active=volatility_mode_active,
            elasticity_applied=elasticity_applied,
            elasticity_reason=elasticity_reason,
        )

    if biggest_jump > elastic_retry_threshold:
        if elastic_exception:
            dampening_weight = 0.45 if critical_event else 0.05
            dampened_probability = dampen_toward_anchor(candidate_probability, anchor, weight=dampening_weight)
            return approve_with_dampening(
                request=request,
                team1_name=team1_name,
                team2_name=team2_name,
                batting_side=batting_side,
                over_number=over_number,
                balls_remaining=balls_remaining,
                margin=margin,
                confidence=max(candidate_confidence - 0.08, limits.min_confidence),
                dampened_probability=dampened_probability,
                flags=flags + [f"{'critical_event' if critical_event else 'desperate_chase'}_dampening:{biggest_jump:.4f}"],
                volatility_mode_active=volatility_mode_active,
                elasticity_applied=elasticity_applied,
                elasticity_reason=elasticity_reason,
            )
        return retry_required(
            request=request,
            anchor=anchor,
            flags=flags + [f"retry_jump_threshold:{biggest_jump:.4f}"],
            reason_code="price_jump_retry",
            envelope_radius=limits.soft_jump_threshold,
            max_allowed_low=max_allowed_low,
            max_allowed_high=max_allowed_high,
            volatility_mode_active=volatility_mode_active,
            elasticity_applied=elasticity_applied,
            elasticity_reason=elasticity_reason,
        )

    if soft_flags or biggest_jump > limits.soft_jump_threshold:
        if critical_event and candidate_confidence >= 0.65 and not soft_flags:
            return ReviewerOutcome(
                decision="approve",
                feedback=None,
                flags=dedupe(flags + [f"critical_event_approved:{biggest_jump:.4f}"]),
                approved_probability=clamp_probability(candidate_probability),
                approved_confidence=candidate_confidence,
                approved_markets=preview_markets,
                volatility_mode_active=volatility_mode_active,
                elasticity_applied=elasticity_applied,
                elasticity_reason=elasticity_reason,
            )

        dampened_probability = dampen_toward_anchor(candidate_probability, anchor, weight=0.35)
        return approve_with_dampening(
            request=request,
            team1_name=team1_name,
            team2_name=team2_name,
            batting_side=batting_side,
            over_number=over_number,
            balls_remaining=balls_remaining,
            margin=margin,
            confidence=max(candidate_confidence - 0.03, limits.min_confidence),
            dampened_probability=dampened_probability,
            flags=flags + [f"soft_dampening:{biggest_jump:.4f}"],
            volatility_mode_active=volatility_mode_active,
            elasticity_applied=elasticity_applied,
            elasticity_reason=elasticity_reason,
        )

    return ReviewerOutcome(
        decision="approve",
        feedback=None,
        flags=dedupe(flags),
        approved_probability=clamp_probability(candidate_probability),
        approved_confidence=candidate_confidence,
        approved_markets=preview_markets,
        volatility_mode_active=volatility_mode_active,
        elasticity_applied=elasticity_applied,
        elasticity_reason=elasticity_reason,
    )


def retry_required(
    *,
    request: Any,
    anchor: float,
    flags: list[str],
    reason_code: str,
    envelope_radius: float,
    max_allowed_low: float | None = None,
    max_allowed_high: float | None = None,
    volatility_mode_active: bool = False,
    elasticity_applied: bool = False,
    elasticity_reason: str | None = None,
) -> ReviewerOutcome:
    low, high = target_probability_envelope(anchor, envelope_radius)
    if max_allowed_low is not None:
        low = max(low, max_allowed_low)
    if max_allowed_high is not None:
        high = min(high, max_allowed_high)
    if low > high:
        low = high = clamp_probability(anchor)

    logger.warning(
        "[SELF_HEAL] reviewer requested retry match_id=%s event_type=%s reason=%s envelope_low=%.4f envelope_high=%.4f",
        getattr(request, "match_id", "unknown"),
        getattr(getattr(request, "trigger", None), "event_type", "unknown"),
        reason_code,
        low,
        high,
    )

    return ReviewerOutcome(
        decision="reject_and_retry",
        feedback=(
            f"Rejected with retry. reason={reason_code}. "
            f"Revise into probability band {low:.2f} - {high:.2f}."
        ),
        flags=dedupe(flags + [reason_code]),
        correction_low=low,
        correction_high=high,
        volatility_mode_active=volatility_mode_active,
        elasticity_applied=elasticity_applied,
        elasticity_reason=elasticity_reason,
    )


def keep_suspended(
    *,
    flags: list[str],
    feedback: str,
    volatility_mode_active: bool = False,
    elasticity_applied: bool = False,
    elasticity_reason: str | None = None,
) -> ReviewerOutcome:
    return ReviewerOutcome(
        decision="reject_and_keep_suspended",
        feedback=feedback,
        flags=dedupe(flags),
        volatility_mode_active=volatility_mode_active,
        elasticity_applied=elasticity_applied,
        elasticity_reason=elasticity_reason,
    )


def approve_with_dampening(
    *,
    request: Any,
    team1_name: str,
    team2_name: str,
    batting_side: str,
    over_number: float,
    balls_remaining: int | None,
    margin: Decimal,
    confidence: float,
    dampened_probability: float,
    flags: list[str],
    volatility_mode_active: bool = False,
    elasticity_applied: bool = False,
    elasticity_reason: str | None = None,
) -> ReviewerOutcome:
    approved_probability = clamp_probability(dampened_probability)
    approved_markets = build_candidate_markets(
        match_state=request.match_state,
        team1_name=team1_name,
        team2_name=team2_name,
        batting_side=batting_side,
        over_number=over_number,
        balls_remaining=balls_remaining,
        probability_team1=approved_probability,
        confidence=confidence,
        margin=margin,
        liability_book=request.liability_book,
    )
    return ReviewerOutcome(
        decision="approve_with_dampening",
        feedback="Approved with dampening toward the safe anchor.",
        flags=dedupe(flags),
        approved_probability=approved_probability,
        approved_confidence=confidence,
        approved_markets=approved_markets,
        dampening_applied=True,
        volatility_mode_active=volatility_mode_active,
        elasticity_applied=elasticity_applied,
        elasticity_reason=elasticity_reason,
    )


def jump_ratio(candidate_probability: float, anchor_probability: float | None) -> float | None:
    if anchor_probability is None:
        return None
    return abs(candidate_probability - anchor_probability)


def shift_amount(value: float | None, anchor: float | None) -> float | None:
    if value is None or anchor is None:
        return None
    return abs(value - anchor)


def dedupe(flags: list[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for flag in flags:
        if flag in seen:
            continue
        seen.add(flag)
        ordered.append(flag)
    return ordered


def resolve_elasticity_ceiling(
    *,
    volatility_mode_active: bool,
    desperate_chase: bool,
    bookmaker_summary: dict[str, Any],
    limits: ReviewerLimits,
) -> float:
    if not (volatility_mode_active and desperate_chase):
        return 0.035

    summary_ceiling = float(bookmaker_summary.get("max_absolute_skew") or 0.12)
    return max(0.12, min(summary_ceiling, 0.15))


def resolve_elasticity_reason(
    *,
    volatility_mode_active: bool,
    desperate_chase: bool,
    boundary_pressure: dict[str, Any],
) -> str | None:
    if not (volatility_mode_active and desperate_chase):
        return None

    density = float(boundary_pressure.get("boundary_density") or 0.0)
    interval = boundary_pressure.get("required_boundary_interval")
    if density > 0 and interval:
        return f"High boundary density required ({interval:.1f} balls/boundary)"
    return "High Boundary Density Required"
