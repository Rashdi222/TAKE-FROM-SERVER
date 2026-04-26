from __future__ import annotations

import os
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Any


@dataclass(frozen=True)
class ReviewerLimits:
    min_decimal_odds: Decimal = Decimal("1.01")
    soft_decimal_ceiling: Decimal = Decimal("8.00")
    hard_decimal_ceiling: Decimal = Decimal("12.00")
    soft_jump_threshold: float = 0.08
    retry_jump_threshold: float = 0.12
    hard_reject_threshold: float = 0.20
    min_confidence: float = 0.22
    two_way_total_min: float = 1.00
    two_way_total_max: float = 1.18


DEFAULT_LIMITS = ReviewerLimits(
    min_decimal_odds=Decimal(os.getenv("CRICKET_REVIEW_MIN_ODDS", "1.01")),
    soft_decimal_ceiling=Decimal(os.getenv("CRICKET_REVIEW_SOFT_MAX_ODDS", "8.00")),
    hard_decimal_ceiling=Decimal(os.getenv("CRICKET_REVIEW_HARD_MAX_ODDS", "12.00")),
    soft_jump_threshold=float(os.getenv("CRICKET_REVIEW_SOFT_JUMP", "0.08")),
    retry_jump_threshold=float(os.getenv("CRICKET_REVIEW_RETRY_JUMP", "0.12")),
    hard_reject_threshold=float(os.getenv("CRICKET_REVIEW_HARD_JUMP", "0.20")),
    min_confidence=float(os.getenv("CRICKET_REVIEW_MIN_CONFIDENCE", "0.22")),
    two_way_total_min=float(os.getenv("CRICKET_REVIEW_TWO_WAY_MIN", "1.00")),
    two_way_total_max=float(os.getenv("CRICKET_REVIEW_TWO_WAY_MAX", "1.18")),
)

CRITICAL_EVENT_TYPES = {
    "wicket",
    "boundary",
    "four",
    "six",
    "over_complete",
    "over_completion",
    "innings_break",
    "chase_collapse",
    "chase_surge",
}


def parse_decimal(value: Any) -> Decimal | None:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return value
    if isinstance(value, int):
        return Decimal(value)
    if isinstance(value, float):
        return Decimal(str(value))
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return None
        try:
            return Decimal(stripped)
        except InvalidOperation:
            return None
    return None


def parse_float(value: Any) -> float | None:
    decimal_value = parse_decimal(value)
    if decimal_value is None:
        return None
    return float(decimal_value)


def clamp_probability(value: float) -> float:
    return max(0.02, min(0.98, value))


def critical_event_exception(event_type: str | None) -> bool:
    normalized = (event_type or "").strip().lower().replace(" ", "_")
    return normalized in CRITICAL_EVENT_TYPES


def preferred_anchor(
    current_published_probability: float | None,
    prior_probability: float | None,
    base_probability: float,
) -> float:
    anchors = [value for value in [current_published_probability, prior_probability] if value is not None]
    if not anchors:
        return clamp_probability(base_probability)
    anchor = sum(anchors) / len(anchors)
    if current_published_probability is not None:
        anchor = (anchor * 0.6) + (current_published_probability * 0.4)
    return clamp_probability(anchor)


def target_probability_envelope(anchor_probability: float, radius: float) -> tuple[float, float]:
    return clamp_probability(anchor_probability - radius), clamp_probability(anchor_probability + radius)


def dampen_toward_anchor(candidate_probability: float, anchor_probability: float, weight: float) -> float:
    weight = max(0.0, min(weight, 0.95))
    return clamp_probability((candidate_probability * (1.0 - weight)) + (anchor_probability * weight))

