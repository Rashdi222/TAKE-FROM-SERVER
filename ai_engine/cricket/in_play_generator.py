from __future__ import annotations

import json
import time
from decimal import Decimal
from typing import Any
from urllib import error as urllib_error
from urllib import request as urllib_request

from cricket.risk_limits import clamp_probability, parse_float


# LLM Circuit Breaker State
_LLM_CIRCUIT_BREAKER = {
    "failure_count": 0,
    "last_failure_time": 0.0,
    "is_open": False,
    "cooldown_until": 0.0,
}
_CIRCUIT_FAILURE_THRESHOLD = 3
_CIRCUIT_COOLDOWN_SECONDS = 300  # 5 minutes


def _check_circuit_breaker() -> bool:
    """Check if circuit breaker is open (LLM calls disabled)."""
    now = time.time()
    if _LLM_CIRCUIT_BREAKER["is_open"]:
        if now >= _LLM_CIRCUIT_BREAKER["cooldown_until"]:
            # Reset circuit breaker after cooldown
            _LLM_CIRCUIT_BREAKER["is_open"] = False
            _LLM_CIRCUIT_BREAKER["failure_count"] = 0
            return False
        return True
    return False


def _record_llm_failure() -> None:
    """Record LLM failure and potentially open circuit breaker."""
    now = time.time()
    _LLM_CIRCUIT_BREAKER["failure_count"] += 1
    _LLM_CIRCUIT_BREAKER["last_failure_time"] = now
    
    if _LLM_CIRCUIT_BREAKER["failure_count"] >= _CIRCUIT_FAILURE_THRESHOLD:
        _LLM_CIRCUIT_BREAKER["is_open"] = True
        _LLM_CIRCUIT_BREAKER["cooldown_until"] = now + _CIRCUIT_COOLDOWN_SECONDS


def _record_llm_success() -> None:
    """Record LLM success and reset failure count."""
    _LLM_CIRCUIT_BREAKER["failure_count"] = 0


def in_play_generator_node(
    state: dict[str, Any],
    *,
    runtime_config_resolver: Any,
    llm_inference: Any,
) -> dict[str, Any]:
    request = state["request"]
    default_probability = state["context_probability_team1"]
    runtime_config = runtime_config_resolver(request)
    attempt = int(state.get("generator_attempt", 0))

    llm_probability: float | None = None
    llm_confidence = 0.45
    llm_error: str | None = None
    model_name = "deterministic-fallback"
    fallback_used = True
    llm_enabled = bool(runtime_config.llm_enabled)
    config_provider = runtime_config.config_provider
    context_quality_penalty = float(state.get("context_quality_penalty", 0.0) or 0.0)
    context_quality_flags = list(state.get("context_quality_flags") or [])

    if llm_enabled and runtime_config.api_key and runtime_config.model:
        model_name = runtime_config.model
        
        # Check circuit breaker
        if _check_circuit_breaker():
            llm_error = "llm_circuit_breaker_open"
            fallback_used = True
        else:
            # Check cache first
            from cricket.llm_cache import get_llm_cache
            cache = get_llm_cache()
            cached_response = cache.get(request.match_id, request.state_version)
            
            if cached_response is not None:
                llm_probability, llm_confidence = cached_response
                fallback_used = False
                _record_llm_success()
            else:
                try:
                    llm_probability, llm_confidence = llm_inference(state, runtime_config)
                    fallback_used = False
                    _record_llm_success()
                    # Store in cache
                    if llm_probability is not None:
                        cache.set(request.match_id, request.state_version, llm_probability, llm_confidence)
                except (json.JSONDecodeError, ValueError) as exc:
                    llm_error = f"llm_parse_error:{exc}"
                    _record_llm_failure()
                except RuntimeError as exc:
                    llm_error = f"llm_runtime_error:{exc}"
                    _record_llm_failure()
                except Exception as exc:  # pragma: no cover
                    llm_error = f"llm_runtime_error:{exc}"
                    _record_llm_failure()

    final_probability = clamp_probability(llm_probability if llm_probability is not None else default_probability)
    llm_confidence = max(0.2, llm_confidence - context_quality_penalty)
    if attempt > 0:
        correction_low = state.get("correction_low")
        correction_high = state.get("correction_high")
        if correction_low is not None:
            final_probability = max(final_probability, correction_low)
        if correction_high is not None:
            final_probability = min(final_probability, correction_high)
        llm_confidence = max(0.25, llm_confidence - 0.10)
        fallback_used = True if llm_probability is None else fallback_used

    return {
        **state,
        "llm_probability_team1": llm_probability,
        "llm_confidence": llm_confidence,
        "llm_error": llm_error,
        "raw_candidate_probability_team1": final_probability,
        "candidate_probability_team1": final_probability,
        "candidate_confidence": llm_confidence,
        "model_name": model_name,
        "config_provider": config_provider,
        "llm_enabled": llm_enabled,
        "fallback_used": fallback_used,
        "generator_attempt": attempt + 1,
        "reasoning": (
            f"{state.get('reasoning', '')} "
            f"context_penalty={context_quality_penalty:.3f} "
            f"context_quality_flags={','.join(context_quality_flags) if context_quality_flags else 'none'}"
        ).strip(),
    }


def infer_probability_with_llm(state: dict[str, Any], runtime_config: Any) -> tuple[float, float]:
    request = state["request"]

    prompt = {
        "match_id": request.match_id,
        "state_version": request.state_version,
        "trigger": request.trigger.model_dump(),
        "summary": {
            "team1": state["team1_name"],
            "team2": state["team2_name"],
            "batting_side": state["batting_side"],
            "runs_total": request.match_state.runs_total,
            "wickets_total": request.match_state.wickets_total,
            "target_runs": request.match_state.target_runs,
            "over": request.match_state.over,
            "balls_remaining": state["balls_remaining"],
            "current_run_rate": request.match_state.current_run_rate,
            "required_run_rate": request.match_state.required_run_rate,
            "momentum_index": request.match_state.momentum_index,
            "match_dossier": (state.get("memory_context") or {}).get("match_dossier", {}),
        },
        "baseline_probability_team1": round(state["context_probability_team1"], 6),
        "history_summary": state.get("history_summary"),
    }

    text = call_openrouter(prompt, runtime_config)
    payload = json.loads(extract_json_object(text))

    probability = clamp_probability(float(payload["probability_team1"]))
    confidence = max(0.0, min(1.0, float(payload.get("confidence", 0.6))))
    return probability, confidence


def resolved_runtime_config(request: Any) -> Any:
    return request.runtime_config


def margin_for_request(request: Any, default_margin: Decimal) -> Decimal:
    """Legacy wrapper — use margin_for_market instead."""
    return margin_for_market("match_winner", resolved_runtime_config(request))


def margin_for_market(market_type: str, runtime_config: Any) -> Decimal:
    """Return margin by market type and profile."""
    profile = (runtime_config.house_margin_profile or "standard").strip().lower() if runtime_config else "standard"
    
    base_margins = {
        "match_winner": {"tight": Decimal("0.03"), "aggressive": Decimal("0.05"), "standard": Decimal("0.04")},
        "over_under": {"tight": Decimal("0.04"), "aggressive": Decimal("0.06"), "standard": Decimal("0.05")},
        "over_under_ladder": {"tight": Decimal("0.05"), "aggressive": Decimal("0.07"), "standard": Decimal("0.06")},
        "in_play": {"tight": Decimal("0.08"), "aggressive": Decimal("0.12"), "standard": Decimal("0.10")},
        "fancy": {"tight": Decimal("0.10"), "aggressive": Decimal("0.14"), "standard": Decimal("0.12")},
    }
    
    margins = base_margins.get(market_type, base_margins["match_winner"])
    return margins.get(profile, margins["standard"])


def call_openrouter(prompt: dict[str, Any], runtime_config: Any) -> str:
    if not runtime_config.api_key or not runtime_config.model:
        raise RuntimeError("runtime_config_incomplete")

    body = {
        "model": runtime_config.model,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are repricing a live cricket market. Return strict JSON only with keys "
                    '"probability_team1" and "confidence". probability_team1 must be between 0.02 and 0.98. '
                    "confidence must be between 0.0 and 1.0."
                ),
            },
            {"role": "user", "content": json.dumps(prompt, separators=(",", ":"))},
        ],
        "temperature": 0.1,
        "max_tokens": 250,
    }

    request_obj = urllib_request.Request(
        "https://openrouter.ai/api/v1/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {runtime_config.api_key}",
            "HTTP-Referer": "https://sixerbat.com",
            "X-Title": "Sixerbat Live Cricket",
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


def extract_json_object(text: str) -> str:
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("no_json_object_found")
    return text[start : end + 1]
