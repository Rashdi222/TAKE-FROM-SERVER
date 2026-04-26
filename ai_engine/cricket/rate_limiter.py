from __future__ import annotations

import os
import time
from collections import defaultdict
from threading import Lock
from typing import Any


class RateLimiter:
    """Per-match-id rate limiter with request throttling."""
    
    def __init__(self, max_requests_per_second: int = 10, dedup_window_ms: int = 100):
        self._max_rps = max_requests_per_second
        self._dedup_window_ms = dedup_window_ms
        self._lock = Lock()
        self._request_times: dict[str, list[float]] = defaultdict(list)
        self._last_request: dict[str, tuple[int, float]] = {}  # (state_version, timestamp)
    
    def check_rate_limit(self, match_id: str, state_version: int) -> tuple[bool, str | None]:
        """Check if request should be allowed. Returns (allowed, reason)."""
        now = time.time()
        
        with self._lock:
            # Request deduplication: same state_version within dedup window
            if match_id in self._last_request:
                last_version, last_time = self._last_request[match_id]
                if last_version == state_version and (now - last_time) * 1000 < self._dedup_window_ms:
                    # Duplicate burst of the same state should not suspend publishing.
                    # Allow it through while still updating recency for downstream pacing.
                    self._last_request[match_id] = (state_version, now)
                    return True, "duplicate_request_allowed"
            
            # Rate limiting: max requests per second per match_id
            request_times = self._request_times[match_id]
            
            # Remove requests older than 1 second
            cutoff = now - 1.0
            request_times[:] = [t for t in request_times if t > cutoff]
            
            # Check if limit exceeded
            if len(request_times) >= self._max_rps:
                return False, f"rate_limit_exceeded_{self._max_rps}_per_second"
            
            # Allow request
            request_times.append(now)
            self._last_request[match_id] = (state_version, now)
            
            return True, None
    
    def cleanup_old_entries(self, max_age_seconds: int = 3600):
        """Clean up entries older than max_age_seconds (default 1 hour)."""
        now = time.time()
        cutoff = now - max_age_seconds
        
        with self._lock:
            # Clean up request_times
            for match_id in list(self._request_times.keys()):
                self._request_times[match_id][:] = [t for t in self._request_times[match_id] if t > cutoff]
                if not self._request_times[match_id]:
                    del self._request_times[match_id]
            
            # Clean up last_request
            for match_id in list(self._last_request.keys()):
                _, last_time = self._last_request[match_id]
                if last_time < cutoff:
                    del self._last_request[match_id]


_RATE_LIMITER = RateLimiter(
    max_requests_per_second=int(os.getenv("CRICKET_RATE_LIMIT_MAX_RPS", "14")),
    dedup_window_ms=int(os.getenv("CRICKET_RATE_LIMIT_DEDUP_WINDOW_MS", "180")),
)


def get_rate_limiter() -> RateLimiter:
    return _RATE_LIMITER
