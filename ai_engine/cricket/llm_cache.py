from __future__ import annotations

import json
import os
from typing import Any

try:
    import redis  # type: ignore
except Exception:
    redis = None


DEFAULT_REDIS_URL = (
    os.getenv("CRICKET_LLM_CACHE_REDIS_URL")
    or os.getenv("PROVIDER_CACHE_REDIS_URL")
    or os.getenv("MULTI_SOURCE_REDIS_URL")
    or "redis://127.0.0.1:6379"
)
DEFAULT_REDIS_PREFIX = os.getenv("CRICKET_LLM_CACHE_PREFIX", "cricket:llm:")
DEFAULT_TTL_SEC = int(os.getenv("CRICKET_LLM_CACHE_TTL_SEC", "30"))


class LLMResponseCache:
    def __init__(self) -> None:
        self._redis = self._build_redis_client()

    def _build_redis_client(self) -> Any:
        if redis is None:
            return None
        try:
            client = redis.from_url(DEFAULT_REDIS_URL, decode_responses=True, socket_connect_timeout=1)
            client.ping()
            return client
        except Exception:
            return None

    def get(self, match_id: str, state_version: int) -> tuple[float, float] | None:
        if self._redis is None:
            return None
        try:
            key = f"{DEFAULT_REDIS_PREFIX}{match_id}:{state_version}"
            cached = self._redis.get(key)
            if cached:
                data = json.loads(cached)
                return (float(data["probability"]), float(data["confidence"]))
        except Exception:
            pass
        return None

    def set(self, match_id: str, state_version: int, probability: float, confidence: float) -> None:
        if self._redis is None:
            return
        try:
            key = f"{DEFAULT_REDIS_PREFIX}{match_id}:{state_version}"
            value = json.dumps({"probability": probability, "confidence": confidence})
            self._redis.setex(key, DEFAULT_TTL_SEC, value)
        except Exception:
            pass

    def invalidate_match(self, match_id: str) -> None:
        """Invalidate all cached LLM responses for a match (called on critical events)."""
        if self._redis is None:
            return
        try:
            pattern = f"{DEFAULT_REDIS_PREFIX}{match_id}:*"
            keys = self._redis.keys(pattern)
            if keys:
                self._redis.delete(*keys)
        except Exception:
            pass


_CACHE = LLMResponseCache()


def get_llm_cache() -> LLMResponseCache:
    return _CACHE
