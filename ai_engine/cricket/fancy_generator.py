from __future__ import annotations

import math
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from cricket.fancy_bias import apply_fancy_bias
from cricket.global_training_cache import load_global_format_priors
from cricket.market_factory import price_two_way_market
from cricket.policy import get_engine_policy
from cricket.risk_limits import clamp_probability, parse_float

FANCY_WINDOWS = (6, 10, 15, 20)
FANCY_LADDER_OFFSETS = (-2, -1, 0, 1, 2)
FANCY_PROBABILITY_FLOOR = 0.09
FANCY_PROBABILITY_CEILING = 0.91


def build_next_over_market(
    *,
    weighted_rr: float,
    fancy_margin: Decimal,
    confidence: float,
    valid_for_ms: int,
) -> list[dict[str, Any]]:
    """Build next-over runs market with 5-rung ladder."""
    expected_next_over = max(weighted_rr, 0.5)
    projected_line = round_half(expected_next_over)
    step = 2.0  # Fixed step for next-over
    spread = 3.5

    markets: list[dict[str, Any]] = []
    for offset in [-2, -1, 0, 1, 2]:
        ladder_line = round_half(max(0.5, projected_line + (offset * step)))
        yes_probability = clamp_fancy_probability(0.5 + ((expected_next_over - ladder_line) / spread))
        no_probability = clamp_fancy_probability(1.0 - yes_probability)
        yes_price, no_price = price_two_way_market(yes_probability, no_probability, fancy_margin)
        line_label = f"{ladder_line:.1f}"

        markets.extend([
            {
                "market_key": "fancy_next_over",
                "selection_key": f"over_{line_label}",
                "label": f"Over {line_label}",
                "price": yes_price,
                "bet_type": "in_play",
                "market_family": "fancy_markets",
                "window_label": "Runs In Next Over",
                "projected_line": line_label,
                "confidence_score": round(confidence, 4),
                "valid_for_ms": valid_for_ms,
            },
            {
                "market_key": "fancy_next_over",
                "selection_key": f"under_{line_label}",
                "label": f"Under {line_label}",
                "price": no_price,
                "bet_type": "in_play",
                "market_family": "fancy_markets",
                "window_label": "Runs In Next Over",
                "projected_line": line_label,
                "confidence_score": round(confidence, 4),
                "valid_for_ms": valid_for_ms,
            },
        ])

    return markets


def build_fow_market(
    *,
    wickets_total: int,
    weighted_rr: float,
    dot_pressure: float,
    wickets_cluster: bool,
    depth_factor: float,
    fancy_margin: Decimal,
    confidence: float,
    valid_for_ms: int,
    format_name: str = "t20",
    over_number: float = 10.0,
) -> list[dict[str, Any]]:
    """Build Fall of Wicket (FOW) market with dynamic wicket probability."""
    if wickets_total >= 9:
        return []  # No FOW market when 9+ wickets down
    
    # Dynamic wicket probability based on format and phase
    if format_name == "odi":
        if over_number <= 10:  # Powerplay
            base_wicket_prob_per_ball = 0.015  # ~1 wicket per 67 balls
        elif over_number <= 40:  # Middle overs
            base_wicket_prob_per_ball = 0.020  # ~1 wicket per 50 balls
        else:  # Death overs
            base_wicket_prob_per_ball = 0.035  # ~1 wicket per 29 balls
    else:  # T20
        if over_number <= 6:  # Powerplay
            base_wicket_prob_per_ball = 0.022  # ~1 wicket per 45 balls
        elif over_number <= 15:  # Middle overs
            base_wicket_prob_per_ball = 0.028  # ~1 wicket per 36 balls
        else:  # Death overs
            base_wicket_prob_per_ball = 0.045  # ~1 wicket per 22 balls
    
    # Adjust based on factors
    wicket_prob = base_wicket_prob_per_ball
    wicket_prob *= (1.0 + dot_pressure * 0.4)  # More dots = more pressure = more wickets
    wicket_prob *= (1.0 + (1.0 - depth_factor) * 0.3)  # Weaker batting = more wickets
    wicket_prob *= (1.5 if wickets_cluster else 1.0)  # Recent wickets = more likely
    wicket_prob = min(0.08, wicket_prob)  # Cap at 8% per ball
    
    # Offer 3 windows: 6, 12, 18 balls
    markets: list[dict[str, Any]] = []
    for balls in [6, 12, 18]:
        # Probability of at least 1 wicket in N balls
        prob_no_wicket = (1.0 - wicket_prob) ** balls
        yes_probability = clamp_fancy_probability(1.0 - prob_no_wicket)
        no_probability = clamp_fancy_probability(prob_no_wicket)
        yes_price, no_price = price_two_way_market(yes_probability, no_probability, fancy_margin)
        
        markets.extend([
            {
                "market_key": f"fancy_fow_{balls}balls",
                "selection_key": f"yes_{balls}",
                "label": f"Yes",
                "price": yes_price,
                "bet_type": "in_play",
                "market_family": "fancy_markets",
                "window_label": f"Wicket In Next {balls} Balls",
                "projected_line": f"{balls}b",
                "confidence_score": round(confidence * 0.85, 4),  # Lower confidence for wicket timing
                "valid_for_ms": min(valid_for_ms, balls * 150),  # ~150ms per ball
            },
            {
                "market_key": f"fancy_fow_{balls}balls",
                "selection_key": f"no_{balls}",
                "label": f"No",
                "price": no_price,
                "bet_type": "in_play",
                "market_family": "fancy_markets",
                "window_label": f"Wicket In Next {balls} Balls",
                "projected_line": f"{balls}b",
                "confidence_score": round(confidence * 0.85, 4),
                "valid_for_ms": min(valid_for_ms, balls * 150),
            },
        ])
    
    return markets


def build_fancy_markets(
    *,
    match_state: Any,
    memory_context: dict[str, Any],
    over_number: float,
    balls_remaining: int | None,
    confidence: float,
    margin: Decimal,
    engine_trace_id: str,
    runtime_config: Any | None = None,
    format_name: str = "t20",
) -> list[dict[str, Any]]:
    # Use fancy-specific margin if runtime_config provided
    if runtime_config is not None:
        from cricket.in_play_generator import margin_for_market
        fancy_margin = margin_for_market("fancy", runtime_config)
    else:
        fancy_margin = margin

    # ODI uses longer session windows; T20 uses default
    active_windows = (10, 20, 30, 50) if format_name == "odi" else FANCY_WINDOWS

    recent_events = list(memory_context.get("recent_events") or [])
    prior_projection = dict(memory_context.get("last_fancy_projection") or {})
    prior_fair_projection = dict(memory_context.get("last_fancy_fair_projection") or {})

    current_rr = parse_float(getattr(match_state, "current_run_rate", None))
    if current_rr is None:
        current_rr = infer_run_rate(match_state, over_number)

    boundary_rate = recent_boundary_rate(recent_events)
    dot_pressure = recent_dot_pressure(recent_events)
    wickets_cluster = recent_wickets_cluster(recent_events)
    phase_factor = innings_phase_factor(over_number, format_name)
    depth_factor = batting_depth_factor(match_state, format_name)
    wickets_total = int(getattr(match_state, "wickets_total", 0) or 0)

    weighted_rr = current_rr
    weighted_rr *= 1.0 + ((boundary_rate - 0.22) * 0.35)
    weighted_rr *= 1.0 - (dot_pressure * 0.20)
    weighted_rr *= phase_factor
    weighted_rr *= depth_factor
    if wickets_cluster:
        weighted_rr *= 0.88
    weighted_rr = blend_with_global_priors(
        weighted_rr=weighted_rr,
        memory_context=memory_context,
        format_name=format_name,
        over_number=over_number,
    )

    markets: list[dict[str, Any]] = []
    for overs in active_windows:
        if balls_remaining is not None and balls_remaining <= 0:
            break

        active_balls = overs * 6 if balls_remaining is None else min(overs * 6, balls_remaining)
        if active_balls < 6:
            continue

        expected_runs = weighted_rr * (active_balls / 6.0)
        window_label = runs_window_label(overs, active_balls)
        market_key = f"fancy_session_{overs}_overs"
        prior_fair_line = parse_float(prior_fair_projection.get(market_key))
        expected_runs = blend_prior_projection(expected_runs, prior_fair_line)
        fair_projected_line = round_half(expected_runs)
        trap_outcome = apply_fancy_bias(
            fair_line=fair_projected_line,
            overs_window=overs,
            recent_events=recent_events,
        )
        trap_projected_line = trap_outcome.displayed_line
        prior_trap_line = parse_float(prior_projection.get(market_key))
        projected_line = blend_trap_projection(trap_projected_line, prior_trap_line)
        fair_line_bias = max(-0.18, min(0.18, (expected_runs - fair_projected_line) / max(overs * 1.8, 1.0)))
        trap_line_delta = projected_line - fair_projected_line
        trap_probability_nudge = max(-0.06, min(0.06, (-trap_line_delta) / max(overs * 7.5, 1.0)))
        market_confidence = max(0.25, confidence - (overs * 0.01) - (0.05 if wickets_cluster else 0.0))
        spread = max(overs * 0.7, 3.5)
        step = fancy_ladder_step(overs)
        valid_for_ms = fancy_valid_for_ms(
            balls_remaining=balls_remaining,
            wickets_total=wickets_total,
            overs_window=overs,
            format_name=format_name,
        )

        trace_meta = {
            "engine_trace_id": engine_trace_id,
            "boundary_rate": round(boundary_rate, 4),
            "dot_pressure": round(dot_pressure, 4),
            "wickets_cluster": wickets_cluster,
            "weighted_run_rate": round(weighted_rr, 4),
            "expected_runs": round(expected_runs, 3),
            "overs_window": overs,
            "active_balls": active_balls,
            "effective_overs": round(active_balls / 6.0, 3),
            "fair_projected_line": f"{fair_projected_line:.1f}",
            "trap_projected_line": f"{projected_line:.1f}",
            "raw_trap_projected_line": f"{trap_projected_line:.1f}",
            "trap_line_delta": round(trap_line_delta, 3),
            "raw_trap_line_delta": round(trap_projected_line - fair_projected_line, 3),
            "fair_yes_probability": round(clamp_probability(0.5 + fair_line_bias), 4),
            "active_fancy_playbooks": trap_outcome.active_playbooks,
            "fancy_shading_summary": {
                **trap_outcome.summary,
                "displayed_line": round(projected_line, 3),
                "raw_trap_projected_line": round(trap_projected_line, 3),
                "continuity_adjusted_line": round(projected_line, 3),
            },
            "fancy_flags": trap_outcome.flags,
        }

        for offset in FANCY_LADDER_OFFSETS:
            ladder_line = round_half(projected_line + (offset * step))
            projection_key = fancy_projection_key(market_key, ladder_line)
            prior_line = parse_float(prior_projection.get(projection_key))
            if prior_line is not None:
                ladder_line = round_half((ladder_line * 0.78) + (prior_line * 0.22))
            yes_probability = clamp_fancy_probability(0.5 + ((expected_runs - ladder_line) / spread) + trap_probability_nudge)
            no_probability = clamp_fancy_probability(1.0 - yes_probability)
            yes_price, no_price = price_two_way_market(yes_probability, no_probability, fancy_margin)
            line_label = f"{ladder_line:.1f}"
            line_trace_meta = {
                **trace_meta,
                "ladder_line": line_label,
                "ladder_offset": offset,
                "ladder_step": step,
                "projection_key": projection_key,
                "trap_yes_probability": round(yes_probability, 4),
            }

            markets.extend(
                [
                    {
                        "market_key": market_key,
                        "selection_key": f"over_{line_label}",
                        "label": f"Over {line_label}",
                        "price": yes_price,
                        "bet_type": "in_play",
                        "market_family": "fancy_markets",
                        "window_label": window_label,
                        "projected_line": line_label,
                        "confidence_score": round(market_confidence, 4),
                        "valid_for_ms": valid_for_ms,
                        "trace_meta": line_trace_meta,
                    },
                    {
                        "market_key": market_key,
                        "selection_key": f"under_{line_label}",
                        "label": f"Under {line_label}",
                        "price": no_price,
                        "bet_type": "in_play",
                        "market_family": "fancy_markets",
                        "window_label": window_label,
                        "projected_line": line_label,
                        "confidence_score": round(market_confidence, 4),
                        "valid_for_ms": valid_for_ms,
                        "trace_meta": line_trace_meta,
                    },
                ]
            )

    # Add next-over runs market
    next_over_confidence = max(0.28, confidence - 0.08)
    next_over_valid_for_ms = max(650, min(900, fancy_valid_for_ms(
        balls_remaining=balls_remaining,
        wickets_total=wickets_total,
        overs_window=1,
    )))
    next_over_markets = build_next_over_market(
        weighted_rr=weighted_rr,
        fancy_margin=fancy_margin,
        confidence=next_over_confidence,
        valid_for_ms=next_over_valid_for_ms,
    )
    markets.extend(next_over_markets)

    # FOW (Fall of Wicket) markets
    format_name = getattr(match_state, "format", "t20").lower() if hasattr(match_state, "format") else "t20"
    fow_markets = build_fow_market(
        wickets_total=wickets_total,
        weighted_rr=weighted_rr,
        dot_pressure=dot_pressure,
        wickets_cluster=wickets_cluster,
        depth_factor=depth_factor,
        fancy_margin=fancy_margin,
        confidence=confidence,
        valid_for_ms=valid_for_ms,
        format_name=format_name,
        over_number=over_number,
    )
    markets.extend(fow_markets)

    return dedupe_fancy_markets(markets)


def blend_with_global_priors(
    *,
    weighted_rr: float,
    memory_context: dict[str, Any],
    format_name: str,
    over_number: float,
) -> float:
    pack = memory_context.get("pre_match_context_pack") if isinstance(memory_context, dict) else {}
    format_priors = (pack or {}).get("format_priors") if isinstance(pack, dict) else {}
    par_score = parse_float((format_priors or {}).get("par_score")) if isinstance(format_priors, dict) else None
    total_overs = parse_float((format_priors or {}).get("total_overs")) if isinstance(format_priors, dict) else None

    if par_score is None or par_score <= 0:
        global_priors = load_global_format_priors(format_name)
        global_avg = parse_float(global_priors.get("avg_first_innings_score"))
        global_samples = int(global_priors.get("sample_count") or 0)
        if global_avg is not None and global_samples >= 8:
            par_score = global_avg

    if total_overs is None or total_overs <= 0:
        total_overs = 50.0 if format_name == "odi" else 20.0

    if par_score is None or par_score <= 0:
        return max(weighted_rr, 0.5)

    prior_rr = par_score / max(total_overs, 1.0)
    innings_progress = min(max(over_number / max(total_overs, 1.0), 0.0), 1.0)
    prior_weight = max(0.0, min(0.26, (0.35 - innings_progress) * 0.55))
    blended = (weighted_rr * (1.0 - prior_weight)) + (prior_rr * prior_weight)
    return max(blended, 0.5)


def runs_window_label(requested_overs: int, active_balls: int) -> str:
    requested_balls = max(requested_overs, 1) * 6
    if active_balls >= requested_balls:
        return f"Runs In Next {requested_overs} Overs"

    effective_overs = max(1, int(math.ceil(active_balls / 6.0)))
    over_label = "Over" if effective_overs == 1 else "Overs"
    return f"Runs In Next {effective_overs} {over_label} ({active_balls} Balls Remaining)"


def dedupe_fancy_markets(markets: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    deduped: list[dict[str, Any]] = []

    for market in markets:
        identity = "||".join(
            [
                str(market.get("market_key") or ""),
                str(market.get("selection_key") or market.get("label") or ""),
                str(market.get("window_label") or ""),
                str(market.get("projected_line") or ""),
            ]
        )
        if identity in seen:
            continue
        seen.add(identity)
        deduped.append(market)

    return deduped


def recent_boundary_rate(recent_events: list[dict[str, Any]]) -> float:
    last = recent_events[-12:]
    if not last:
        return 0.22
    boundaries = sum(1 for event in last if event.get("event_type") in {"four", "six", "boundary"})
    return boundaries / len(last)


def recent_dot_pressure(recent_events: list[dict[str, Any]]) -> float:
    last = recent_events[-12:]
    if not last:
        return 0.25
    dots = sum(1 for event in last if event.get("event_type") in {"dot", "dot_ball"})
    return dots / len(last)


def recent_wickets_cluster(recent_events: list[dict[str, Any]]) -> bool:
    last = recent_events[-6:]
    return sum(1 for event in last if event.get("event_type") == "wicket") >= 2


def batting_depth_factor(match_state: Any, format_name: str = "t20") -> float:
    wickets_total = int(getattr(match_state, "wickets_total", 0) or 0)
    if format_name == "odi":
        # ODI: deeper batting order, higher floor (0.78), gentler slope
        return max(0.78, 1.0 - (wickets_total * 0.028))
    # T20 (default): steeper drop-off, lower floor
    return max(0.72, 1.0 - (wickets_total * 0.035))


def innings_phase_factor(over_number: float, format_name: str = "t20") -> float:
    if format_name == "odi":
        if over_number < 10.0:   # ODI powerplay
            return 1.04
        if over_number < 40.0:   # ODI middle overs
            return 1.0
        return 1.06              # ODI death (40-50)
    # T20 (default)
    if over_number < 6.0:
        return 1.03
    if over_number < 15.0:
        return 1.0
    return 1.08


def infer_run_rate(match_state: Any, over_number: float) -> float:
    runs_total = float(getattr(match_state, "runs_total", 0) or 0)
    return 7.4 if over_number <= 0 else runs_total / max(over_number, 0.1)


def blend_prior_projection(expected_runs: float, prior_line: float | None) -> float:
    if prior_line is None:
        return expected_runs
    return (expected_runs * 0.72) + (prior_line * 0.28)


def blend_trap_projection(projected_line: float, prior_line: float | None) -> float:
    if prior_line is None:
        return projected_line
    return round_half((projected_line * 0.74) + (prior_line * 0.26))


def round_half(value: float) -> float:
    return float((Decimal(str(value)) * 2).quantize(Decimal("1"), rounding=ROUND_HALF_UP) / 2)


def fancy_ladder_step(overs: int) -> float:
    if overs >= 20:
        return 4.0
    if overs >= 10:
        return 3.0
    return 2.0


def clamp_fancy_probability(value: float) -> float:
    return max(FANCY_PROBABILITY_FLOOR, min(FANCY_PROBABILITY_CEILING, clamp_probability(value)))


def fancy_projection_key(market_key: str, projected_line: float) -> str:
    return f"{market_key}::{projected_line:.1f}"


def fancy_valid_for_ms(*, balls_remaining: int | None, wickets_total: int, overs_window: int, format_name: str = "t20") -> int:
    """Calculate fancy market validity with tighter control for death overs."""
    policy = get_engine_policy()
    
    # ODI: prices move slower, longer validity windows
    if format_name == "odi":
        if balls_remaining is None:
            return max(3000, int(4000 * policy.fancy_expiry_multiplier))
        if balls_remaining <= 12:   # Last 2 overs
            return max(1200, int(1800 * policy.fancy_expiry_multiplier))
        if wickets_total >= 8 or balls_remaining <= 30:
            return max(1800, int(2500 * policy.fancy_expiry_multiplier))
        return max(2500, int(3500 * policy.fancy_expiry_multiplier))
    
    # T20 (existing logic unchanged)
    if balls_remaining is None:
        return max(1200, int(1800 * policy.fancy_expiry_multiplier))
    if balls_remaining <= 12:
        return max(650, int(850 * policy.fancy_expiry_multiplier))
    if wickets_total >= 8 or balls_remaining <= 24:
        return max(800, int((1100 if overs_window <= 10 else 1300) * policy.fancy_expiry_multiplier))
    if balls_remaining <= 36:
        return max(950, int((1300 if overs_window <= 10 else 1500) * policy.fancy_expiry_multiplier))
    return max(1100, int((1500 if overs_window <= 10 else 1800) * policy.fancy_expiry_multiplier))
