from __future__ import annotations

import json
import os
import time
import uuid
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, TypedDict

from langgraph.graph import END, StateGraph
from pydantic import BaseModel, ConfigDict, Field

try:
    from langgraph.checkpoint.memory import InMemorySaver as FootballMemorySaver
except Exception:  # pragma: no cover
    try:
        from langgraph.checkpoint.memory import MemorySaver as FootballMemorySaver
    except Exception:  # pragma: no cover
        FootballMemorySaver = None

try:
    from langchain_google_genai import ChatGoogleGenerativeAI
except Exception:  # pragma: no cover
    ChatGoogleGenerativeAI = None


class FootballTriggerPayload(BaseModel):
    event_type: str
    severity: str
    reason: str


class FootballReferenceOddsRow(BaseModel):
    market_key: str
    selection_key: str
    label: str
    price: str | float | int
    bookmaker: str | None = None


class FootballCurrentOddsRow(BaseModel):
    market_key: str
    selection_key: str
    label: str
    price: str | float | int


class FootballMatchState(BaseModel):
    model_config = ConfigDict(extra="allow")

    match_id: str
    provider: str | None = None
    sport: str
    state_version: int
    team1: str
    team2: str
    score: dict[str, Any] = Field(default_factory=dict)
    raw_data: dict[str, Any] = Field(default_factory=dict)
    market_state: dict[str, Any] = Field(default_factory=dict)
    elapsed_minute: int | None = None
    stoppage_minute: int = 0
    home_score: int = 0
    away_score: int = 0
    red_cards_home: int = 0
    red_cards_away: int = 0
    home_corners: int = 0
    away_corners: int = 0
    home_shots_on_target: int = 0
    away_shots_on_target: int = 0
    tempo_index: float | None = None


class CalculateFootballOddsRequest(BaseModel):
    match_id: str
    state_version: int
    trigger: FootballTriggerPayload
    match_state: FootballMatchState
    current_odds: list[FootballCurrentOddsRow] = Field(default_factory=list)
    provider_reference_odds: list[FootballReferenceOddsRow] = Field(default_factory=list)
    strategy_mode: str = "hybrid"


class FootballEngineMarket(BaseModel):
    market_key: str
    selection_key: str
    label: str
    price: str
    bet_type: str
    is_suspended: bool = False
    reason: str | None = None
    confidence_score: float
    valid_for_ms: int


class CalculateFootballOddsResponse(BaseModel):
    match_id: str
    state_version: int
    engine_trace_id: str
    latency_ms: int
    model: str
    strategy_mode: str
    markets: list[FootballEngineMarket]


class FootballGraphState(TypedDict, total=False):
    request: CalculateFootballOddsRequest
    engine_trace_id: str
    started_at: float
    baseline_home_probability: float
    adjusted_home_probability: float
    prior_home_probability: float | None
    llm_home_probability: float | None
    llm_confidence: float
    model_name: str
    markets: list[dict[str, Any]]


DEFAULT_MODEL = os.getenv("GOOGLE_GENAI_MODEL", "gemini-2.0-flash-lite")
DEFAULT_MARGIN = Decimal(os.getenv("FOOTBALL_AI_ENGINE_HOUSE_MARGIN", "0.05"))


def build_football_graph() -> Any:
    graph = StateGraph(FootballGraphState)
    graph.add_node("context_analyzer", football_context_analyzer_node)
    graph.add_node("odds_generator", football_odds_generator_node)
    graph.add_node("risk_margin_manager", football_risk_margin_manager_node)
    graph.set_entry_point("context_analyzer")
    graph.add_edge("context_analyzer", "odds_generator")
    graph.add_edge("odds_generator", "risk_margin_manager")
    graph.add_edge("risk_margin_manager", END)
    if FootballMemorySaver is not None:
        return graph.compile(checkpointer=FootballMemorySaver())
    return graph.compile()


def football_context_analyzer_node(state: FootballGraphState) -> FootballGraphState:
    request = state["request"]
    baseline = provider_baseline_probability(request.provider_reference_odds)
    if baseline is None:
        baseline = current_board_probability(request.current_odds)
    if baseline is None:
        baseline = scoreline_baseline_probability(request.match_state)

    prior_probability = state.get("adjusted_home_probability")
    if prior_probability is not None:
        baseline = clamp((baseline * 0.72) + (prior_probability * 0.28))

    adjusted = adjust_for_match_context(baseline, request.match_state, request.trigger)

    return {
        **state,
        "baseline_home_probability": baseline,
        "prior_home_probability": prior_probability,
        "adjusted_home_probability": adjusted,
    }


def football_odds_generator_node(state: FootballGraphState) -> FootballGraphState:
    request = state["request"]
    default_probability = state["adjusted_home_probability"]

    llm_probability: float | None = None
    llm_confidence = 0.42
    model_name = "deterministic-football-fallback"

    if request.strategy_mode != "provider_only" and ChatGoogleGenerativeAI is not None and os.getenv("GOOGLE_API_KEY"):
        model_name = DEFAULT_MODEL
        try:
            llm_probability, llm_confidence = infer_football_probability_with_llm(request, default_probability)
        except (json.JSONDecodeError, ValueError):
            llm_probability = None
        except Exception:  # pragma: no cover
            llm_probability = None

    resolved_probability = clamp(llm_probability if llm_probability is not None else default_probability)

    return {
        **state,
        "llm_home_probability": llm_probability,
        "llm_confidence": llm_confidence,
        "model_name": model_name,
        "adjusted_home_probability": resolved_probability,
    }


def football_risk_margin_manager_node(state: FootballGraphState) -> FootballGraphState:
    request = state["request"]
    match_state = request.match_state
    probability_home = state["adjusted_home_probability"]
    confidence = state["llm_confidence"]

    markets = [
        *match_winner_market(match_state.team1, match_state.team2, probability_home, confidence),
        *totals_market(match_state, confidence),
        *btts_market(match_state, confidence),
    ]

    return {
        **state,
        "markets": markets,
    }


def run_football_graph(request: CalculateFootballOddsRequest) -> CalculateFootballOddsResponse:
    started_at = time.perf_counter()
    engine_trace_id = str(uuid.uuid4())
    state = FOOTBALL_GRAPH.invoke(
        {"request": request, "started_at": started_at, "engine_trace_id": engine_trace_id},
        config={"configurable": {"thread_id": request.match_id}},
    )
    latency_ms = int((time.perf_counter() - started_at) * 1000)

    return CalculateFootballOddsResponse(
        match_id=request.match_id,
        state_version=request.state_version,
        engine_trace_id=engine_trace_id,
        latency_ms=latency_ms,
        model=state.get("model_name", "deterministic-football-fallback"),
        strategy_mode=request.strategy_mode,
        markets=[FootballEngineMarket(**market) for market in state["markets"]],
    )


def provider_baseline_probability(rows: list[FootballReferenceOddsRow]) -> float | None:
    home = next((row for row in rows if row.market_key == "match_winner" and row.selection_key in {"team1", "home"}), None)
    away = next((row for row in rows if row.market_key == "match_winner" and row.selection_key in {"team2", "away"}), None)
    if not home or not away:
        return None

    home_prob = implied_probability(home.price)
    away_prob = implied_probability(away.price)
    total = home_prob + away_prob
    if total <= 0:
        return None
    return clamp(home_prob / total)


def current_board_probability(rows: list[FootballCurrentOddsRow]) -> float | None:
    home = next((row for row in rows if row.market_key == "match_winner" and row.selection_key in {"team1", "home"}), None)
    away = next((row for row in rows if row.market_key == "match_winner" and row.selection_key in {"team2", "away"}), None)
    if not home or not away:
        return None

    home_prob = implied_probability(home.price)
    away_prob = implied_probability(away.price)
    total = home_prob + away_prob
    if total <= 0:
        return None
    return clamp(home_prob / total)


def scoreline_baseline_probability(match_state: FootballMatchState) -> float:
    home_goals = score_value(match_state, "home")
    away_goals = score_value(match_state, "away")
    elapsed = match_state.elapsed_minute or fixture_elapsed(match_state.raw_data)
    delta = (home_goals - away_goals) * 0.16
    time_pressure = min(max(elapsed / 90.0, 0.0), 1.0) * 0.08
    return clamp(0.5 + delta + (time_pressure if home_goals > away_goals else -time_pressure if away_goals > home_goals else 0.0))


def adjust_for_match_context(baseline: float, match_state: FootballMatchState, trigger: FootballTriggerPayload) -> float:
    elapsed = match_state.elapsed_minute or fixture_elapsed(match_state.raw_data)
    home_goals = score_value(match_state, "home")
    away_goals = score_value(match_state, "away")
    red_home = match_state.red_cards_home or infer_red_cards(match_state.raw_data, "home")
    red_away = match_state.red_cards_away or infer_red_cards(match_state.raw_data, "away")
    tempo = match_state.tempo_index or 0.0
    corners_delta = (match_state.home_corners - match_state.away_corners) * 0.006
    shots_delta = (match_state.home_shots_on_target - match_state.away_shots_on_target) * 0.022
    stoppage = match_state.stoppage_minute or 0

    probability = baseline
    probability += (home_goals - away_goals) * 0.04
    probability -= red_home * 0.08
    probability += red_away * 0.08
    probability += tempo * 0.015
    probability += corners_delta
    probability += shots_delta
    probability += min(stoppage, 8) * 0.002

    if trigger.reason == "goal_scored":
        probability += 0.03 if home_goals > away_goals else -0.03 if away_goals > home_goals else 0.0
    if trigger.reason == "red_card":
        probability -= 0.08 if red_home > red_away else -0.08 if red_away > red_home else 0.0
    if trigger.reason in {"var_review", "penalty_review"}:
        probability *= 0.995
    if elapsed >= 75:
        probability += (home_goals - away_goals) * 0.03

    return clamp(probability)


def infer_football_probability_with_llm(request: CalculateFootballOddsRequest, default_probability: float) -> tuple[float, float]:
    model = ChatGoogleGenerativeAI(model=DEFAULT_MODEL, temperature=0.1)
    prompt = {
        "match_id": request.match_id,
        "strategy_mode": request.strategy_mode,
        "teams": [request.match_state.team1, request.match_state.team2],
        "score": request.match_state.score,
        "elapsed_minute": request.match_state.elapsed_minute or fixture_elapsed(request.match_state.raw_data),
        "trigger": request.trigger.model_dump(),
        "provider_reference_odds": [row.model_dump() for row in request.provider_reference_odds[:10]],
        "default_probability_home": round(default_probability, 6),
    }
    response = model.invoke(
        "Return strict JSON with keys probability_home and confidence. "
        "Probability_home must be a float between 0 and 1.\n"
        f"{json.dumps(prompt)}"
    )
    content = getattr(response, "content", response)
    if isinstance(content, list):
        content = "".join(str(part) for part in content)
    data = extract_json_object(str(content))
    probability = clamp(float(data["probability_home"]))
    confidence = clamp(float(data.get("confidence", 0.55)), lower=0.1, upper=0.99)
    return probability, confidence


def match_winner_market(team1: str, team2: str, probability_home: float, confidence: float) -> list[dict[str, Any]]:
    home_price = apply_margin(probability_home)
    away_price = apply_margin(1.0 - probability_home)
    return [
        market_row("match_winner", "team1", team1, home_price, confidence),
        market_row("match_winner", "team2", team2, away_price, confidence),
    ]


def totals_market(match_state: FootballMatchState, confidence: float) -> list[dict[str, Any]]:
    home_goals = score_value(match_state, "home")
    away_goals = score_value(match_state, "away")
    total_goals = home_goals + away_goals
    elapsed = match_state.elapsed_minute or fixture_elapsed(match_state.raw_data)
    line = 2.5

    over_probability = clamp(0.50 + ((total_goals - 2) * 0.08) + ((elapsed - 45) / 180.0))
    under_probability = clamp(1.0 - over_probability)

    return [
        market_row("over_under", "over_2_5", f"Over {line}", apply_margin(over_probability), confidence - 0.04),
        market_row("over_under", "under_2_5", f"Under {line}", apply_margin(under_probability), confidence - 0.04),
    ]


def btts_market(match_state: FootballMatchState, confidence: float) -> list[dict[str, Any]]:
    home_goals = score_value(match_state, "home")
    away_goals = score_value(match_state, "away")
    elapsed = match_state.elapsed_minute or fixture_elapsed(match_state.raw_data)

    yes_probability = 0.42
    if home_goals > 0 and away_goals > 0:
        yes_probability = 0.9
    elif home_goals > 0 or away_goals > 0:
        yes_probability = 0.58 + min(elapsed / 180.0, 0.18)
    elif elapsed > 65:
        yes_probability = 0.33

    yes_probability = clamp(yes_probability)
    no_probability = clamp(1.0 - yes_probability)

    return [
        market_row("btts", "yes", "Yes", apply_margin(yes_probability), confidence - 0.06),
        market_row("btts", "no", "No", apply_margin(no_probability), confidence - 0.06),
    ]


def market_row(market_key: str, selection_key: str, label: str, price: Decimal, confidence: float) -> dict[str, Any]:
    return {
        "market_key": market_key,
        "selection_key": selection_key,
        "label": label,
        "price": decimal_str(price),
        "bet_type": market_key,
        "is_suspended": False,
        "reason": None,
        "confidence_score": round(clamp(confidence, lower=0.1, upper=0.99), 4),
        "valid_for_ms": 4500,
    }


def implied_probability(price: str | float | int) -> float:
    value = max(float(price), 1.01)
    return 1.0 / value


def apply_margin(probability: float) -> Decimal:
    safe = clamp(probability, lower=0.05, upper=0.95)
    decimal_probability = Decimal(str(safe))
    raw_price = Decimal("1") / decimal_probability
    margined = raw_price * (Decimal("1") - DEFAULT_MARGIN)
    return margined.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def score_value(match_state: FootballMatchState, side: str) -> int:
    direct = match_state.home_score if side == "home" else match_state.away_score
    if direct is not None:
        return int(direct or 0)

    score = match_state.score or {}
    goals = score.get("goals") if isinstance(score, dict) else None
    if isinstance(goals, dict) and goals.get(side) is not None:
        return int(goals.get(side) or 0)
    raw_goals = match_state.raw_data.get("goals") if isinstance(match_state.raw_data, dict) else None
    if isinstance(raw_goals, dict) and raw_goals.get(side) is not None:
        return int(raw_goals.get(side) or 0)
    return 0


def fixture_elapsed(raw_data: dict[str, Any]) -> int:
    fixture = raw_data.get("fixture") if isinstance(raw_data, dict) else None
    status = fixture.get("status") if isinstance(fixture, dict) else None
    elapsed = status.get("elapsed") if isinstance(status, dict) else None
    return int(elapsed or 0)


def infer_red_cards(raw_data: dict[str, Any], side: str) -> int:
    cards = raw_data.get("cards") if isinstance(raw_data, dict) else None
    if isinstance(cards, dict):
        team_cards = cards.get(side)
        if isinstance(team_cards, dict):
            return int(team_cards.get("red") or 0)
    return 0


def extract_json_object(text: str) -> dict[str, Any]:
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("no_json_object")
    return json.loads(text[start : end + 1])


def clamp(value: float, lower: float = 0.01, upper: float = 0.99) -> float:
    return max(lower, min(upper, value))


def decimal_str(value: Decimal) -> str:
    return format(value, "f")


FOOTBALL_GRAPH = build_football_graph()
