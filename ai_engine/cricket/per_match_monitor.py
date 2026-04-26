from __future__ import annotations

import threading
import time
from datetime import datetime, timezone
from typing import Any


class PerMatchMonitor:
    """Monitors a single active match every 5 seconds."""

    CHECK_INTERVAL_SEC = 5
    STALE_DATA_THRESHOLD_SEC = 30
    MAX_PROBABILITY_DRIFT = 0.25  # 25% drift in 5s is suspicious

    def __init__(self, match_id: str, memory_store: Any, on_issue: Any) -> None:
        self._match_id = match_id
        self._memory_store = memory_store
        self._on_issue = on_issue  # callback(match_id, issue_type, detail)
        self._thread: threading.Thread | None = None
        self._stop_event = threading.Event()
        self._last_probability: float | None = None
        self._last_check_time: float = 0.0

    def start(self) -> None:
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._run, daemon=True, name=f"monitor:{self._match_id[:8]}")
        self._thread.start()

    def stop(self) -> None:
        self._stop_event.set()

    def _run(self) -> None:
        while not self._stop_event.wait(self.CHECK_INTERVAL_SEC):
            try:
                self._check()
            except Exception:
                pass

    def _check(self) -> None:
        now = time.time()
        memory = self._memory_store.load(self._match_id)
        if not memory:
            return

        recent_events = memory.get("recent_events") or []
        recent_reprices = memory.get("recent_reprices") or []

        # Check 1: Data freshness — last event older than threshold?
        if recent_events:
            last_event = recent_events[-1]
            event_time_str = last_event.get("event_time")
            if event_time_str:
                try:
                    event_dt = datetime.fromisoformat(event_time_str.replace("Z", "+00:00"))
                    age_sec = (datetime.now(timezone.utc) - event_dt).total_seconds()
                    if age_sec > self.STALE_DATA_THRESHOLD_SEC:
                        self._on_issue(self._match_id, "stale_feed", f"last_event_age={age_sec:.0f}s")
                except Exception:
                    pass

        # Check 2: Probability sanity — extreme drift in last 5 seconds?
        if recent_reprices:
            current_prob = recent_reprices[-1].get("probability_team1")
            if current_prob is not None and self._last_probability is not None:
                drift = abs(float(current_prob) - self._last_probability)
                if drift > self.MAX_PROBABILITY_DRIFT:
                    self._on_issue(self._match_id, "probability_spike", f"drift={drift:.3f}")
            if current_prob is not None:
                self._last_probability = float(current_prob)

        # Check 3: No reprices in last 30 seconds (match may be stuck)
        if recent_reprices:
            last_reprice = recent_reprices[-1]
            ts = last_reprice.get("timestamp")
            if ts:
                try:
                    reprice_dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                    age_sec = (datetime.now(timezone.utc) - reprice_dt).total_seconds()
                    if age_sec > self.STALE_DATA_THRESHOLD_SEC:
                        self._on_issue(self._match_id, "no_reprices", f"last_reprice_age={age_sec:.0f}s")
                except Exception:
                    pass

        self._last_check_time = now


class MatchMonitorRegistry:
    """Registry of per-match monitors."""

    def __init__(self, memory_store: Any) -> None:
        self._memory_store = memory_store
        self._monitors: dict[str, PerMatchMonitor] = {}
        self._lock = threading.Lock()
        self._issues: list[dict[str, Any]] = []

    def register(self, match_id: str) -> None:
        with self._lock:
            if match_id not in self._monitors:
                monitor = PerMatchMonitor(match_id, self._memory_store, self._record_issue)
                monitor.start()
                self._monitors[match_id] = monitor

    def deregister(self, match_id: str) -> None:
        with self._lock:
            monitor = self._monitors.pop(match_id, None)
            if monitor:
                monitor.stop()

    def active_match_ids(self) -> list[str]:
        with self._lock:
            return list(self._monitors.keys())

    def recent_issues(self, limit: int = 50) -> list[dict[str, Any]]:
        with self._lock:
            return list(self._issues[-limit:])

    def _record_issue(self, match_id: str, issue_type: str, detail: str) -> None:
        with self._lock:
            self._issues.append({
                "match_id": match_id,
                "issue_type": issue_type,
                "detail": detail,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
            # Keep last 500 issues
            if len(self._issues) > 500:
                self._issues = self._issues[-500:]

    def shutdown(self) -> None:
        with self._lock:
            for monitor in self._monitors.values():
                monitor.stop()
            self._monitors.clear()
