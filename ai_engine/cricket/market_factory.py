from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from cricket.global_training_cache import load_global_format_priors
from cricket.policy import get_engine_policy
from cricket.risk_limits import DEFAULT_LIMITS, clamp_probability, parse_float

TOTAL_LADDER_OFFSETS = (-2, -1, 0, 1, 2)
LADDER_PROBABILITY_FLOOR = 0.09
LADDER_PROBABILITY_CEILING = 0.91


def build_candidate_markets(
    *,
    match_state: Any,
    team1_name: str,
    team2_name: str,
    batting_side: str,
    over_number: float,
    balls_remaining: int | None,
    probability_team1: float,
    confidence: float,
    margin: Decimal,
    liability_book: dict[str, Any] | None = None,
    runtime_config: Any | None = None,
    format_name: str = "t20",
    memory_context: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    # Compute per-market margins if runtime_config provided
    if runtime_config is not None:
        from cricket.in_play_generator import margin_for_market
        margin_match_winner = margin_for_market("match_winner", runtime_config)
        margin_over_under = margin_for_market("over_under", runtime_config)
        margin_ladder = margin_for_market("over_under_ladder", runtime_config)
        margin_in_play = margin_for_market("in_play", runtime_config)
    else:
        # Fallback to single margin for all markets
        margin_match_winner = margin
        margin_over_under = margin
        margin_ladder = margin
        margin_in_play = margin

    match_winner_valid_for_ms = live_valid_for_ms(
        market_type="match_winner",
        balls_remaining=balls_remaining,
        wickets_total=int(getattr(match_state, "wickets_total", 0) or 0),
    )
    totals_valid_for_ms = live_valid_for_ms(
        market_type="totals",
        balls_remaining=balls_remaining,
        wickets_total=int(getattr(match_state, "wickets_total", 0) or 0),
    )
    in_play_valid_for_ms = live_valid_for_ms(
        market_type="in_play",
        balls_remaining=balls_remaining,
        wickets_total=int(getattr(match_state, "wickets_total", 0) or 0),
    )
    match_winner_prices = match_winner_market(
        team1_name=team1_name,
        team2_name=team2_name,
        probability_team1=probability_team1,
        confidence=confidence,
        margin=margin_match_winner,
        valid_for_ms=match_winner_valid_for_ms,
    )
    over_under_prices = over_under_market(
        match_state=match_state,
        confidence=max(0.35, confidence - 0.05),
        over_number=over_number,
        balls_remaining=balls_remaining,
        margin=margin_over_under,
        valid_for_ms=totals_valid_for_ms,
        memory_context=memory_context,
    )
    over_under_ladder_prices = over_under_ladder_market(
        match_state=match_state,
        confidence=max(0.32, confidence - 0.06),
        over_number=over_number,
        balls_remaining=balls_remaining,
        margin=margin_ladder,
        valid_for_ms=max(1200, totals_valid_for_ms - 200),
        format_name=format_name,
        memory_context=memory_context,
    )
    in_play_prices = in_play_special_market(
        match_state=match_state,
        batting_side=batting_side,
        confidence=max(0.3, confidence - 0.1),
        margin=margin_in_play,
        valid_for_ms=in_play_valid_for_ms,
        liability_book=liability_book,
    )
    return [*match_winner_prices, *over_under_prices, *over_under_ladder_prices, *in_play_prices]


def match_winner_market(
    *,
    team1_name: str,
    team2_name: str,
    probability_team1: float,
    confidence: float,
    margin: Decimal,
    valid_for_ms: int,
) -> list[dict[str, Any]]:
    probability_team2 = clamp_probability(1.0 - probability_team1)
    odds_team1, odds_team2 = price_two_way_market(probability_team1, probability_team2, margin)
    return [
        {
            "market_key": "match_winner",
            "selection_key": "team1",
            "label": team1_name,
            "price": odds_team1,
            "bet_type": "match_winner",
            "confidence_score": round(confidence, 4),
            "valid_for_ms": valid_for_ms,
        },
        {
            "market_key": "match_winner",
            "selection_key": "team2",
            "label": team2_name,
            "price": odds_team2,
            "bet_type": "match_winner",
            "confidence_score": round(confidence, 4),
            "valid_for_ms": valid_for_ms,
        },
    ]


def over_under_market(
    *,
    match_state: Any,
    confidence: float,
    over_number: float,
    balls_remaining: int | None,
    margin: Decimal,
    valid_for_ms: int,
    memory_context: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    projected_total = project_final_total(match_state, over_number, balls_remaining)
    protected_total, protection_runs, spread, adjusted_margin = totals_pricing_inputs(
        match_state=match_state,
        projected_total=projected_total,
        over_number=over_number,
        balls_remaining=balls_remaining,
        margin=margin,
        memory_context=memory_context,
    )

    line = (
        Decimal(protected_total).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
        + Decimal("0.5")
    )
    over_probability = clamp_probability(0.5 + ((protected_total - float(line)) / spread))
    under_probability = clamp_probability(1.0 - over_probability)
    over_price, under_price = price_two_way_market(over_probability, under_probability, adjusted_margin)
    return [
        {
            "market_key": "over_under",
            "selection_key": "over",
            "label": f"Over {line}",
            "price": over_price,
            "bet_type": "over_under",
            "confidence_score": round(confidence, 4),
            "valid_for_ms": valid_for_ms,
            "trace_meta": {
                "protection_runs": round(protection_runs, 3),
                "spread": round(spread, 3),
                "margin": format(adjusted_margin, "f"),
            },
        },
        {
            "market_key": "over_under",
            "selection_key": "under",
            "label": f"Under {line}",
            "price": under_price,
            "bet_type": "over_under",
            "confidence_score": round(confidence, 4),
            "valid_for_ms": valid_for_ms,
            "trace_meta": {
                "protection_runs": round(protection_runs, 3),
                "spread": round(spread, 3),
                "margin": format(adjusted_margin, "f"),
            },
        },
    ]


def over_under_ladder_market(
    *,
    match_state: Any,
    confidence: float,
    over_number: float,
    balls_remaining: int | None,
    margin: Decimal,
    valid_for_ms: int,
    format_name: str = "t20",
    memory_context: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    projected_total = project_final_total(match_state, over_number, balls_remaining)
    protected_total, protection_runs, spread, adjusted_margin = totals_pricing_inputs(
        match_state=match_state,
        projected_total=projected_total,
        over_number=over_number,
        balls_remaining=balls_remaining,
        margin=margin,
        memory_context=memory_context,
    )
    base_line = Decimal(protected_total).quantize(Decimal("1"), rounding=ROUND_HALF_UP) + Decimal("0.5")
    # ODI totals are 250-320 so use 10-run steps; T20 uses 2-4 run steps
    step = 10.0 if format_name == "odi" else total_ladder_step(projected_total)
    spread = max(step * 1.45, spread)

    markets: list[dict[str, Any]] = []
    for offset in TOTAL_LADDER_OFFSETS:
        line_value = float(base_line) + (offset * step)
        line = Decimal(str(line_value)).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)
        over_probability = clamp_ladder_probability(0.5 + ((protected_total - float(line)) / spread))
        under_probability = clamp_ladder_probability(1.0 - over_probability)
        over_price, under_price = price_two_way_market(over_probability, under_probability, adjusted_margin)
        line_label = format(line, "f")

        markets.extend(
            [
                {
                    "market_key": "over_under_ladder",
                    "selection_key": f"over_{line_label}",
                    "label": f"Over {line_label}",
                    "price": over_price,
                    "bet_type": "over_under",
                    "market_family": "totals_ladder",
                    "window_label": "Projected Total Ladder",
                    "projected_line": line_label,
                    "confidence_score": round(confidence, 4),
                    "valid_for_ms": valid_for_ms,
                    "trace_meta": {
                        "protection_runs": round(protection_runs, 3),
                        "spread": round(spread, 3),
                        "margin": format(adjusted_margin, "f"),
                    },
                },
                {
                    "market_key": "over_under_ladder",
                    "selection_key": f"under_{line_label}",
                    "label": f"Under {line_label}",
                    "price": under_price,
                    "bet_type": "over_under",
                    "market_family": "totals_ladder",
                    "window_label": "Projected Total Ladder",
                    "projected_line": line_label,
                    "confidence_score": round(confidence, 4),
                    "valid_for_ms": valid_for_ms,
                    "trace_meta": {
                        "protection_runs": round(protection_runs, 3),
                        "spread": round(spread, 3),
                        "margin": format(adjusted_margin, "f"),
                    },
                },
            ]
        )

    return markets


def in_play_special_market(
    *,
    match_state: Any,
    batting_side: str,
    confidence: float,
    margin: Decimal,
    valid_for_ms: int,
    liability_book: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    current_rr = parse_float(getattr(match_state, "current_run_rate", None)) or 0.0
    momentum = parse_float(getattr(match_state, "momentum_index", None)) or 0.0
    wickets_total = int(getattr(match_state, "wickets_total", 0) or 0)
    required_rr = parse_float(getattr(match_state, "required_run_rate", None)) or 0.0
    pressure_gap = max(required_rr - current_rr, 0.0)

    boundary_base = 0.46 + ((current_rr - 7.0) * 0.018) + (momentum * 0.012)
    if batting_side == "unknown":
        boundary_base -= 0.02
    if wickets_total >= 7:
        boundary_base -= 0.05

    wicket_base = 0.19 + (pressure_gap * 0.018) + (wickets_total * 0.018)
    if batting_side == "unknown":
        wicket_base -= 0.02

    over_run_base = 0.44 + ((current_rr - 8.0) * 0.022) + (momentum * 0.01)
    if required_rr >= 10.0:
        over_run_base += 0.04
    if wickets_total >= 8:
        over_run_base -= 0.06

    boundary_nudge = market_liquidity_nudge(liability_book, "next_boundary", "yes")
    wicket_nudge = market_liquidity_nudge(liability_book, "next_over_wicket", "yes")
    over_run_nudge = market_liquidity_nudge(liability_book, "next_over_runs_10_plus", "yes")

    return [
        *two_way_special_market(
            market_key="next_boundary",
            yes_label="Boundary In Next Over - Yes",
            no_label="Boundary In Next Over - No",
            yes_probability=boundary_base + boundary_nudge,
            confidence=confidence,
            margin=margin,
            valid_for_ms=max(800, valid_for_ms - 150),
            trace_meta={
                "liquidity_sensitive": True,
                "liquidity_nudge": round(boundary_nudge, 4),
            },
        ),
        *two_way_special_market(
            market_key="next_over_wicket",
            yes_label="Wicket In Next Over - Yes",
            no_label="Wicket In Next Over - No",
            yes_probability=wicket_base + wicket_nudge,
            confidence=max(0.28, confidence - 0.05),
            margin=margin,
            valid_for_ms=max(850, valid_for_ms - 100),
            trace_meta={
                "liquidity_sensitive": True,
                "liquidity_nudge": round(wicket_nudge, 4),
            },
        ),
        *two_way_special_market(
            market_key="next_over_runs_10_plus",
            yes_label="10+ Runs In Next Over - Yes",
            no_label="10+ Runs In Next Over - No",
            yes_probability=over_run_base + over_run_nudge,
            confidence=max(0.3, confidence - 0.03),
            margin=margin,
            valid_for_ms=max(850, valid_for_ms - 50),
            trace_meta={
                "liquidity_sensitive": True,
                "liquidity_nudge": round(over_run_nudge, 4),
            },
        ),
    ]


def project_final_total(match_state: Any, over_number: float, balls_remaining: int | None) -> float:
    current_total = float(getattr(match_state, "runs_total", 0))
    current_rr = parse_float(getattr(match_state, "current_run_rate", None))
    if current_rr is None:
        current_rr = 7.8 if over_number <= 0 else current_total / max(over_number, 0.1)

    wickets_total = int(getattr(match_state, "wickets_total", 0) or 0)
    wickets_factor = max(0.55, 1.0 - (wickets_total * 0.05))
    momentum_factor = 1.0 + ((parse_float(getattr(match_state, "momentum_index", None)) or 0.0) * 0.015)
    projected_rr = max(4.5, current_rr * wickets_factor * momentum_factor)

    if balls_remaining is None:
        total_overs = inferred_total_overs(match_state)
        balls_remaining = max((total_overs * 6) - overs_to_balls(over_number), 0)

    projected_runs = projected_rr * (balls_remaining / 6.0)
    projection = current_total + projected_runs

    target_runs = parse_float(getattr(match_state, "target_runs", None))
    if target_runs is not None and target_runs > 0:
        # Chasing innings usually terminates close to target; cap runaway projections.
        cap_pad = 6.0 if balls_remaining and balls_remaining <= 30 else 10.0
        projection = min(projection, target_runs + cap_pad)

    return projection


def inferred_total_overs(match_state: Any) -> int:
    format_name = str(
        getattr(match_state, "format", None)
        or getattr(match_state, "match_type", None)
        or ""
    ).strip().lower()
    if format_name in {"odi", "one day", "one day international", "list a"}:
        return 50
    if format_name in {"test", "first class"}:
        return 90

    overs_limit = parse_float(getattr(match_state, "total_overs", None))
    if overs_limit is None:
        overs_limit = parse_float(getattr(match_state, "overs_limit", None))
    if overs_limit is not None and overs_limit >= 5:
        return int(overs_limit)

    return 20


def price_two_way_market(prob_a: float, prob_b: float, margin: Decimal) -> tuple[str, str]:
    """Price a two-way market with proper overround margin.
    
    The margin is applied proportionally to maintain exact overround.
    For fair probs (0.7, 0.3) with 4% margin:
    - Normalize: (0.7, 0.3)
    - Apply margin: 0.7 * 1.04 = 0.728, 0.3 * 1.04 = 0.312
    - Overround: 0.728 + 0.312 = 1.04 ✓
    """
    prob_a = clamp_probability(prob_a)
    prob_b = clamp_probability(prob_b)
    
    # Normalize to sum to 1.0
    total = prob_a + prob_b
    if total > 0:
        prob_a /= total
        prob_b /= total
    
    # Apply margin proportionally to achieve exact overround
    margin_multiplier = 1.0 + float(margin)
    vig_adjusted_a = min(prob_a * margin_multiplier, 0.985)
    vig_adjusted_b = min(prob_b * margin_multiplier, 0.985)
    
    # Verify overround (for monitoring)
    actual_overround = vig_adjusted_a + vig_adjusted_b
    
    return decimal_from_probability(vig_adjusted_a), decimal_from_probability(vig_adjusted_b)


def decimal_from_probability(probability: float) -> str:
    probability = clamp_probability(probability)
    decimal_odds = Decimal("1") / Decimal(str(probability))
    decimal_odds = decimal_odds.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    if decimal_odds < Decimal("1.01"):
        decimal_odds = Decimal("1.01")
    if decimal_odds > DEFAULT_LIMITS.hard_decimal_ceiling:
        decimal_odds = DEFAULT_LIMITS.hard_decimal_ceiling
    return format(decimal_odds, "f")


def overs_to_balls(over_number: float) -> int:
    whole = int(over_number)
    fractional = int(round((over_number - whole) * 10))
    fractional = max(0, min(5, fractional))
    return whole * 6 + fractional


def total_ladder_step(projected_total: float) -> float:
    if projected_total >= 200:
        return 4.0
    if projected_total >= 170:
        return 3.0
    return 2.0


def totals_pricing_inputs(
    *,
    match_state: Any,
    projected_total: float,
    over_number: float,
    balls_remaining: int | None,
    margin: Decimal,
    memory_context: dict[str, Any] | None,
) -> tuple[float, float, float, Decimal]:
    format_name = str(
        getattr(match_state, "format", None)
        or getattr(match_state, "match_type", None)
        or "t20"
    ).strip().lower()
    total_overs = inferred_total_overs(match_state)
    progress = min(max((over_number / max(total_overs, 1)), 0.0), 1.0)
    wickets_total = int(getattr(match_state, "wickets_total", 0) or 0)
    current_rr = parse_float(getattr(match_state, "current_run_rate", None)) or 0.0
    required_rr = parse_float(getattr(match_state, "required_run_rate", None)) or 0.0
    pressure_gap = max(required_rr - current_rr, 0.0)

    context = memory_context or {}
    pack = context.get("pre_match_context_pack") if isinstance(context, dict) else {}
    priors = (pack or {}).get("format_priors") if isinstance(pack, dict) else {}
    par_score = parse_float((priors or {}).get("par_score")) if isinstance(priors, dict) else None

    global_priors = load_global_format_priors(format_name)
    global_samples = int(global_priors.get("sample_count") or 0)
    global_avg_par = parse_float(global_priors.get("avg_first_innings_score"))
    if global_avg_par is not None and global_samples >= 8:
        # Bounded blend into static priors so opening overs start from learned reality.
        blend_weight = min(0.35, 0.08 + (global_samples / 220.0))
        if par_score is None or par_score <= 0:
            par_score = global_avg_par
        else:
            par_score = (par_score * (1.0 - blend_weight)) + (global_avg_par * blend_weight)

    par_rr = (par_score / max(total_overs, 1)) if par_score is not None else 8.0
    environment_delta = max(current_rr - par_rr, 0.0)

    recent_events = list((context.get("recent_events") or []))[-10:] if isinstance(context, dict) else []
    boundary_count = sum(
        1
        for event in recent_events
        if str((event or {}).get("event_type", "")).lower() in {"four", "six", "boundary"}
    )
    wicket_count = sum(
        1
        for event in recent_events
        if str((event or {}).get("event_type", "")).lower() == "wicket"
    )
    volatility = (boundary_count + wicket_count) / max(len(recent_events), 1) if recent_events else 0.0

    protection_runs = min(
        22.0,
        (pressure_gap * 1.35)
        + (wickets_total * 0.85)
        + (environment_delta * 2.1)
        + (volatility * 7.0)
        + (2.0 if over_number <= 4.0 else 0.0),
    )

    protected_total = projected_total + protection_runs

    if par_score is not None and par_score > 0 and progress < 0.5:
        # Early innings: blend toward prior to avoid very soft totals from tiny samples.
        prior_weight = (0.5 - progress) * 0.28
        protected_total = (protected_total * (1.0 - prior_weight)) + (par_score * prior_weight)

    if balls_remaining is not None and balls_remaining <= 18:
        protection_runs = protection_runs + 1.5
        protected_total = protected_total + 1.5

    spread = max(8.0, 14.0 - min(over_number, 15.0) * 0.28 + (volatility * 2.2))
    margin_bump = min(0.045, 0.012 + (pressure_gap * 0.0035) + (volatility * 0.015))
    adjusted_margin = margin + Decimal(str(round(margin_bump, 4)))

    return protected_total, protection_runs, spread, adjusted_margin


def clamp_ladder_probability(value: float) -> float:
    return max(LADDER_PROBABILITY_FLOOR, min(LADDER_PROBABILITY_CEILING, clamp_probability(value)))


def two_way_special_market(
    *,
    market_key: str,
    yes_label: str,
    no_label: str,
    yes_probability: float,
    confidence: float,
    margin: Decimal,
    valid_for_ms: int,
    trace_meta: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    yes_probability = clamp_ladder_probability(yes_probability)
    no_probability = clamp_ladder_probability(1.0 - yes_probability)
    yes_price, no_price = price_two_way_market(yes_probability, no_probability, margin)
    return [
        {
            "market_key": market_key,
            "selection_key": "yes",
            "label": yes_label,
            "price": yes_price,
            "bet_type": "in_play",
            "confidence_score": round(confidence, 4),
            "valid_for_ms": valid_for_ms,
            "trace_meta": trace_meta or {},
        },
        {
            "market_key": market_key,
            "selection_key": "no",
            "label": no_label,
            "price": no_price,
            "bet_type": "in_play",
            "confidence_score": round(confidence, 4),
            "valid_for_ms": valid_for_ms,
            "trace_meta": trace_meta or {},
        },
    ]


def market_liquidity_nudge(
    liability_book: dict[str, Any] | None,
    market_key: str,
    selection_key: str,
) -> float:
    if not liability_book:
        return 0.0

    selections = (((liability_book.get("markets") or {}).get(market_key) or {}).get("selections") or {})
    if not isinstance(selections, dict) or not selections:
        return 0.0

    shares: dict[str, float] = {}
    total_potential = 0.0
    for key, summary in selections.items():
        potential = parse_float((summary or {}).get("potential_payout")) or 0.0
        if potential <= 0.0:
            continue
        shares[str(key)] = potential
        total_potential += potential

    if total_potential <= 0.0:
        return 0.0

    normalized = {key: value / total_potential for key, value in shares.items()}
    selection_share = normalized.get(selection_key, 0.0)
    opposite_key = "no" if selection_key == "yes" else "yes"
    opposite_share = normalized.get(opposite_key, max(0.0, 1.0 - selection_share))
    imbalance = selection_share - opposite_share

    if abs(imbalance) < 0.08:
        return 0.0

    return max(-0.025, min(0.025, imbalance * 0.05))


def live_valid_for_ms(*, market_type: str, balls_remaining: int | None, wickets_total: int) -> int:
    """Calculate validity window with stability guards for UI/transport jitter."""
    policy = get_engine_policy()
    if balls_remaining is None:
        return max(3500, int(6000 * policy.live_expiry_multiplier))

    if market_type == "in_play":
        if balls_remaining <= 12:  # Last 2 overs
            return max(2200, int(3200 * policy.live_expiry_multiplier))
        if balls_remaining <= 24:  # Overs 16-18
            return max(2500, int(3800 * policy.live_expiry_multiplier))
        if balls_remaining <= 36:  # Overs 14-16
            return max(2800, int(4300 * policy.live_expiry_multiplier))
        return max(3200, int(5000 * policy.live_expiry_multiplier))

    if market_type == "totals":
        if balls_remaining <= 12:  # Last 2 overs
            return max(2500, int(3600 * policy.live_expiry_multiplier))
        if wickets_total >= 8 or balls_remaining <= 24:  # High pressure
            return max(3000, int(4300 * policy.live_expiry_multiplier))
        if balls_remaining <= 36:  # Overs 14-16
            return max(3400, int(5000 * policy.live_expiry_multiplier))
        return max(3900, int(6200 * policy.live_expiry_multiplier))

    # match_winner
    if balls_remaining <= 12:  # Last 2 overs
        return max(2300, int(3300 * policy.live_expiry_multiplier))
    if wickets_total >= 8 or balls_remaining <= 24:  # High pressure
        return max(2800, int(4000 * policy.live_expiry_multiplier))
    if balls_remaining <= 36:  # Overs 14-16
        return max(3200, int(4700 * policy.live_expiry_multiplier))
    return max(3700, int(5800 * policy.live_expiry_multiplier))
