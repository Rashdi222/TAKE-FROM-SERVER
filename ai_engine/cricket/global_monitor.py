from __future__ import annotations

import threading
import time
from datetime import datetime, timezone
from typing import Any


class GlobalMonitor:
    """System-wide health monitor — runs every 10 seconds."""

    CHECK_INTERVAL_SEC = 10
    MAX_FAILURE_RATE = 0.20       # 20% failure rate triggers circuit breaker
    MAX_ACTIVE_MATCHES = 200      # Alert if too many active matches
    MIN_REPRICE_RATE = 0.5        # At least 0.5 reprices/sec per active match expected

    def __init__(self, memory_store: Any, match_registry: Any) -> None:
        self._memory_store = memory_store
        self._match_registry = match_registry  # MatchMonitorRegistry
        self._thread: threading.Thread | None = None
        self._stop_event = threading.Event()
        self._circuit_open = False
        self._health: dict[str, Any] = {
            "status": "healthy",
            "active_matches": 0,
            "total_issues": 0,
            "circuit_open": False,
            "last_check": None,
        }
        self._lock = threading.Lock()

    def start(self) -> None:
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._run, daemon=True, name="global_monitor")
        self._thread.start()

    def stop(self) -> None:
        self._stop_event.set()

    def is_circuit_open(self) -> bool:
        with self._lock:
            return self._circuit_open

    def health_snapshot(self) -> dict[str, Any]:
        with self._lock:
            return dict(self._health)

    def _run(self) -> None:
        while not self._stop_event.wait(self.CHECK_INTERVAL_SEC):
            try:
                self._check()
            except Exception:
                pass

    def _check(self) -> None:
        active_ids = self._match_registry.active_match_ids()
        recent_issues = self._match_registry.recent_issues(limit=100)
        now_iso = datetime.now(timezone.utc).isoformat()

        # Count issues in last 10 seconds
        now_ts = time.time()
        recent_window_issues = [
            i for i in recent_issues
            if _parse_age_sec(i.get("timestamp"), now_ts) < self.CHECK_INTERVAL_SEC
        ]

        # Failure rate: issues per active match in last window
        active_count = len(active_ids)
        issue_count = len(recent_window_issues)
        failure_rate = (issue_count / max(active_count, 1)) / self.CHECK_INTERVAL_SEC

        # Circuit breaker: open if failure rate too high
        circuit_open = failure_rate > self.MAX_FAILURE_RATE

        # Alert: too many active matches
        overload = active_count > self.MAX_ACTIVE_MATCHES

        status = "healthy"
        if circuit_open:
            status = "circuit_open"
        elif overload:
            status = "overloaded"
        elif issue_count > 0:
            status = "degraded"

        with self._lock:
            self._circuit_open = circuit_open
            self._health = {
                "status": status,
                "active_matches": active_count,
                "issues_last_10s": issue_count,
                "failure_rate": round(failure_rate, 4),
                "circuit_open": circuit_open,
                "overloaded": overload,
                "last_check": now_iso,
            }


def _parse_age_sec(timestamp: str | None, now_ts: float) -> float:
    if not timestamp:
        return 9999.0
    try:
        dt = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
        return now_ts - dt.timestamp()
    except Exception:
        return 9999.0
