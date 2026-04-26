from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache


@dataclass(frozen=True)
class EnginePolicy:
    mode: str
    context_penalty_unknown_batting_side: float
    context_penalty_missing_over: float
    context_penalty_missing_current_rr: float
    context_penalty_missing_required_rr: float
    context_penalty_missing_winner_anchor: float
    context_penalty_innings_complete: float
    context_penalty_cap: float
    bookmaker_max_absolute_skew: float
    bookmaker_max_volatility_skew: float
    bookmaker_max_critical_skew: float
    bookmaker_dynamic_necessity_cap: float
    live_expiry_multiplier: float
    fancy_expiry_multiplier: float


def _float_env(name: str, default: str) -> float:
    try:
        return float(os.getenv(name, default))
    except ValueError:
        return float(default)


@lru_cache(maxsize=1)
def get_engine_policy() -> EnginePolicy:
    mode = (os.getenv("CRICKET_ENGINE_POLICY_MODE") or "strict").strip().lower()
    return EnginePolicy(
        mode=mode,
        context_penalty_unknown_batting_side=_float_env("CRICKET_CTX_PENALTY_UNKNOWN_BATTING", "0.08"),
        context_penalty_missing_over=_float_env("CRICKET_CTX_PENALTY_MISSING_OVER", "0.05"),
        context_penalty_missing_current_rr=_float_env("CRICKET_CTX_PENALTY_MISSING_CURRENT_RR", "0.04"),
        context_penalty_missing_required_rr=_float_env("CRICKET_CTX_PENALTY_MISSING_REQUIRED_RR", "0.05"),
        context_penalty_missing_winner_anchor=_float_env("CRICKET_CTX_PENALTY_MISSING_WINNER_ANCHOR", "0.03"),
        context_penalty_innings_complete=_float_env("CRICKET_CTX_PENALTY_INNINGS_COMPLETE", "0.10"),
        context_penalty_cap=_float_env("CRICKET_CTX_PENALTY_CAP", "0.18"),
        bookmaker_max_absolute_skew=_float_env("CRICKET_BOOKMAKER_MAX_ABSOLUTE_SKEW", "0.03"),
        bookmaker_max_volatility_skew=_float_env("CRICKET_BOOKMAKER_MAX_VOLATILITY_SKEW", "0.08"),
        bookmaker_max_critical_skew=_float_env("CRICKET_BOOKMAKER_MAX_CRITICAL_SKEW", "0.18"),
        bookmaker_dynamic_necessity_cap=_float_env("CRICKET_BOOKMAKER_DYNAMIC_NECESSITY_CAP", "0.05"),
        live_expiry_multiplier=_float_env("CRICKET_LIVE_EXPIRY_MULTIPLIER", "0.9"),
        fancy_expiry_multiplier=_float_env("CRICKET_FANCY_EXPIRY_MULTIPLIER", "0.9"),
    )
