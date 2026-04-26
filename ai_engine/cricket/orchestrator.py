from __future__ import annotations

import atexit
import os
import time
import uuid
import logging
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Literal, TypedDict

from langgraph.graph import END, StateGraph
from pydantic import BaseModel, Field, ConfigDict

from cricket.context_manager import context_manager_node
from cricket.bookmaker_bias import apply_bookmaker_bias
from cricket.exposure import apply_exposure_shading
from cricket.fancy_generator import build_fancy_markets
from cricket.fancy_reviewer import review_fancy_markets
from cricket.in_play_generator import (
    infer_probability_with_llm,
    in_play_generator_node,
    margin_for_request,
)
from cricket.market_factory import build_candidate_markets
from cricket.memory import CricketMemoryStore
from cricket.fancy_generator import fancy_projection_key
from cricket.lifecycle_analytics import summarize_market_lifecycle
from cricket.observability import CricketObservabilityStore
from cricket.pre_match_bootstrap import ensure_pre_match_context_pack
from cricket.realism_reviewer import apply_realism_review
from cricket.reviewer import review_candidate
from cricket.risk_limits import clamp_probability, parse_float


logger = logging.getLogger(__name__)


class TriggerPayload(BaseModel):
    event_type: str
    severity: str
    reason: str


class CurrentOddsRow(BaseModel):
    id: str | None = None
    bet_type: str | None = None
    market_key: str
    selection_key: str
    label: str
    price: str | float | int | Decimal
    version_no: int | None = None


class MatchState(BaseModel):
    model_config = ConfigDict(extra="allow")

    match_id: str
    provider: str | None = None
    sport: str
    event_seq: int
    state_version: int
    event_time: str | None = None
    event_type: str | None = None
    inning: int = 0
    over: str | None = None
    ball_in_over: int = 0
    team1: str | None = None
    team2: str | None = None
    batting_team: str | None = None
    bowling_team: str | None = None
    runs_total: int = 0
    wickets_total: int = 0
    target_runs: int | None = None
    current_run_rate: str | None = None
    required_run_rate: str | None = None
    momentum_index: str | None = None
    market_state: dict[str, Any] = Field(default_factory=dict)
    score: dict[str, Any] = Field(default_factory=dict)
    raw_data: dict[str, Any] = Field(default_factory=dict)


class RuntimeConfig(BaseModel):
    provider: str = "openrouter"
    api_key: str | None = None
    api_key_ref: str | None = None
    model: str | None = None
    fallback_model: str | None = None
    house_margin_profile: str = "standard"
    risk_profile: str = "standard"
    max_price_jump_threshold: float = 0.20
    request_timeout_ms: int = 2000
    llm_enabled: bool = False
    fallback_allowed: bool = True
    config_provider: str = "phoenix_settings"


class PreMatchSeed(BaseModel):
    team1_win_probability: float
    team2_win_probability: float
    source: str
    confidence: float


class CalculateOddsRequest(BaseModel):
    match_id: str
    event_seq: int
    state_version: int
    trigger: TriggerPayload
    match_state: MatchState
    current_odds: list[CurrentOddsRow] = Field(default_factory=list)
    liability_book: dict[str, Any] = Field(default_factory=dict)
    runtime_config: RuntimeConfig | None = None
    pre_match_seed: PreMatchSeed | None = None


class EngineMarket(BaseModel):
    market_key: str
    selection_key: str
    label: str
    price: str
    bet_type: str
    is_suspended: bool = False
    reason: str | None = None
    confidence_score: float
    valid_for_ms: int
    market_family: str | None = None
    window_label: str | None = None
    projected_line: str | None = None
    trace_meta: dict[str, Any] = Field(default_factory=dict)


class CalculateOddsResponse(BaseModel):
    match_id: str
    state_version: int
    engine_trace_id: str
    latency_ms: int
    model: str
    config_provider: str
    llm_enabled: bool
    fallback_used: bool
    reviewer_decision: str = "approve"
    reviewer_feedback: str | None = None
    reviewer_flags: list[str] = Field(default_factory=list)
    fair_probability: float | None = None
    display_probability: float | None = None
    shading_magnitude: float = 0.0
    volatility_mode_active: bool = False
    elasticity_applied: bool = False
    elasticity_reason: str | None = None
    active_playbooks: list[str] = Field(default_factory=list)
    bookmaker_summary: dict[str, Any] = Field(default_factory=dict)
    fancy_summary: dict[str, Any] = Field(default_factory=dict)
    bookmaker_node_latency_ms: int = 0
    exposure_summary: dict[str, Any] = Field(default_factory=dict)
    exposure_flags: list[str] = Field(default_factory=list)
    lifecycle_analytics: dict[str, Any] = Field(default_factory=dict)
    markets: list[EngineMarket]
    fancy_markets: list[EngineMarket] = Field(default_factory=list)
    fancy_flags: list[str] = Field(default_factory=list)
    fancy_suspension_reason: str | None = None


class GraphState(TypedDict, total=False):
    request: CalculateOddsRequest
    started_at: float
    engine_trace_id: str
    thread_id: str
    team1_name: str
    team2_name: str
    batting_side: Literal["team1", "team2", "unknown"]
    over_number: float
    balls_bowled: int
    balls_remaining: int | None
    required_run_rate_value: float
    batsman_strike_rates: list[float]
    boundary_pressure_summary: dict[str, Any]
    boundary_pressure_flags: list[str]
    desperate_chase: bool
    volatility_mode_active: bool
    base_probability_team1: float
    context_probability_team1: float
    fair_probability_team1: float
    display_probability_team1: float
    event_impact: float
    reasoning: str
    llm_probability_team1: float | None
    llm_confidence: float
    llm_error: str | None
    match_winner_probability_team1: float
    candidate_probability_team1: float
    raw_candidate_probability_team1: float
    candidate_confidence: float
    approved_probability_team1: float
    approved_confidence: float
    markets: list[dict[str, Any]]
    model_name: str
    config_provider: str
    llm_enabled: bool
    fallback_used: bool
    memory_context: dict[str, Any]
    history_summary: str
    prior_probability_team1: float | None
    context_quality_penalty: float
    context_quality_flags: list[str]
    generator_attempt: int
    reviewer_decision: str
    reviewer_feedback: str | None
    reviewer_flags: list[str]
    approved: bool
    safe_fallback_required: bool
    jump_threshold: float
    current_published_probability_team1: float | None
    correction_low: float | None
    correction_high: float | None
    approved_markets: list[dict[str, Any]]
    fancy_markets: list[dict[str, Any]]
    fancy_flags: list[str]
    fancy_suspension_reason: str | None
    fancy_summary: dict[str, Any]
    exposure_summary: dict[str, Any]
    exposure_flags: list[str]
    exposure_low: float | None
    exposure_high: float | None
    bookmaker_flags: list[str]
    bookmaker_summary: dict[str, Any]
    shading_magnitude: float
    active_playbooks: list[str]
    bookmaker_node_latency_ms: int
    elasticity_applied: bool
    elasticity_reason: str | None
    lifecycle_analytics: dict[str, Any]


DEFAULT_MARGIN = Decimal(os.getenv("AI_ENGINE_HOUSE_MARGIN", "0.04"))
STALE_FEED_THRESHOLD_SEC = int(os.getenv("CRICKET_STALE_FEED_THRESHOLD_SEC", "55"))
CRICKET_MEMORY = CricketMemoryStore()
CRICKET_OBSERVABILITY = CricketObservabilityStore()
atexit.register(CRICKET_MEMORY.close_pool)

# Monitoring agents
from cricket.per_match_monitor import MatchMonitorRegistry
from cricket.global_monitor import GlobalMonitor

MATCH_MONITOR_REGISTRY = MatchMonitorRegistry(CRICKET_MEMORY)
GLOBAL_MONITOR = GlobalMonitor(CRICKET_MEMORY, MATCH_MONITOR_REGISTRY)
GLOBAL_MONITOR.start()
atexit.register(MATCH_MONITOR_REGISTRY.shutdown)
atexit.register(GLOBAL_MONITOR.stop)


def build_graph() -> Any:
    graph = StateGraph(GraphState)
    graph.add_node(
        "context_manager",
        lambda state: context_manager_node(
            state,
            memory_store=CRICKET_MEMORY,
            runtime_config_resolver=resolved_runtime_config,
        ),
    )
    graph.add_node(
        "in_play_generator",
        lambda state: in_play_generator_node(
            state,
            runtime_config_resolver=resolved_runtime_config,
            llm_inference=infer_probability_with_llm,
        ),
    )
    graph.add_node("fancy_generator", fancy_generator_node)
    graph.add_node("batsman_generator", batsman_generator_node)
    graph.add_node("bookmaker_bias", bookmaker_bias_node)
    graph.add_node("exposure_manager", exposure_manager_node)
    graph.add_node("reviewer_risk_manager", reviewer_risk_manager_node)
    graph.add_node("rate_emitter", rate_emitter_node)
    graph.set_entry_point("context_manager")
    graph.add_edge("context_manager", "fancy_generator")
    graph.add_edge("fancy_generator", "batsman_generator")
    graph.add_edge("batsman_generator", "in_play_generator")
    graph.add_edge("in_play_generator", "bookmaker_bias")
    graph.add_edge("bookmaker_bias", "exposure_manager")
    graph.add_edge("exposure_manager", "reviewer_risk_manager")
    graph.add_conditional_edges(
        "reviewer_risk_manager",
        reviewer_route,
        {
            "retry_generator": "in_play_generator",
            "emit_approved": "rate_emitter",
            "emit_keep_suspended": END,
        },
    )
    graph.add_edge("rate_emitter", END)
    return graph.compile()


def resolved_runtime_config(request: CalculateOddsRequest) -> RuntimeConfig:
    if request.runtime_config is not None:
        return request.runtime_config

    return RuntimeConfig(
        llm_enabled=False,
        fallback_allowed=True,
        config_provider="missing_runtime_config",
    )


def fancy_generator_node(state: GraphState) -> GraphState:
    request = state["request"]
    dossier = ((state.get("memory_context") or {}).get("match_dossier") or {})
    format_name = str(dossier.get("format_name") or dossier.get("format") or "t20").lower()
    raw_markets = build_fancy_markets(
        match_state=request.match_state,
        memory_context=state.get("memory_context") or {},
        over_number=state["over_number"],
        balls_remaining=state["balls_remaining"],
        confidence=max(0.25, state["context_probability_team1"]),
        margin=margin_for_request(request, DEFAULT_MARGIN),
        engine_trace_id=state["engine_trace_id"],
        runtime_config=resolved_runtime_config(request),
        format_name=format_name,
    )
    fancy_markets, fancy_flags, fancy_suspension_reason = review_fancy_markets(
        fancy_markets=raw_markets,
        memory_context=state.get("memory_context") or {},
        over_number=state["over_number"],
        balls_remaining=state["balls_remaining"],
    )
    fancy_summary = summarize_fancy_markets(fancy_markets)
    return {
        **state,
        "fancy_markets": fancy_markets,
        "fancy_flags": fancy_flags,
        "fancy_suspension_reason": fancy_suspension_reason,
        "fancy_summary": fancy_summary,
    }


def batsman_generator_node(state: GraphState) -> GraphState:
    from cricket.batsman_generator import build_batsman_runs_market, build_partnership_market
    
    request = state["request"]
    dossier = ((state.get("memory_context") or {}).get("match_dossier") or {})
    format_name = str(dossier.get("format_name") or dossier.get("format") or "t20").lower()
    margin = margin_for_request(request, DEFAULT_MARGIN)
    confidence = max(0.25, state["context_probability_team1"])
    valid_for_ms = 8000 if format_name == "odi" else 5000  # ODI batsmen score slower
    
    batsman_markets = build_batsman_runs_market(
        raw_data=getattr(request.match_state, "raw_data", {}) or {},
        batting_team=getattr(request.match_state, "batting_team", None),
        balls_remaining=state["balls_remaining"],
        margin=margin,
        confidence=confidence,
        valid_for_ms=valid_for_ms,
        event_time=getattr(request.match_state, "event_time", None),
        format_name=format_name,
    )
    
    partnership_markets = build_partnership_market(
        raw_data=getattr(request.match_state, "raw_data", {}) or {},
        batting_team=getattr(request.match_state, "batting_team", None),
        balls_remaining=state["balls_remaining"],
        margin=margin,
        confidence=confidence,
        valid_for_ms=valid_for_ms,
        format_name=format_name,
    )
    
    return {
        **state,
        "batsman_markets": batsman_markets,
        "partnership_markets": partnership_markets,
    }


def bookmaker_bias_node(state: GraphState) -> GraphState:
    request = state["request"]
    fair_probability = state["candidate_probability_team1"]
    dossier = ((state.get("memory_context") or {}).get("match_dossier") or {})
    started_at = time.perf_counter()
    outcome = apply_bookmaker_bias(
        fair_probability=fair_probability,
        request=request,
        batting_side=state["batting_side"],
        over_number=state["over_number"],
        dossier=dossier,
        boundary_pressure=state.get("boundary_pressure_summary"),
        balls_remaining=state.get("balls_remaining"),
        recent_events=list((state.get("memory_context") or {}).get("recent_events") or []),
        batsman_strike_rates=state.get("batsman_strike_rates"),
        margin=float(margin_for_request(request, DEFAULT_MARGIN)),
    )
    latency_ms = int((time.perf_counter() - started_at) * 1000)
    logger.info(
        "bookmaker_bias_health match_id=%s event_seq=%s latency_ms=%s playbooks=%s total_skew=%.4f",
        request.match_id,
        request.event_seq,
        latency_ms,
        ",".join(outcome.active_playbooks) if outcome.active_playbooks else "none",
        outcome.total_skew,
    )

    return {
        **state,
        "fair_probability_team1": outcome.fair_probability,
        "display_probability_team1": outcome.display_probability,
        "candidate_probability_team1": outcome.display_probability,
        "bookmaker_flags": outcome.flags,
        "bookmaker_summary": outcome.summary,
        "shading_magnitude": outcome.total_skew,
        "active_playbooks": outcome.active_playbooks,
        "bookmaker_node_latency_ms": latency_ms,
        "volatility_mode_active": bool(outcome.summary.get("volatility_mode_active")),
    }


def exposure_manager_node(state: GraphState) -> GraphState:
    request = state["request"]
    outcome = apply_exposure_shading(
        liability_book=request.liability_book,
        candidate_probability=state["candidate_probability_team1"],
        current_published_probability=state.get("current_published_probability_team1"),
        prior_probability=state.get("prior_probability_team1"),
        match_state=request.match_state,
        batting_side=state["batting_side"],
        balls_remaining=state.get("balls_remaining"),
        boundary_pressure=state.get("boundary_pressure_summary"),
    )

    current_low = state.get("correction_low")
    current_high = state.get("correction_high")
    next_low = outcome.max_allowed_low if current_low is None else max(current_low, outcome.max_allowed_low or current_low)
    next_high = outcome.max_allowed_high if current_high is None else min(current_high, outcome.max_allowed_high or current_high)

    return {
        **state,
        "candidate_probability_team1": outcome.adjusted_probability,
        "candidate_confidence": max(0.2, state.get("candidate_confidence", 0.45) - outcome.confidence_penalty),
        "exposure_summary": outcome.summary,
        "exposure_flags": outcome.flags,
        "exposure_low": outcome.max_allowed_low,
        "exposure_high": outcome.max_allowed_high,
        "correction_low": next_low,
        "correction_high": next_high,
    }


def reviewer_risk_manager_node(state: GraphState) -> GraphState:
    request = state["request"]
    outcome = review_candidate(
        request=request,
        team1_name=state["team1_name"],
        team2_name=state["team2_name"],
        batting_side=state["batting_side"],
        over_number=state["over_number"],
        balls_remaining=state["balls_remaining"],
        candidate_probability=state["candidate_probability_team1"],
        candidate_confidence=state.get("candidate_confidence", 0.45),
        base_probability=state["base_probability_team1"],
        prior_probability=state.get("prior_probability_team1"),
        current_published_probability=state.get("current_published_probability_team1"),
        llm_error=state.get("llm_error"),
        generator_attempt=state.get("generator_attempt", 1),
        margin=margin_for_request(request, DEFAULT_MARGIN),
        hard_jump_threshold=resolved_runtime_config(request).max_price_jump_threshold,
        pre_flags=(state.get("bookmaker_flags", []) or []) + (state.get("exposure_flags", []) or []),
        max_allowed_low=state.get("exposure_low"),
        max_allowed_high=state.get("exposure_high"),
        fair_probability=state.get("fair_probability_team1"),
        display_probability=state.get("display_probability_team1"),
        shading_magnitude=(
            abs(float(state.get("candidate_probability_team1", 0.0) - state.get("fair_probability_team1", 0.0)))
            if state.get("fair_probability_team1") is not None
            else state.get("shading_magnitude")
        ),
        active_playbooks=state.get("active_playbooks"),
        bookmaker_flags=state.get("bookmaker_flags"),
        exposure_flags=state.get("exposure_flags"),
        volatility_mode_active=state.get("volatility_mode_active", False),
        desperate_chase=state.get("desperate_chase", False),
        bookmaker_summary=state.get("bookmaker_summary"),
    )

    approved_probability = outcome.approved_probability or state["candidate_probability_team1"]
    return {
        **state,
        "reviewer_decision": outcome.decision,
        "reviewer_feedback": outcome.feedback,
        "reviewer_flags": outcome.flags,
        "approved": outcome.decision in {"approve", "approve_with_dampening"},
        "safe_fallback_required": outcome.decision == "reject_and_keep_suspended",
        "fallback_used": True if outcome.decision == "reject_and_keep_suspended" else state.get("fallback_used", True),
        "model_name": "reviewer-veto" if outcome.decision == "reject_and_keep_suspended" else state.get("model_name", "deterministic-fallback"),
        "approved_probability_team1": approved_probability,
        "approved_confidence": outcome.approved_confidence,
        "match_winner_probability_team1": approved_probability,
        "correction_low": outcome.correction_low,
        "correction_high": outcome.correction_high,
        "approved_markets": outcome.approved_markets,
        "exposure_summary": state.get("exposure_summary", {}),
        "exposure_flags": state.get("exposure_flags", []),
        "volatility_mode_active": outcome.volatility_mode_active,
        "elasticity_applied": outcome.elasticity_applied,
        "elasticity_reason": outcome.elasticity_reason,
    }


def rate_emitter_node(state: GraphState) -> GraphState:
    request = state["request"]
    probability_team1 = state["approved_probability_team1"]
    confidence = state.get("approved_confidence", 0.45)
    dossier = ((state.get("memory_context") or {}).get("match_dossier") or {})
    format_name = str(dossier.get("format_name") or dossier.get("format") or "t20").lower()
    markets = state.get("approved_markets") or build_candidate_markets(
        match_state=request.match_state,
        team1_name=state["team1_name"],
        team2_name=state["team2_name"],
        batting_side=state["batting_side"],
        over_number=state["over_number"],
        balls_remaining=state["balls_remaining"],
        probability_team1=probability_team1,
        confidence=confidence,
        margin=margin_for_request(request, DEFAULT_MARGIN),
        liability_book=request.liability_book,
        format_name=format_name,
        memory_context=state.get("memory_context"),
    )
    markets = attach_market_intel(state, markets)
    markets, realism_flags = apply_realism_review(
        markets=markets,
        match_state=request.match_state,
        over_number=state["over_number"],
        balls_remaining=state["balls_remaining"],
    )
    return {
        **state,
        "markets": markets,
        "match_winner_probability_team1": probability_team1,
        "reviewer_flags": list(dict.fromkeys((state.get("reviewer_flags") or []) + realism_flags)),
    }


_PROACTIVE_SUSPEND_EVENTS: frozenset[str] = frozenset({
    "rain_break",
    "rain_delay",
    "drs_review",
    "umpire_review",
    "innings_break",
    "ball_change",
    "injury_timeout",
    "match_end",
    "match_abandoned",
    "floodlight_failure",
    "pitch_inspection",
})


def proactive_suspension_check(event_type: str | None) -> tuple[bool, str | None]:
    normalized = (event_type or "").strip().lower().replace(" ", "_")
    if normalized in _PROACTIVE_SUSPEND_EVENTS:
        return True, f"proactive_suspension:{normalized}"
    return False, None


def parse_timestamp(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except Exception:
        return None


def stale_feed_status(request: CalculateOddsRequest, memory_context: dict[str, Any] | None = None) -> tuple[bool, str | None]:
    now = datetime.now(timezone.utc)
    event_dt = parse_timestamp(getattr(request.match_state, "event_time", None))
    if event_dt is not None:
        age = (now - event_dt).total_seconds()
        if age > STALE_FEED_THRESHOLD_SEC:
            return True, f"stale_feed_guard:event_age={int(age)}s"
        return False, None

    context = memory_context or {}
    recent_events = list(context.get("recent_events") or [])
    if recent_events:
        fallback_dt = parse_timestamp(recent_events[-1].get("event_time"))
        if fallback_dt is not None:
            age = (now - fallback_dt).total_seconds()
            if age > STALE_FEED_THRESHOLD_SEC:
                return True, f"stale_feed_guard:memory_event_age={int(age)}s"

    return False, None


def record_observability(
    *,
    request: CalculateOddsRequest,
    latency_ms: int,
    reviewer_decision: str,
    reviewer_flags: list[str] | None = None,
    suspension_reason: str | None = None,
    probability_team1: float | None = None,
    generator_attempt: int = 1,
) -> None:
    CRICKET_OBSERVABILITY.record(
        match_id=request.match_id,
        timestamp=datetime.now(timezone.utc).isoformat(),
        latency_ms=latency_ms,
        reviewer_decision=reviewer_decision,
        reviewer_flags=reviewer_flags or [],
        suspension_reason=suspension_reason,
        probability_team1=probability_team1,
        generator_attempt=generator_attempt,
    )


def observability_snapshot(match_id: str | None = None) -> dict[str, Any]:
    return CRICKET_OBSERVABILITY.snapshot(
        match_id=match_id,
        memory_store=CRICKET_MEMORY,
        match_registry=MATCH_MONITOR_REGISTRY,
        global_monitor=GLOBAL_MONITOR,
    )


def run_graph(request: CalculateOddsRequest) -> CalculateOddsResponse:
    started_at = time.perf_counter()
    engine_trace_id = str(uuid.uuid4())
    
    # Rate limiting check
    from cricket.rate_limiter import get_rate_limiter
    rate_limiter = get_rate_limiter()
    allowed, rate_limit_reason = rate_limiter.check_rate_limit(request.match_id, request.state_version)
    
    if not allowed:
        latency_ms = int((time.perf_counter() - started_at) * 1000)
        suspended_market = EngineMarket(
            market_key="match_winner",
            selection_key="team1",
            label=request.match_state.team1 or "Team 1",
            price="1.01",
            bet_type="match_winner",
            is_suspended=True,
            reason=rate_limit_reason,
            confidence_score=0.0,
            valid_for_ms=0,
        )
        response = CalculateOddsResponse(
            match_id=request.match_id,
            state_version=request.state_version,
            engine_trace_id=engine_trace_id,
            latency_ms=latency_ms,
            model="rate-limited",
            config_provider="phoenix_settings",
            llm_enabled=False,
            fallback_used=True,
            reviewer_decision="reject_and_keep_suspended",
            reviewer_feedback=rate_limit_reason or "rate_limit_exceeded",
            reviewer_flags=[rate_limit_reason or "rate_limit"],
            markets=[suspended_market],
            fancy_markets=[],
            fancy_flags=["rate_limited"],
            fancy_suspension_reason=rate_limit_reason,
        )
        record_observability(
            request=request,
            latency_ms=latency_ms,
            reviewer_decision=response.reviewer_decision,
            reviewer_flags=response.reviewer_flags,
            suspension_reason=rate_limit_reason,
            probability_team1=None,
            generator_attempt=1,
        )
        return response

    should_suspend, suspend_reason = proactive_suspension_check(request.trigger.event_type)
    
    # Invalidate LLM cache on critical events
    critical_events = {"wicket", "boundary", "four", "six", "drs_review", "umpire_review"}
    event_normalized = (request.trigger.event_type or "").strip().lower().replace(" ", "_")
    if event_normalized in critical_events:
        from cricket.llm_cache import get_llm_cache
        get_llm_cache().invalidate_match(request.match_id)
    
    if should_suspend:
        latency_ms = int((time.perf_counter() - started_at) * 1000)
        suspended_market = EngineMarket(
            market_key="match_winner",
            selection_key="team1",
            label=request.match_state.team1 or "Team 1",
            price="1.01",
            bet_type="match_winner",
            is_suspended=True,
            reason=suspend_reason,
            confidence_score=0.0,
            valid_for_ms=0,
        )
        response = CalculateOddsResponse(
            match_id=request.match_id,
            state_version=request.state_version,
            engine_trace_id=engine_trace_id,
            latency_ms=latency_ms,
            model="proactive-suspension",
            config_provider="phoenix_settings",
            llm_enabled=False,
            fallback_used=True,
            reviewer_decision="reject_and_keep_suspended",
            reviewer_feedback=suspend_reason,
            reviewer_flags=[suspend_reason or "proactive_suspension"],
            markets=[suspended_market],
            fancy_markets=[],
            fancy_flags=["proactive_suspension"],
            fancy_suspension_reason=suspend_reason,
        )
        record_observability(
            request=request,
            latency_ms=latency_ms,
            reviewer_decision=response.reviewer_decision,
            reviewer_flags=response.reviewer_flags,
            suspension_reason=suspend_reason,
            probability_team1=None,
            generator_attempt=1,
        )
        return response

    thread_id = request.match_id
    memory_context = CRICKET_MEMORY.load(thread_id)
    ensure_pre_match_context_pack(
        match_id=request.match_id,
        match_state=request.match_state,
        state_version=request.state_version,
        event_seq=request.event_seq,
        memory_store=CRICKET_MEMORY,
        memory_context=memory_context,
    )
    memory_context = CRICKET_MEMORY.load(thread_id)
    stale_feed, stale_reason = stale_feed_status(request, memory_context)
    allow_stale_bootstrap = stale_feed and len(request.current_odds) == 0
    if allow_stale_bootstrap:
        logger.warning(
            "stale_feed_guard_bootstrap_bypass match_id=%s state_version=%s event_seq=%s reason=%s",
            request.match_id,
            request.state_version,
            request.event_seq,
            stale_reason,
        )

    if stale_feed and not allow_stale_bootstrap:
        latency_ms = int((time.perf_counter() - started_at) * 1000)
        suspended_market = EngineMarket(
            market_key="match_winner",
            selection_key="team1",
            label=request.match_state.team1 or "Team 1",
            price="1.01",
            bet_type="match_winner",
            is_suspended=True,
            reason=stale_reason,
            confidence_score=0.0,
            valid_for_ms=0,
        )
        response = CalculateOddsResponse(
            match_id=request.match_id,
            state_version=request.state_version,
            engine_trace_id=engine_trace_id,
            latency_ms=latency_ms,
            model="stale-feed-guard",
            config_provider="phoenix_settings",
            llm_enabled=False,
            fallback_used=True,
            reviewer_decision="reject_and_keep_suspended",
            reviewer_feedback=stale_reason,
            reviewer_flags=[stale_reason or "stale_feed_guard"],
            markets=[suspended_market],
            fancy_markets=[],
            fancy_flags=["stale_feed_guard"],
            fancy_suspension_reason=stale_reason,
        )
        record_observability(
            request=request,
            latency_ms=latency_ms,
            reviewer_decision=response.reviewer_decision,
            reviewer_flags=response.reviewer_flags,
            suspension_reason=stale_reason,
            probability_team1=None,
            generator_attempt=1,
        )
        return response

    MATCH_MONITOR_REGISTRY.register(request.match_id)
    graph_state = GRAPH.invoke(
        {
            "request": request,
            "started_at": started_at,
            "engine_trace_id": engine_trace_id,
            "thread_id": thread_id,
            "memory_context": memory_context,
        },
        config={"configurable": {"thread_id": thread_id}},
    )
    latency_ms = int((time.perf_counter() - started_at) * 1000)
    
    # Check for edge case suspension (tie, super over, DLS)
    if graph_state.get("edge_case_suspension"):
        edge_case_reason = graph_state.get("edge_case_reason", "edge_case_detected")
        edge_case_type = graph_state.get("edge_case_type", "unknown")
        suspended_market = EngineMarket(
            market_key="match_winner",
            selection_key="team1",
            label=request.match_state.team1 or "Team 1",
            price="1.01",
            bet_type="match_winner",
            is_suspended=True,
            reason=edge_case_reason,
            confidence_score=0.0,
            valid_for_ms=0,
        )
        response = CalculateOddsResponse(
            match_id=request.match_id,
            state_version=request.state_version,
            engine_trace_id=engine_trace_id,
            latency_ms=latency_ms,
            model="edge-case-suspension",
            config_provider="phoenix_settings",
            llm_enabled=False,
            fallback_used=True,
            reviewer_decision="reject_and_keep_suspended",
            reviewer_feedback=f"{edge_case_type}: {edge_case_reason}",
            reviewer_flags=[edge_case_reason, f"edge_case_type:{edge_case_type}"],
            markets=[suspended_market],
            fancy_markets=[],
            fancy_flags=["edge_case_suspension"],
            fancy_suspension_reason=edge_case_reason,
        )
        record_observability(
            request=request,
            latency_ms=latency_ms,
            reviewer_decision=response.reviewer_decision,
            reviewer_flags=response.reviewer_flags,
            suspension_reason=edge_case_reason,
            probability_team1=None,
            generator_attempt=int(graph_state.get("generator_attempt", 1) or 1),
        )
        return response
    
    # Check for critical data missing suspension
    if graph_state.get("critical_data_missing"):
        missing_reason = graph_state.get("missing_data_reason", "critical_data_missing")
        missing_fields = graph_state.get("missing_fields", [])
        suspended_market = EngineMarket(
            market_key="match_winner",
            selection_key="team1",
            label=request.match_state.team1 or "Team 1",
            price="1.01",
            bet_type="match_winner",
            is_suspended=True,
            reason=missing_reason,
            confidence_score=0.0,
            valid_for_ms=0,
        )
        response = CalculateOddsResponse(
            match_id=request.match_id,
            state_version=request.state_version,
            engine_trace_id=engine_trace_id,
            latency_ms=latency_ms,
            model="critical-data-missing",
            config_provider="phoenix_settings",
            llm_enabled=False,
            fallback_used=True,
            reviewer_decision="reject_and_keep_suspended",
            reviewer_feedback=f"Missing: {', '.join(missing_fields)}",
            reviewer_flags=[missing_reason] + [f"missing:{field}" for field in missing_fields],
            markets=[suspended_market],
            fancy_markets=[],
            fancy_flags=["critical_data_missing"],
            fancy_suspension_reason=missing_reason,
        )
        record_observability(
            request=request,
            latency_ms=latency_ms,
            reviewer_decision=response.reviewer_decision,
            reviewer_flags=response.reviewer_flags,
            suspension_reason=missing_reason,
            probability_team1=None,
            generator_attempt=int(graph_state.get("generator_attempt", 1) or 1),
        )
        return response
    
    persist_memory_snapshot(request, graph_state)
    
    # Learn venue bias from completed matches
    try_venue_learning(request, graph_state)

    markets = [EngineMarket(**market) for market in graph_state.get("markets", [])]
    fancy_markets = [EngineMarket(**market) for market in graph_state.get("fancy_markets", [])]
    lifecycle_analytics = summarize_market_lifecycle(
        markets=graph_state.get("markets", []),
        fancy_markets=graph_state.get("fancy_markets", []),
        reviewer_decision=graph_state.get("reviewer_decision", "approve"),
        active_playbooks=graph_state.get("active_playbooks", []),
        recent_reprices=(graph_state.get("memory_context") or {}).get("recent_reprices") or [],
        recent_events=(graph_state.get("memory_context") or {}).get("recent_events") or [],
        latency_ms=latency_ms,
    )
    response = CalculateOddsResponse(
        match_id=request.match_id,
        state_version=request.state_version,
        engine_trace_id=engine_trace_id,
        latency_ms=latency_ms,
        model=graph_state.get("model_name", "deterministic-fallback"),
        config_provider=graph_state.get("config_provider", "phoenix_settings"),
        llm_enabled=graph_state.get("llm_enabled", False),
        fallback_used=graph_state.get("fallback_used", True),
        reviewer_decision=graph_state.get("reviewer_decision", "approve"),
        reviewer_feedback=graph_state.get("reviewer_feedback"),
        reviewer_flags=graph_state.get("reviewer_flags", []),
        fair_probability=graph_state.get("fair_probability_team1"),
        display_probability=graph_state.get("display_probability_team1"),
        shading_magnitude=graph_state.get("shading_magnitude", 0.0),
        volatility_mode_active=graph_state.get("volatility_mode_active", False),
        elasticity_applied=graph_state.get("elasticity_applied", False),
        elasticity_reason=graph_state.get("elasticity_reason"),
        active_playbooks=graph_state.get("active_playbooks", []),
        bookmaker_summary=graph_state.get("bookmaker_summary", {}),
        fancy_summary=graph_state.get("fancy_summary", {}),
        bookmaker_node_latency_ms=graph_state.get("bookmaker_node_latency_ms", 0),
        exposure_summary=graph_state.get("exposure_summary", {}),
        exposure_flags=graph_state.get("exposure_flags", []),
        lifecycle_analytics=lifecycle_analytics,
        markets=markets,
        fancy_markets=fancy_markets,
        fancy_flags=graph_state.get("fancy_flags", []),
        fancy_suspension_reason=graph_state.get("fancy_suspension_reason"),
    )
    suspension_reason = response.fancy_suspension_reason
    if not suspension_reason:
        for market in response.markets:
            if market.is_suspended and market.reason:
                suspension_reason = market.reason
                break
    record_observability(
        request=request,
        latency_ms=latency_ms,
        reviewer_decision=response.reviewer_decision,
        reviewer_flags=response.reviewer_flags,
        suspension_reason=suspension_reason,
        probability_team1=graph_state.get("match_winner_probability_team1"),
        generator_attempt=int(graph_state.get("generator_attempt", 1) or 1),
    )
    return response


def try_venue_learning(request: CalculateOddsRequest, graph_state: GraphState) -> None:
    """Learn venue bias from completed matches."""
    try:
        from cricket.dossier import learn_venue_bias
        from cricket.global_training_cache import record_global_match_completion
        
        match_state = request.match_state
        dossier = graph_state.get("dossier") or {}
        
        # Check if match is complete (both innings done)
        innings = getattr(match_state, "innings", None)
        if innings != 2:
            return
        
        # Check if we have a winner
        winner = getattr(match_state, "winner", None)
        if not winner:
            return
        
        # Extract venue info
        venue = dossier.get("venue") or {}
        venue_name = venue.get("name")
        if not venue_name:
            return
        
        # Extract format
        format_name = dossier.get("format_name", "t20")
        
        # Extract scores
        raw_data = getattr(match_state, "raw_data", {}) or {}
        score = getattr(match_state, "score", {}) or {}
        
        # Get first and second innings scores
        first_innings_score = 0
        second_innings_score = 0
        
        if "innings" in raw_data and isinstance(raw_data["innings"], list) and len(raw_data["innings"]) >= 2:
            first_innings_score = int(raw_data["innings"][0].get("runs", 0) or 0)
            second_innings_score = int(raw_data["innings"][1].get("runs", 0) or 0)
        else:
            # Fallback to current score
            first_innings_score = int(score.get("first_innings_runs", 0) or 0)
            second_innings_score = int(getattr(match_state, "runs_total", 0) or 0)
        
        # Determine if chasing team won
        toss = dossier.get("toss") or {}
        elected_to_bat = toss.get("elected_to_bat", True)
        
        # If toss winner elected to bat, they batted first, so chasing team is the other team
        # If winner is team that batted second, chasing won
        chasing_won = (elected_to_bat and winner != toss.get("winner")) or (not elected_to_bat and winner == toss.get("winner"))
        
        learn_venue_bias(
            venue_name=venue_name,
            format_name=format_name,
            innings_complete=True,
            chasing_won=chasing_won,
            first_innings_score=first_innings_score,
            second_innings_score=second_innings_score,
        )
        record_global_match_completion(
            match_id=request.match_id,
            format_name=format_name,
            first_innings_score=first_innings_score,
        )
    except Exception:
        pass  # Silent fail - venue learning is non-critical


def persist_memory_snapshot(request: CalculateOddsRequest, graph_state: GraphState) -> dict[str, Any]:
    memory_context = graph_state.get("memory_context") or {}
    recent_events = list(memory_context.get("recent_events") or [])
    recent_reprices = list(memory_context.get("recent_reprices") or [])
    recent_suspensions = list(memory_context.get("recent_suspensions") or [])
    timestamp = datetime.now(timezone.utc).isoformat()
    
    # Pitch learnings: capture first innings data for second innings use
    pitch_learnings = dict(memory_context.get("pitch_learnings") or {})
    innings = int(getattr(request.match_state, "inning", 0) or 0)
    balls_remaining = graph_state.get("balls_remaining")
    
    if innings == 1 and balls_remaining is not None and balls_remaining == 0:
        # First innings complete - capture learnings
        runs_total = int(getattr(request.match_state, "runs_total", 0) or 0)
        wickets_total = int(getattr(request.match_state, "wickets_total", 0) or 0)
        pitch_learnings = {
            "first_innings_score": runs_total,
            "first_innings_wickets": wickets_total,
            "par_score_adjustment": runs_total - 165,  # Deviation from T20 par
            "pitch_pace": "slow" if runs_total < 150 else "fast" if runs_total > 180 else "medium",
            "captured_at": timestamp,
        }

    recent_events.append(
        {
            "event_type": request.trigger.event_type,
            "severity": request.trigger.severity,
            "over": request.match_state.over,
            "ball_in_over": request.match_state.ball_in_over,
            "runs_total": request.match_state.runs_total,
            "wickets_total": request.match_state.wickets_total,
            "momentum_index": request.match_state.momentum_index,
            "event_time": request.match_state.event_time or timestamp,
        }
    )

    recent_reprices.append(
        {
            "state_version": request.state_version,
            "event_seq": request.event_seq,
            "probability_team1": graph_state.get("match_winner_probability_team1"),
            "model_name": graph_state.get("model_name"),
            "fallback_used": graph_state.get("fallback_used", True),
            "reviewer_decision": graph_state.get("reviewer_decision"),
            "reviewer_flags": graph_state.get("reviewer_flags", []),
            "generator_attempt": int(graph_state.get("generator_attempt", 1) or 1),
            "latency_ms": int((time.perf_counter() - graph_state.get("started_at", time.perf_counter())) * 1000),
            "event_type": request.trigger.event_type,
            "timestamp": timestamp,
            "fancy_flags": graph_state.get("fancy_flags", []),
        }
    )

    suspension_reason = request.match_state.market_state.get("suspension_reason")
    if suspension_reason:
        recent_suspensions.append({"reason": suspension_reason, "timestamp": timestamp})

    return CRICKET_MEMORY.save(
        match_id=request.match_id,
        state_version=request.state_version,
        event_seq=request.event_seq,
        snapshot={
            "recent_events": recent_events,
            "recent_reprices": recent_reprices,
            "recent_suspensions": recent_suspensions,
            "prior_probability_team1": graph_state.get("match_winner_probability_team1"),
            "match_dossier": (graph_state.get("memory_context") or {}).get("match_dossier", {}),
            "pitch_learnings": pitch_learnings,
            "pre_match_context_pack": (graph_state.get("memory_context") or {}).get("pre_match_context_pack", {}),
            "last_reasoning": graph_state.get("reasoning"),
            "last_fancy_projection": {
                fancy_projection_key(
                    market["market_key"],
                    float(market.get("projected_line")),
                ): market.get("projected_line")
                for market in graph_state.get("fancy_markets", [])
                if market.get("projected_line") and is_fancy_over_selection(market)
            },
            "last_fancy_fair_projection": {
                fancy_projection_key(
                    market["market_key"],
                    float(market.get("projected_line")),
                ): (market.get("trace_meta") or {}).get("fair_projected_line")
                for market in graph_state.get("fancy_markets", [])
                if (market.get("trace_meta") or {}).get("fair_projected_line") and is_fancy_over_selection(market)
            },
            "last_state_version": request.state_version,
            "last_event_seq": request.event_seq,
        },
    )


def reviewer_route(state: GraphState) -> str:
    decision = state.get("reviewer_decision", "approve")
    if decision == "reject_and_retry":
        return "retry_generator"
    if decision == "reject_and_keep_suspended":
        return "emit_keep_suspended"
    return "emit_approved"


def summarize_fancy_markets(fancy_markets: list[dict[str, Any]]) -> dict[str, Any]:
    summary: dict[str, Any] = {}
    for market in fancy_markets:
        selection_key = str(market.get("selection_key") or "")
        if not selection_key.startswith("over_"):
            continue
        market_key = market.get("market_key")
        trace_meta = market.get("trace_meta") or {}
        projected_line = market.get("projected_line")
        if not market_key or not projected_line:
            continue
        summary[f"{market_key}::{projected_line}"] = {
            "window_label": market.get("window_label"),
            "projected_line": projected_line,
            "fair_projected_line": trace_meta.get("fair_projected_line"),
            "trap_projected_line": trace_meta.get("trap_projected_line"),
            "raw_trap_projected_line": trace_meta.get("raw_trap_projected_line"),
            "trap_line_delta": trace_meta.get("trap_line_delta"),
            "raw_trap_line_delta": trace_meta.get("raw_trap_line_delta"),
            "active_fancy_playbooks": trace_meta.get("active_fancy_playbooks", []),
            "fancy_shading_summary": trace_meta.get("fancy_shading_summary", {}),
        }
    return summary


def is_fancy_over_selection(market: dict[str, Any]) -> bool:
    return str(market.get("selection_key") or "").startswith("over_")


def attach_market_intel(state: GraphState, markets: list[dict[str, Any]]) -> list[dict[str, Any]]:
    fair_probability = state.get("fair_probability_team1")
    display_probability = state.get("display_probability_team1")
    approved_probability = state.get("approved_probability_team1")
    active_playbooks = state.get("active_playbooks", [])
    shading_magnitude = state.get("shading_magnitude", 0.0)
    bookmaker_summary = state.get("bookmaker_summary", {})
    bookmaker_node_latency_ms = state.get("bookmaker_node_latency_ms", 0)

    enriched: list[dict[str, Any]] = []
    for market in markets:
        market_key = market.get("market_key")
        selection_key = market.get("selection_key")
        if market_key != "match_winner" or selection_key not in {"team1", "team2"}:
            enriched.append(market)
            continue

        if selection_key == "team1":
            fair_selection_probability = fair_probability
            display_selection_probability = display_probability
            approved_selection_probability = approved_probability
        else:
            fair_selection_probability = (
                clamp_probability(1.0 - fair_probability) if fair_probability is not None else None
            )
            display_selection_probability = (
                clamp_probability(1.0 - display_probability) if display_probability is not None else None
            )
            approved_selection_probability = (
                clamp_probability(1.0 - approved_probability) if approved_probability is not None else None
            )

        enriched.append(
            {
                **market,
                "trace_meta": {
                    **(market.get("trace_meta") or {}),
                    "fair_probability": fair_selection_probability,
                    "display_probability": display_selection_probability,
                    "approved_probability": approved_selection_probability,
                    "shading_magnitude": shading_magnitude,
                    "active_playbooks": active_playbooks,
                    "bookmaker_summary": bookmaker_summary,
                    "bookmaker_node_latency_ms": bookmaker_node_latency_ms,
                },
            }
        )

    return enriched


GRAPH = build_graph()
