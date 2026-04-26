from __future__ import annotations

import json
from typing import Any
from urllib import error as urllib_error
from urllib import request as urllib_request

from pydantic import BaseModel, Field

from cricket.context_manager import context_manager_node
from cricket.memory import CricketMemoryStore
from cricket.orchestrator import MatchState, RuntimeConfig, TriggerPayload


SOURCE_REFRESH_MEMORY = CricketMemoryStore()


class SourceRefreshRequest(BaseModel):
    match_id: str
    state_version: int = 0
    event_seq: int = 0
    trigger: TriggerPayload
    match_state: MatchState
    current_odds: list[dict[str, Any]] = Field(default_factory=list)
    runtime_config: RuntimeConfig | None = None
    current_policy: dict[str, Any] = Field(default_factory=dict)
    risk_flags: list[str] = Field(default_factory=list)


class SourceRefreshResponse(BaseModel):
    match_id: str
    refresh_now: bool
    recommended_interval_seconds: int
    confidence: float
    reason: str
    requires_manual_review: bool = False
    ai_used: bool = False
    model: str = "deterministic-source-policy"
    risk_flags: list[str] = Field(default_factory=list)


def calculate_source_refresh_policy(payload: SourceRefreshRequest) -> SourceRefreshResponse:
    runtime_config = payload.runtime_config or RuntimeConfig()
    initial_state = {"request": payload}
    context = context_manager_node(
        initial_state,
        memory_store=SOURCE_REFRESH_MEMORY,
        runtime_config_resolver=lambda _request: runtime_config,
    )

    baseline = _deterministic_policy(payload, context)
    ai_used = False
    reason = baseline["reason"]
    confidence = baseline["confidence"]
    requires_manual_review = baseline["requires_manual_review"]

    if runtime_config.llm_enabled and runtime_config.api_key and runtime_config.model and baseline["needs_ai_review"]:
        try:
            ai_reason, ai_confidence, ai_manual_review = _llm_policy_overlay(payload, context, runtime_config, baseline)
            reason = ai_reason
            confidence = ai_confidence
            requires_manual_review = ai_manual_review
            ai_used = True
        except Exception:
            ai_used = False

    return SourceRefreshResponse(
        match_id=payload.match_id,
        refresh_now=baseline["refresh_now"],
        recommended_interval_seconds=baseline["recommended_interval_seconds"],
        confidence=confidence,
        reason=reason,
        requires_manual_review=requires_manual_review,
        ai_used=ai_used,
        model=runtime_config.model if ai_used and runtime_config.model else "deterministic-source-policy",
        risk_flags=baseline["risk_flags"],
    )


def _deterministic_policy(payload: SourceRefreshRequest, context: dict[str, Any]) -> dict[str, Any]:
    match_state = payload.match_state
    current_policy = payload.current_policy or {}
    risk_flags = list(payload.risk_flags or [])
    status = str(getattr(match_state, "raw_data", {}).get("status") or payload.current_policy.get("status") or "").lower()
    status = status or "live" if str(match_state.event_type or "").strip() else status
    balls_remaining = int(context.get("balls_remaining") or 0)
    over_number = float(context.get("over_number") or 0.0)
    current_interval = int(current_policy.get("recommended_poll_interval_seconds") or 0)

    refresh_now = False
    recommended_interval_seconds = current_interval if current_interval > 0 else 600
    reason = "Match is scheduled. Keep conservative source polling."
    confidence = 0.72
    requires_manual_review = False

    if status == "live":
        recommended_interval_seconds = 5
        reason = "Match is live. Keep source odds fresh while score context evolves."
        confidence = 0.78

    if balls_remaining <= 18 and status == "live":
        recommended_interval_seconds = 3
        reason = "End-game pressure is high. Tighten source refresh to keep prices aligned."
        confidence = 0.84

    if "score_context_stale" in risk_flags:
        refresh_now = True
        recommended_interval_seconds = min(recommended_interval_seconds, 5)
        reason = "Score context is stale against the current board. Re-fetch source odds now."
        confidence = 0.9

    if "live_without_in_play" in risk_flags:
        refresh_now = True
        recommended_interval_seconds = 5
        reason = "Match is live but in-play state is not aligned. Re-check source availability immediately."
        confidence = 0.88

    if "suspended_markets" in risk_flags:
        recommended_interval_seconds = max(recommended_interval_seconds, 20)
        reason = "Markets are suspended. Slow the source unless score context changes again."
        confidence = 0.81

    if "status_drift" in risk_flags:
        refresh_now = True
        requires_manual_review = True
        recommended_interval_seconds = min(recommended_interval_seconds, 15)
        reason = "Status drift was detected. Refresh source odds and keep this match under operator review."
        confidence = 0.91

    if over_number <= 2.0 and status == "live":
        recommended_interval_seconds = min(recommended_interval_seconds, 5)

    needs_ai_review = any(flag in {"score_context_stale", "status_drift", "live_without_in_play"} for flag in risk_flags)

    return {
        "refresh_now": refresh_now,
        "recommended_interval_seconds": max(recommended_interval_seconds, 0),
        "reason": reason,
        "confidence": confidence,
        "requires_manual_review": requires_manual_review,
        "needs_ai_review": needs_ai_review,
        "risk_flags": risk_flags,
    }


def _llm_policy_overlay(
    payload: SourceRefreshRequest,
    context: dict[str, Any],
    runtime_config: RuntimeConfig,
    baseline: dict[str, Any],
) -> tuple[str, float, bool]:
    prompt = {
        "task": "advise_source_refresh",
        "match_id": payload.match_id,
        "trigger": payload.trigger.model_dump(),
        "current_policy": payload.current_policy,
        "risk_flags": baseline["risk_flags"],
        "baseline": {
            "refresh_now": baseline["refresh_now"],
            "recommended_interval_seconds": baseline["recommended_interval_seconds"],
            "reason": baseline["reason"],
        },
        "match_state": {
            "team1": payload.match_state.team1,
            "team2": payload.match_state.team2,
            "inning": payload.match_state.inning,
            "over": payload.match_state.over,
            "ball_in_over": payload.match_state.ball_in_over,
            "runs_total": payload.match_state.runs_total,
            "wickets_total": payload.match_state.wickets_total,
            "target_runs": payload.match_state.target_runs,
            "batting_team": payload.match_state.batting_team,
            "required_run_rate": payload.match_state.required_run_rate,
            "current_run_rate": payload.match_state.current_run_rate,
        },
        "history_summary": context.get("history_summary"),
    }

    body = {
        "model": runtime_config.model,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You advise source refresh cadence for live cricket odds ingestion. "
                    "Do not invent bookmaker prices. Return strict JSON only with keys "
                    "\"reason\", \"confidence\", and \"requires_manual_review\"."
                ),
            },
            {"role": "user", "content": json.dumps(prompt, separators=(",", ":"))},
        ],
        "temperature": 0.1,
        "max_tokens": 180,
    }

    text = _call_openrouter(body, runtime_config)
    parsed = json.loads(_extract_json_object(text))
    reason = str(parsed.get("reason") or baseline["reason"]).strip() or baseline["reason"]
    confidence = max(0.0, min(1.0, float(parsed.get("confidence", baseline["confidence"]))))
    requires_manual_review = bool(parsed.get("requires_manual_review", baseline["requires_manual_review"]))
    return reason, confidence, requires_manual_review


def _extract_json_object(text: str) -> str:
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("no_json_object_found")
    return text[start : end + 1]


def _call_openrouter(body: dict[str, Any], runtime_config: RuntimeConfig) -> str:
    request_obj = urllib_request.Request(
        "https://openrouter.ai/api/v1/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {runtime_config.api_key}",
            "HTTP-Referer": "https://sixerbat.com",
            "X-Title": "Sixerbat Source Refresh Policy",
        },
        method="POST",
    )

    timeout_seconds = max(runtime_config.request_timeout_ms, 500) / 1000.0

    try:
        with urllib_request.urlopen(request_obj, timeout=timeout_seconds) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib_error.HTTPError as exc:
        raise RuntimeError(f"openrouter_http_error:{exc.code}") from exc
    except urllib_error.URLError as exc:
        raise RuntimeError(f"openrouter_transport_error:{exc.reason}") from exc

    choices = payload.get("choices") or []
    message = choices[0].get("message") if choices else None
    content = message.get("content") if isinstance(message, dict) else None
    if not isinstance(content, str) or not content.strip():
        raise RuntimeError("openrouter_invalid_response")

    return content
