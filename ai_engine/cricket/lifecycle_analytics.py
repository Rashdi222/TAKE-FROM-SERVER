from __future__ import annotations

from collections import Counter
from statistics import mean
from typing import Any


def summarize_market_lifecycle(
    *,
    markets: list[dict[str, Any]],
    fancy_markets: list[dict[str, Any]],
    reviewer_decision: str,
    active_playbooks: list[str],
    recent_reprices: list[dict[str, Any]] | None = None,
    recent_events: list[dict[str, Any]] | None = None,
    latency_ms: int = 0,
) -> dict[str, Any]:
    recent_reprices = list(recent_reprices or [])
    recent_events = list(recent_events or [])
    combined = [*markets, *fancy_markets]
    valid_windows = [int(m.get("valid_for_ms") or 0) for m in combined if int(m.get("valid_for_ms") or 0) > 0]
    confidence_scores = [float(m.get("confidence_score") or 0.0) for m in combined]
    family_counter = Counter(
        str(m.get("market_family") or m.get("market_key") or "unknown")
        for m in combined
    )
    suspended_count = sum(1 for m in combined if m.get("is_suspended") is True)
    fast_expiring_count = sum(1 for window in valid_windows if window <= 1500)
    recent_event_types = [str((event or {}).get("event_type") or "unknown") for event in recent_events[-6:]]
    recent_reprice_decisions = [
        str((entry or {}).get("reviewer_decision") or "unknown")
        for entry in recent_reprices[-8:]
    ]
    fallback_count = sum(1 for entry in recent_reprices[-8:] if (entry or {}).get("fallback_used"))

    return {
        "quote_count": len(combined),
        "core_quote_count": len(markets),
        "fancy_quote_count": len(fancy_markets),
        "suspended_quote_count": suspended_count,
        "fast_expiring_quote_count": fast_expiring_count,
        "reviewer_decision": reviewer_decision,
        "avg_confidence": round(mean(confidence_scores), 4) if confidence_scores else 0.0,
        "min_valid_for_ms": min(valid_windows) if valid_windows else 0,
        "max_valid_for_ms": max(valid_windows) if valid_windows else 0,
        "market_families": dict(family_counter),
        "active_playbooks": list(active_playbooks),
        "recent_event_types": recent_event_types,
        "recent_reprice_decisions": recent_reprice_decisions,
        "fallback_reprice_count": fallback_count,
        "latency_ms": int(latency_ms or 0),
    }
