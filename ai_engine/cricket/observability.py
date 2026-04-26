from __future__ import annotations

import os
import threading
from collections import Counter, deque
from datetime import datetime, timezone
from typing import Any

OUTLIER_JUMP_THRESHOLD = float(os.getenv("CRICKET_OUTLIER_JUMP_THRESHOLD", "0.16"))
RETRY_STORM_THRESHOLD = int(os.getenv("CRICKET_RETRY_STORM_THRESHOLD", "4"))
WINDOW_SECONDS = int(os.getenv("CRICKET_OBSERVABILITY_WINDOW_SECONDS", "600"))


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _to_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except Exception:
        return None


class CricketObservabilityStore:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._entries_by_match: dict[str, deque[dict[str, Any]]] = {}
        self._last_probability: dict[str, float] = {}

    def record(
        self,
        *,
        match_id: str,
        timestamp: str,
        latency_ms: int,
        reviewer_decision: str,
        reviewer_flags: list[str] | None = None,
        suspension_reason: str | None = None,
        probability_team1: float | None = None,
        generator_attempt: int = 1,
    ) -> None:
        reviewer_flags = list(reviewer_flags or [])
        now_dt = _to_dt(timestamp) or _utc_now()
        entry: dict[str, Any] = {
            "timestamp": now_dt.isoformat(),
            "latency_ms": int(latency_ms or 0),
            "reviewer_decision": str(reviewer_decision or "unknown"),
            "reviewer_flags": reviewer_flags,
            "suspension_reason": suspension_reason,
            "generator_attempt": int(generator_attempt or 1),
            "probability_team1": probability_team1,
            "probability_jump": 0.0,
            "outlier_jump": False,
            "retry_like": False,
        }

        with self._lock:
            previous = self._last_probability.get(match_id)
            if probability_team1 is not None:
                if previous is not None:
                    jump = abs(float(probability_team1) - previous)
                    entry["probability_jump"] = round(jump, 6)
                    entry["outlier_jump"] = jump >= OUTLIER_JUMP_THRESHOLD
                self._last_probability[match_id] = float(probability_team1)

            retry_like = (
                entry["reviewer_decision"] == "reject_and_retry"
                or any("retry" in str(flag).lower() for flag in reviewer_flags)
                or int(entry["generator_attempt"]) >= 3
            )
            entry["retry_like"] = retry_like

            bucket = self._entries_by_match.setdefault(match_id, deque(maxlen=1200))
            bucket.append(entry)
            self._trim_locked(now_dt)

    def snapshot(
        self,
        *,
        match_id: str | None = None,
        memory_store: Any | None = None,
        match_registry: Any | None = None,
        global_monitor: Any | None = None,
    ) -> dict[str, Any]:
        now = _utc_now()
        with self._lock:
            self._trim_locked(now)
            if match_id:
                entries = list(self._entries_by_match.get(match_id, []))
                matches = {match_id: self._build_match_summary(match_id, entries, now, memory_store)}
            else:
                matches = {
                    key: self._build_match_summary(key, list(entries), now, memory_store)
                    for key, entries in self._entries_by_match.items()
                }

        active_ids = list(matches.keys())
        if match_registry is not None:
            try:
                active_ids = match_registry.active_match_ids()
            except Exception:
                pass

        health = {}
        if global_monitor is not None:
            try:
                health = global_monitor.health_snapshot()
            except Exception:
                health = {}

        return {
            "generated_at": now.isoformat(),
            "window_seconds": WINDOW_SECONDS,
            "outlier_jump_threshold": OUTLIER_JUMP_THRESHOLD,
            "retry_storm_threshold": RETRY_STORM_THRESHOLD,
            "active_match_ids": active_ids,
            "health": health,
            "match_count": len(matches),
            "matches": matches,
        }

    def _trim_locked(self, now: datetime) -> None:
        cutoff_ts = now.timestamp() - WINDOW_SECONDS
        stale_match_ids: list[str] = []
        for match_id, bucket in self._entries_by_match.items():
            while bucket and (_to_dt(bucket[0].get("timestamp")) or now).timestamp() < cutoff_ts:
                bucket.popleft()
            if not bucket:
                stale_match_ids.append(match_id)

        for match_id in stale_match_ids:
            self._entries_by_match.pop(match_id, None)
            self._last_probability.pop(match_id, None)

    def _build_match_summary(
        self,
        match_id: str,
        entries: list[dict[str, Any]],
        now: datetime,
        memory_store: Any | None,
    ) -> dict[str, Any]:
        if not entries:
            return {
                "match_id": match_id,
                "observations": 0,
                "avg_latency_ms": 0,
                "repricing_per_minute": 0.0,
                "suspension_reasons": {},
                "retry_storm": False,
                "retry_like_events": 0,
                "outlier_jump_count": 0,
                "max_probability_jump": 0.0,
                "latest_probability_team1": None,
                "last_event_age_seconds": None,
                "last_reprice_age_seconds": None,
            }

        latencies = [int(e.get("latency_ms") or 0) for e in entries]
        jumps = [float(e.get("probability_jump") or 0.0) for e in entries]
        outlier_count = sum(1 for e in entries if e.get("outlier_jump"))
        retry_like_events = sum(1 for e in entries if e.get("retry_like"))

        decision_counter = Counter(
            str(e.get("reviewer_decision") or "unknown")
            for e in entries
        )
        suspension_counter = Counter(
            str(e.get("suspension_reason"))
            for e in entries
            if e.get("suspension_reason")
        )

        horizon_minutes = max(WINDOW_SECONDS / 60.0, 1.0)
        repricing_per_minute = round(len(entries) / horizon_minutes, 3)

        last_probability = entries[-1].get("probability_team1")
        retry_storm = retry_like_events >= RETRY_STORM_THRESHOLD
        if decision_counter.get("reject_and_retry", 0) >= RETRY_STORM_THRESHOLD:
            retry_storm = True

        last_event_age_seconds = None
        last_reprice_age_seconds = None
        if memory_store is not None:
            try:
                memory = memory_store.load(match_id)
                recent_events = list((memory or {}).get("recent_events") or [])
                recent_reprices = list((memory or {}).get("recent_reprices") or [])
                if recent_events:
                    event_dt = _to_dt(recent_events[-1].get("event_time"))
                    if event_dt is not None:
                        last_event_age_seconds = int(max(0.0, (now - event_dt).total_seconds()))
                if recent_reprices:
                    rep_dt = _to_dt(recent_reprices[-1].get("timestamp"))
                    if rep_dt is not None:
                        last_reprice_age_seconds = int(max(0.0, (now - rep_dt).total_seconds()))
            except Exception:
                pass

        return {
            "match_id": match_id,
            "observations": len(entries),
            "avg_latency_ms": int(sum(latencies) / max(len(latencies), 1)),
            "repricing_per_minute": repricing_per_minute,
            "reviewer_decisions": dict(decision_counter),
            "suspension_reasons": dict(suspension_counter),
            "retry_storm": retry_storm,
            "retry_like_events": retry_like_events,
            "outlier_jump_count": outlier_count,
            "max_probability_jump": round(max(jumps) if jumps else 0.0, 6),
            "latest_probability_team1": last_probability,
            "last_event_age_seconds": last_event_age_seconds,
            "last_reprice_age_seconds": last_reprice_age_seconds,
        }
