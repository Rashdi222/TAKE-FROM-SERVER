from __future__ import annotations

import json
import os
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    import redis  # type: ignore
except Exception:  # pragma: no cover
    redis = None


DEFAULT_DB_PATH = Path(
    os.getenv(
        "CRICKET_GLOBAL_TRAINING_DB_PATH",
        str(Path(__file__).resolve().parent / "data" / "cricket_memory.sqlite3"),
    )
)
DEFAULT_REDIS_ENABLED = os.getenv("CRICKET_GLOBAL_TRAINING_REDIS_ENABLED", "true").lower() not in {
    "0",
    "false",
    "no",
}
DEFAULT_REDIS_URL = (
    os.getenv("CRICKET_GLOBAL_TRAINING_REDIS_URL")
    or os.getenv("CRICKET_MEMORY_REDIS_URL")
    or os.getenv("PROVIDER_CACHE_REDIS_URL")
    or os.getenv("MULTI_SOURCE_REDIS_URL")
    or "redis://127.0.0.1:6379"
)
DEFAULT_REDIS_PREFIX = os.getenv("CRICKET_GLOBAL_TRAINING_REDIS_PREFIX", "cricket:global-training:")
DEFAULT_REDIS_TTL_SEC = int(os.getenv("CRICKET_GLOBAL_TRAINING_REDIS_TTL_SEC", str(60 * 10)))


class GlobalTrainingCache:
    def __init__(self, db_path: Path | None = None) -> None:
        self._db_path = Path(db_path or DEFAULT_DB_PATH)
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._redis = self._build_redis_client()
        self._initialize()

    def record_match_completion(
        self,
        *,
        match_id: str,
        format_name: str,
        first_innings_score: int,
    ) -> bool:
        match_key = (match_id or "").strip()
        if not match_key:
            return False

        normalized_format = self._normalize_format(format_name)
        first_score = max(0, int(first_innings_score or 0))
        now_iso = datetime.now(timezone.utc).isoformat()

        with self._lock, sqlite3.connect(str(self._db_path)) as conn:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA synchronous=NORMAL")

            inserted = conn.execute(
                """
                INSERT OR IGNORE INTO global_learning_events (
                    match_id,
                    format_name,
                    first_innings_score,
                    learned_at
                )
                VALUES (?, ?, ?, ?)
                """,
                (match_key, normalized_format, first_score, now_iso),
            )

            if inserted.rowcount == 0:
                conn.commit()
                return False

            row = conn.execute(
                """
                SELECT sample_count, avg_first_innings_score
                FROM global_format_learning
                WHERE format_name = ?
                """,
                (normalized_format,),
            ).fetchone()

            if row is None:
                conn.execute(
                    """
                    INSERT INTO global_format_learning (
                        format_name,
                        sample_count,
                        avg_first_innings_score,
                        last_first_innings_score,
                        updated_at
                    )
                    VALUES (?, 1, ?, ?, ?)
                    """,
                    (normalized_format, float(first_score), float(first_score), now_iso),
                )
                sample_count = 1
                avg_score = float(first_score)
            else:
                previous_count = int(row[0] or 0)
                previous_avg = float(row[1] or 0.0)
                sample_count = previous_count + 1
                avg_score = ((previous_avg * previous_count) + float(first_score)) / max(sample_count, 1)
                conn.execute(
                    """
                    UPDATE global_format_learning
                    SET sample_count = ?,
                        avg_first_innings_score = ?,
                        last_first_innings_score = ?,
                        updated_at = ?
                    WHERE format_name = ?
                    """,
                    (sample_count, avg_score, float(first_score), now_iso, normalized_format),
                )

            conn.commit()

        self._save_to_redis(
            normalized_format,
            {
                "format_name": normalized_format,
                "sample_count": sample_count,
                "avg_first_innings_score": round(avg_score, 3),
                "updated_at": now_iso,
            },
        )
        return True

    def load_format_prior(self, format_name: str) -> dict[str, Any]:
        normalized_format = self._normalize_format(format_name)
        cached = self._load_from_redis(normalized_format)
        if cached is not None:
            return cached

        with self._lock, sqlite3.connect(str(self._db_path)) as conn:
            row = conn.execute(
                """
                SELECT sample_count, avg_first_innings_score, updated_at
                FROM global_format_learning
                WHERE format_name = ?
                """,
                (normalized_format,),
            ).fetchone()

        if row is None:
            result = {
                "format_name": normalized_format,
                "sample_count": 0,
                "avg_first_innings_score": None,
                "updated_at": None,
            }
        else:
            result = {
                "format_name": normalized_format,
                "sample_count": int(row[0] or 0),
                "avg_first_innings_score": float(row[1]) if row[1] is not None else None,
                "updated_at": row[2],
            }

        self._save_to_redis(normalized_format, result)
        return result

    def _initialize(self) -> None:
        with self._lock, sqlite3.connect(str(self._db_path)) as conn:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA synchronous=NORMAL")
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS global_format_learning (
                    format_name TEXT PRIMARY KEY,
                    sample_count INTEGER NOT NULL DEFAULT 0,
                    avg_first_innings_score REAL,
                    last_first_innings_score REAL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS global_learning_events (
                    match_id TEXT PRIMARY KEY,
                    format_name TEXT NOT NULL,
                    first_innings_score INTEGER NOT NULL,
                    learned_at TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE INDEX IF NOT EXISTS global_learning_events_format_idx
                ON global_learning_events(format_name)
                """
            )
            conn.commit()

    def _build_redis_client(self) -> Any | None:
        if not DEFAULT_REDIS_ENABLED or redis is None:
            return None

        try:
            return redis.from_url(
                DEFAULT_REDIS_URL,
                decode_responses=True,
                socket_connect_timeout=0.2,
                socket_timeout=0.2,
                health_check_interval=30,
            )
        except Exception:
            return None

    def _redis_key(self, format_name: str) -> str:
        return f"{DEFAULT_REDIS_PREFIX}{format_name}"

    def _load_from_redis(self, format_name: str) -> dict[str, Any] | None:
        if self._redis is None:
            return None

        try:
            payload = self._redis.get(self._redis_key(format_name))
        except Exception:
            return None

        if not payload:
            return None

        try:
            decoded = json.loads(payload)
        except json.JSONDecodeError:
            return None

        return decoded if isinstance(decoded, dict) else None

    def _save_to_redis(self, format_name: str, payload: dict[str, Any]) -> None:
        if self._redis is None:
            return

        encoded = json.dumps(payload, separators=(",", ":"))
        try:
            if DEFAULT_REDIS_TTL_SEC > 0:
                self._redis.setex(self._redis_key(format_name), DEFAULT_REDIS_TTL_SEC, encoded)
            else:
                self._redis.set(self._redis_key(format_name), encoded)
        except Exception:
            return

    def _normalize_format(self, format_name: str | None) -> str:
        key = str(format_name or "").strip().lower()
        if key in {"one day", "one day international", "list a"}:
            return "odi"
        if key in {"first class"}:
            return "test"
        if key in {"t20i", "t20"}:
            return "t20"
        return key or "t20"


_CACHE = GlobalTrainingCache()


def load_global_format_priors(format_name: str | None) -> dict[str, Any]:
    return _CACHE.load_format_prior(format_name or "t20")


def record_global_match_completion(
    *,
    match_id: str,
    format_name: str | None,
    first_innings_score: int,
) -> bool:
    return _CACHE.record_match_completion(
        match_id=match_id,
        format_name=format_name or "t20",
        first_innings_score=first_innings_score,
    )
