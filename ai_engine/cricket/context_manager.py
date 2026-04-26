from __future__ import annotations

import math
from typing import Any, Literal

from cricket.boundary_necessity import calculate_boundary_pressure
from cricket.policy import get_engine_policy
from cricket.pre_match_cache import ensure_match_dossier
from cricket.risk_limits import clamp_probability, parse_float


DEFAULT_TOTAL_OVERS = 20
ACTIVE_LIVE_PROBABILITY_FLOOR = 0.09
ACTIVE_LIVE_PROBABILITY_CEILING = 0.91

_FORMAT_TOTAL_OVERS: dict[str, int] = {"t20": 20, "odi": 50, "test": 90}
_FORMAT_PAR_SCORE: dict[str, float] = {"t20": 165.0, "odi": 285.0, "test": 350.0}


def format_total_overs(dossier: dict) -> int:
    return _FORMAT_TOTAL_OVERS.get(str(dossier.get("format") or "").lower(), DEFAULT_TOTAL_OVERS)


def format_par_score(dossier: dict) -> float:
    return _FORMAT_PAR_SCORE.get(str(dossier.get("format") or "").lower(), 165.0)


def context_manager_node(state: dict[str, Any], *, memory_store: Any, runtime_config_resolver: Any) -> dict[str, Any]:
    request = state["request"]
    match_state = request.match_state
    memory_context = state.get("memory_context") or memory_store.load(request.match_id)
    
    # Edge case detection (tie, super over, DLS)
    edge_case_result = detect_edge_cases(match_state)
    if edge_case_result["should_suspend"]:
        return {
            **state,
            "edge_case_suspension": True,
            "edge_case_reason": edge_case_result["reason"],
            "edge_case_type": edge_case_result["type"],
            "context_probability_team1": 0.50,  # Default to 50/50 for edge cases
        }
    
    # Critical data validation - suspend if missing
    critical_data_check = validate_critical_data(match_state)
    if not critical_data_check["is_valid"]:
        return {
            **state,
            "critical_data_missing": True,
            "missing_data_reason": critical_data_check["reason"],
            "missing_fields": critical_data_check["missing_fields"],
            "context_probability_team1": 0.50,
        }
    
    dossier = ensure_match_dossier(
        match_id=request.match_id,
        match_state=match_state,
        state_version=request.state_version,
        event_seq=request.event_seq,
        memory_store=memory_store,
        memory_context=memory_context,
    )
    memory_context = {**memory_context, "match_dossier": dossier}

    team1_name = match_state.team1 or "Team 1"
    team2_name = match_state.team2 or "Team 2"
    batting_side = infer_batting_side(match_state.batting_team, team1_name, team2_name)
    over_number = parse_float(match_state.over) or 0.0
    balls_bowled = overs_to_balls(over_number)
    total_overs = format_total_overs(dossier)
    balls_remaining = max(total_overs * 6 - balls_bowled, 0)
    required_run_rate = parse_float(match_state.required_run_rate) or 0.0
    batsman_strike_rates = extract_current_batsman_strike_rates(match_state.raw_data, match_state.batting_team)
    boundary_pressure = calculate_boundary_pressure(
        runs_required=remaining_runs_required(match_state),
        balls_remaining=balls_remaining,
        wickets_fallen=getattr(match_state, "wickets_total", 0),
        batsman_strike_rates=batsman_strike_rates,
        required_run_rate=required_run_rate,
        inning=getattr(match_state, "inning", 0),
    )

    base_probability = implied_probability_from_odds(request.current_odds, team1_name, team2_name)
    if base_probability is None:
        base_probability = heuristic_base_probability(match_state, batting_side, balls_remaining, dossier)

    prior_probability = safe_probability(memory_context.get("prior_probability_team1"))
    
    # Use pre-match seed if available and no prior probability exists
    if prior_probability is None and request.pre_match_seed is not None:
        seed_probability = request.pre_match_seed.team1_win_probability
        seed_confidence = request.pre_match_seed.confidence
        base_probability = clamp_probability((base_probability * (1.0 - seed_confidence)) + (seed_probability * seed_confidence))
    elif prior_probability is not None:
        base_probability = clamp_probability((base_probability * 0.78) + (prior_probability * 0.22))

    toss_delta = toss_probability_delta(dossier, match_state, batting_side)
    event_impact = event_impact_score(
        request.trigger.event_type,
        request.trigger.severity,
        match_state,
        batting_side,
        dossier,
    )
    event_impact += recent_history_adjustment(memory_context, batting_side)
    momentum = parse_float(match_state.momentum_index) or 0.0
    momentum_delta = team1_delta_from_batting_metric(momentum * 0.012, batting_side)
    rr_delta = run_rate_pressure(match_state, batting_side)
    current_published_probability = implied_probability_from_odds(request.current_odds, team1_name, team2_name)

    context_probability = clamp_probability(base_probability + toss_delta + event_impact + momentum_delta + rr_delta)
    if live_match_still_contested(match_state, balls_remaining):
        context_probability = clamp_active_live_probability(context_probability)
    history_summary = summarize_history(memory_context)
    dossier_summary = summarize_dossier(dossier)
    context_quality = assess_context_quality(
        match_state=match_state,
        batting_side=batting_side,
        balls_remaining=balls_remaining,
        current_odds=request.current_odds,
    )

    return {
        **state,
        "thread_id": request.match_id,
        "team1_name": team1_name,
        "team2_name": team2_name,
        "batting_side": batting_side,
        "over_number": over_number,
        "balls_bowled": balls_bowled,
        "balls_remaining": balls_remaining,
        "required_run_rate_value": required_run_rate,
        "batsman_strike_rates": batsman_strike_rates,
        "boundary_pressure_summary": boundary_pressure.summary,
        "boundary_pressure_flags": boundary_pressure.flags,
        "desperate_chase": boundary_pressure.desperate_chase,
        "volatility_mode_active": boundary_pressure.aggressive_mode,
        "base_probability_team1": base_probability,
        "context_probability_team1": context_probability,
        "event_impact": event_impact,
        "memory_context": memory_context,
        "history_summary": history_summary,
        "prior_probability_team1": prior_probability,
        "context_quality_penalty": context_quality["confidence_penalty"],
        "context_quality_flags": context_quality["flags"],
        "generator_attempt": 0,
        "reviewer_decision": "pending",
        "reviewer_feedback": None,
        "reviewer_flags": [],
        "approved": False,
        "safe_fallback_required": False,
        "jump_threshold": runtime_config_resolver(request).max_price_jump_threshold,
        "current_published_probability_team1": current_published_probability,
        "correction_low": None,
        "correction_high": None,
        "approved_markets": [],
        "fancy_markets": [],
        "fancy_flags": [],
        "fancy_suspension_reason": None,
        "exposure_summary": {},
        "exposure_flags": [],
        "exposure_low": None,
        "exposure_high": None,
        "reasoning": (
            f"event={request.trigger.event_type} severity={request.trigger.severity} "
            f"batting_side={batting_side} runs={match_state.runs_total}/{match_state.wickets_total} "
            f"over={match_state.over or '0.0'} impact={event_impact:.4f} toss_delta={toss_delta:.4f} "
            f"history={history_summary} dossier={dossier_summary} "
            f"boundary_density={boundary_pressure.summary.get('boundary_density', 0.0):.4f} "
            f"desperate={boundary_pressure.desperate_chase} "
            f"context_flags={','.join(context_quality['flags']) if context_quality['flags'] else 'complete'}"
        ),
    }


def assess_context_quality(
    *,
    match_state: Any,
    batting_side: str,
    balls_remaining: int | None,
    current_odds: list[Any],
) -> dict[str, Any]:
    policy = get_engine_policy()
    flags: list[str] = []
    confidence_penalty = 0.0

    if batting_side == "unknown":
        flags.append("unknown_batting_side")
        confidence_penalty += policy.context_penalty_unknown_batting_side

    over_number = parse_float(getattr(match_state, "over", None))
    if over_number is None or over_number < 0:
        flags.append("missing_over_context")
        confidence_penalty += policy.context_penalty_missing_over

    current_rr = parse_float(getattr(match_state, "current_run_rate", None))
    if current_rr is None:
        flags.append("missing_current_run_rate")
        confidence_penalty += policy.context_penalty_missing_current_rr

    if getattr(match_state, "target_runs", None) is not None:
        required_rr = parse_float(getattr(match_state, "required_run_rate", None))
        if required_rr is None:
            flags.append("missing_required_run_rate")
            confidence_penalty += policy.context_penalty_missing_required_rr

    winner_rows = [row for row in current_odds if getattr(row, "market_key", None) == "match_winner"]
    if len(winner_rows) < 2:
        flags.append("missing_live_winner_anchor")
        confidence_penalty += policy.context_penalty_missing_winner_anchor

    if balls_remaining is not None and balls_remaining <= 0:
        flags.append("innings_complete")
        confidence_penalty += policy.context_penalty_innings_complete

    return {
        "flags": flags,
        "confidence_penalty": min(confidence_penalty, policy.context_penalty_cap),
    }


def implied_probability_from_odds(current_odds: list[Any], team1_name: str, team2_name: str) -> float | None:
    winner_rows = [row for row in current_odds if getattr(row, "market_key", None) == "match_winner"]
    if len(winner_rows) < 2:
        return None

    team1_row = next((row for row in winner_rows if getattr(row, "selection_key", None) == "team1" or getattr(row, "label", None) == team1_name), None)
    team2_row = next((row for row in winner_rows if getattr(row, "selection_key", None) == "team2" or getattr(row, "label", None) == team2_name), None)
    if team1_row is None or team2_row is None:
        return None

    team1_price = parse_float(getattr(team1_row, "price", None))
    team2_price = parse_float(getattr(team2_row, "price", None))
    if not team1_price or not team2_price or team1_price <= 1.0 or team2_price <= 1.0:
        return None

    implied_team1 = 1.0 / team1_price
    implied_team2 = 1.0 / team2_price
    total = implied_team1 + implied_team2
    if total <= 0:
        return None

    return clamp_probability(implied_team1 / total)


def heuristic_base_probability(match_state: Any, batting_side: str, balls_remaining: int | None, dossier: dict[str, Any]) -> float:
    wickets_penalty = min(getattr(match_state, "wickets_total", 0) or 0, 10) * 0.035
    momentum_shift = (parse_float(getattr(match_state, "momentum_index", None)) or 0.0) * 0.015
    venue_bias = float((dossier.get("venue_bias") or {}).get("chasing_bias" if getattr(match_state, "target_runs", None) else "defending_bias", 0.0) or 0.0)

    if getattr(match_state, "target_runs", None):
        runs_required = max((getattr(match_state, "target_runs", 0) or 0) - (getattr(match_state, "runs_total", 0) or 0), 0)
        if runs_required == 0:
            return 0.96 if batting_side == "team1" else 0.04

        if balls_remaining is None or balls_remaining <= 0:
            return 0.04 if batting_side == "team1" else 0.96

        required_rr = runs_required / max(balls_remaining / 6.0, 0.1)
        current_rr = parse_float(getattr(match_state, "current_run_rate", None)) or 0.0
        chase_edge = (current_rr - required_rr) * 0.045
        batting_advantage = 0.08 + chase_edge + venue_bias - wickets_penalty + momentum_shift
        return probability_for_team1_from_batting_advantage(batting_advantage, batting_side)
    else:
        progress = 0.0
        if balls_remaining is not None:
            total_balls = format_total_overs(dossier) * 6
            progress = min(max((total_balls - balls_remaining) / total_balls, 0.0), 1.0)

        projected_total = project_final_total(match_state, parse_float(getattr(match_state, "over", None)) or 0.0, balls_remaining)
        par = format_par_score(dossier)
        innings_edge = (projected_total - par) / (par * 0.73)
        batting_advantage = 0.05 + innings_edge + venue_bias + momentum_shift - wickets_penalty + (progress * 0.04)
        return probability_for_team1_from_batting_advantage(batting_advantage, batting_side)


def event_impact_score(event_type: str, severity: str, match_state: Any, batting_side: str, dossier: dict[str, Any]) -> float:
    sign = 1.0 if batting_side == "team1" else -1.0
    if batting_side == "unknown":
        sign = 0.0

    volatility = float((dossier.get("venue_bias") or {}).get("volatility_score", 0.0) or 0.0)

    if event_type == "wicket":
        wicket_multiplier = 1.0 + ((getattr(match_state, "wickets_total", 0) or 0) / 10.0)
        return -0.09 * wicket_multiplier * sign
    if event_type in {"four", "six", "boundary"}:
        return (0.05 + (volatility * 0.05)) * sign
    if event_type in {"single", "double", "triple"}:
        return 0.012 * sign
    if event_type in {"dot", "dot_ball"}:
        return -0.01 * sign
    if event_type in {"rain_break", "innings_break", "match_end"}:
        return 0.0
    if severity == "moderate":
        return 0.018 * sign
    return 0.0


def run_rate_pressure(match_state: Any, batting_side: str) -> float:
    required_rr = parse_float(getattr(match_state, "required_run_rate", None))
    current_rr = parse_float(getattr(match_state, "current_run_rate", None))
    if required_rr is None or current_rr is None:
        return 0.0
    pressure = max(required_rr - current_rr, 0.0) * 0.02
    return team1_delta_from_batting_metric(-pressure, batting_side)


def toss_probability_delta(dossier: dict[str, Any], match_state: Any, batting_side: str) -> float:
    """Apply a small probability nudge based on toss decision and venue chasing bias.

    Only applied when:
    - Toss data is present in the dossier
    - We are in the second innings (target_runs is set)
    - batting_side is known
    - prior_probability is None (first few events of the innings, before market anchors)
    """
    if batting_side not in {"team1", "team2"}:
        return 0.0
    if getattr(match_state, "target_runs", None) is None:
        return 0.0

    toss = dossier.get("toss") or {}
    decision = str(toss.get("decision") or "").strip().lower()
    if not decision:
        return 0.0

    chasing_bias = float((dossier.get("venue_bias") or {}).get("chasing_bias", 0.0) or 0.0)
    # Elected to field = chose to chase. Reward the chasing team.
    elected_to_chase = decision in {"bowl", "field", "chase"}
    base_delta = 0.04 + min(chasing_bias, 0.06)  # 0.04–0.10 range

    if elected_to_chase:
        # Chasing team gets the advantage
        if batting_side == "team1":
            return base_delta
        return -base_delta
    else:
        # Defending team elected to bat first — slight defending advantage
        defending_delta = 0.02
        if batting_side == "team1":
            return -defending_delta
        return defending_delta


def infer_batting_side(batting_team: str | None, team1_name: str, team2_name: str) -> Literal["team1", "team2", "unknown"]:
    if not batting_team:
        return "unknown"

    normalized = batting_team.strip().lower()
    if normalized == team1_name.strip().lower():
        return "team1"
    if normalized == team2_name.strip().lower():
        return "team2"
    return "unknown"


def probability_for_team1_from_batting_advantage(advantage: float, batting_side: str) -> float:
    if batting_side == "team1":
        probability = clamp_probability(0.5 + advantage)
        return clamp_active_live_probability(probability)
    if batting_side == "team2":
        probability = clamp_probability(0.5 - advantage)
        return clamp_active_live_probability(probability)
    probability = clamp_probability(0.5 + (advantage * 0.25))
    return clamp_active_live_probability(probability)


def team1_delta_from_batting_metric(delta: float, batting_side: str) -> float:
    if batting_side == "team1":
        return delta
    if batting_side == "team2":
        return -delta
    return 0.0


def clamp_active_live_probability(value: float) -> float:
    return max(ACTIVE_LIVE_PROBABILITY_FLOOR, min(ACTIVE_LIVE_PROBABILITY_CEILING, value))


def live_match_still_contested(match_state: Any, balls_remaining: int | None) -> bool:
    if not getattr(match_state, "target_runs", None):
        return True

    runs_required = remaining_runs_required(match_state)
    if runs_required <= 0:
        return False

    return balls_remaining is None or balls_remaining > 0


def project_final_total(match_state: Any, over_number: float, balls_remaining: int | None, total_overs: int = DEFAULT_TOTAL_OVERS) -> float:
    current_total = float(getattr(match_state, "runs_total", 0) or 0)
    current_rr = parse_float(getattr(match_state, "current_run_rate", None))
    if current_rr is None:
        if over_number <= 0:
            current_rr = 7.8
        else:
            current_rr = current_total / max(over_number, 0.1)

    wickets_factor = max(0.55, 1.0 - ((getattr(match_state, "wickets_total", 0) or 0) * 0.05))
    momentum_factor = 1.0 + ((parse_float(getattr(match_state, "momentum_index", None)) or 0.0) * 0.015)
    projected_rr = max(4.5, current_rr * wickets_factor * momentum_factor)

    if balls_remaining is None:
        balls_remaining = max(total_overs * 6 - overs_to_balls(over_number), 0)

    projected_runs = projected_rr * (balls_remaining / 6.0)
    return current_total + projected_runs


def summarize_history(memory_context: dict[str, Any]) -> str:
    recent_events = list(memory_context.get("recent_events") or [])
    if not recent_events:
        return "recent_events=none"

    wickets = sum(1 for event in recent_events if event.get("event_type") == "wicket")
    boundaries = sum(1 for event in recent_events if event.get("event_type") in {"four", "six", "boundary"})
    dots = sum(1 for event in recent_events if event.get("event_type") in {"dot", "dot_ball"})
    last_types = ",".join(event.get("event_type", "unknown") for event in recent_events[-6:])
    return f"recent_events={len(recent_events)} wickets={wickets} boundaries={boundaries} dots={dots} last6={last_types}"


def recent_history_adjustment(memory_context: dict[str, Any], batting_side: str) -> float:
    sign = 1.0 if batting_side == "team1" else -1.0 if batting_side == "team2" else 0.0
    if sign == 0.0:
        return 0.0

    recent_events = list(memory_context.get("recent_events") or [])[-12:]
    if not recent_events:
        return 0.0

    wickets = sum(1 for event in recent_events if event.get("event_type") == "wicket")
    boundaries = sum(1 for event in recent_events if event.get("event_type") in {"four", "six", "boundary"})
    dots = sum(1 for event in recent_events if event.get("event_type") in {"dot", "dot_ball"})

    adjustment = (boundaries * 0.012) - (wickets * 0.035) - (dots * 0.003)
    return adjustment * sign


def summarize_dossier(dossier: dict[str, Any]) -> str:
    venue_name = ((dossier.get("venue") or {}).get("name")) or "unknown_venue"
    format_name = dossier.get("format") or "unknown_format"
    track_hint = ((dossier.get("venue_bias") or {}).get("track_hint")) or "balanced"
    return f"venue={venue_name} format={format_name} track={track_hint}"


def safe_probability(value: Any) -> float | None:
    parsed = parse_float(value)
    if parsed is None:
        return None
    return clamp_probability(parsed)


def remaining_runs_required(match_state: Any) -> int:
    target_runs = getattr(match_state, "target_runs", None)
    if target_runs is None:
        return 0
    return max(int(target_runs or 0) - int(getattr(match_state, "runs_total", 0) or 0), 0)


def extract_current_batsman_strike_rates(raw_data: dict[str, Any], batting_team: str | None) -> list[float]:
    if not isinstance(raw_data, dict):
        return []

    batting_entries = raw_data.get("batting") or raw_data.get("batsmen") or []
    if not isinstance(batting_entries, list):
        return []

    normalized_team = (batting_team or "").strip().lower()
    active_rates: list[float] = []
    fallback_rates: list[float] = []

    for entry in batting_entries:
        if not isinstance(entry, dict):
            continue

        strike_rate = parse_float(
            entry.get("strike_rate")
            or entry.get("strike")
            or entry.get("sr")
            or get_in(entry, ["stats", "strike_rate"])
        )
        if strike_rate is None or strike_rate <= 0:
            continue

        team_name = str(entry.get("team") or entry.get("team_name") or "").strip().lower()
        is_active = entry.get("active") is True or str(entry.get("status") or "").strip().lower() == "active"

        if normalized_team and team_name and team_name != normalized_team:
            continue

        fallback_rates.append(strike_rate)
        if is_active:
            active_rates.append(strike_rate)

    return active_rates[:2] if active_rates else fallback_rates[:2]


def get_in(value: dict[str, Any], path: list[str]) -> Any:
    current: Any = value
    for key in path:
        if not isinstance(current, dict):
            return None
        current = current.get(key)
    return current


def overs_to_balls(over_number: float) -> int:
    whole = int(math.floor(over_number))
    fractional = int(round((over_number - whole) * 10))
    fractional = max(0, min(5, fractional))
    return whole * 6 + fractional


def detect_edge_cases(match_state: Any) -> dict[str, Any]:
    """Detect tie, super over, DLS, and other edge cases requiring suspension."""
    
    # Tie scenario: scores level with 0 balls remaining
    runs_total = int(getattr(match_state, "runs_total", 0) or 0)
    target_runs = parse_float(getattr(match_state, "target_runs", None))
    balls_remaining = inferred_balls_remaining(match_state)
    innings = int(getattr(match_state, "inning", 0) or 0)
    
    if innings == 2 and target_runs is not None and balls_remaining == 0:
        if abs(runs_total - target_runs) < 1:  # Tie
            return {
                "should_suspend": True,
                "reason": "tie_scenario_detected",
                "type": "tie",
            }
    
    # Super Over detection
    match_status = str(getattr(match_state, "status", "")).lower()
    if "super over" in match_status or "super_over" in match_status:
        return {
            "should_suspend": True,
            "reason": "super_over_in_progress",
            "type": "super_over",
        }
    
    # DLS target revision detection
    raw_data = getattr(match_state, "raw_data", {}) or {}
    dls_applied = raw_data.get("dls_applied") or raw_data.get("dls_method_applied")
    dls_target_revised = raw_data.get("dls_target_revised") or raw_data.get("target_revised")
    
    if dls_applied or dls_target_revised:
        return {
            "should_suspend": True,
            "reason": "dls_target_revision_in_progress",
            "type": "dls",
        }
    
    # Negative balls_remaining (data error)
    if balls_remaining is not None and balls_remaining < 0:
        return {
            "should_suspend": True,
            "reason": "negative_balls_remaining_data_error",
            "type": "data_error",
        }
    
    return {
        "should_suspend": False,
        "reason": None,
        "type": None,
    }


def validate_critical_data(match_state: Any) -> dict[str, Any]:
    """Validate that critical data fields are present for pricing."""
    missing_fields = []
    
    # Truly critical fields for all markets
    if not hasattr(match_state, "runs_total") or match_state.runs_total is None:
        missing_fields.append("runs_total")
    
    if not hasattr(match_state, "wickets_total") or match_state.wickets_total is None:
        missing_fields.append("wickets_total")
    
    # Critical for second innings
    innings = int(getattr(match_state, "inning", 0) or 0)
    if innings == 2:
        target_runs = parse_float(getattr(match_state, "target_runs", None))
        if target_runs is None:
            missing_fields.append("target_runs")
    
    if missing_fields:
        return {
            "is_valid": False,
            "reason": f"critical_data_missing: {', '.join(missing_fields)}",
            "missing_fields": missing_fields,
        }
    
    return {
        "is_valid": True,
        "reason": None,
        "missing_fields": [],
    }


def inferred_balls_remaining(match_state: Any) -> int | None:
    explicit = parse_float(getattr(match_state, "balls_remaining", None))
    if explicit is not None:
        return max(int(explicit), 0)

    over_number = parse_float(getattr(match_state, "over", None))
    if over_number is None:
        return None

    raw_data = getattr(match_state, "raw_data", {}) or {}
    format_name = str(raw_data.get("format") or raw_data.get("format_name") or "t20").lower()
    total_overs = _FORMAT_TOTAL_OVERS.get(format_name, DEFAULT_TOTAL_OVERS)
    return max((total_overs * 6) - overs_to_balls(over_number), 0)
