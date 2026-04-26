from __future__ import annotations

import atexit
import json
import os
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    import redis  # type: ignore
except Exception:  # pragma: no cover
    redis = None


DEFAULT_DB_PATH = Path(os.getenv("CRICKET_MEMORY_DB_PATH", str(Path(__file__).resolve().parent / "data" / "cricket_memory.sqlite3")))
DEFAULT_EVENT_WINDOW = int(os.getenv("CRICKET_MEMORY_EVENT_WINDOW", "36"))
DEFAULT_REPRICE_WINDOW = int(os.getenv("CRICKET_MEMORY_REPRICE_WINDOW", "18"))
DEFAULT_REDIS_ENABLED = os.getenv("CRICKET_MEMORY_REDIS_ENABLED", "true").lower() not in {"0", "false", "no"}
DEFAULT_REDIS_URL = (
    os.getenv("CRICKET_MEMORY_REDIS_URL")
    or os.getenv("PROVIDER_CACHE_REDIS_URL")
    or os.getenv("MULTI_SOURCE_REDIS_URL")
    or "redis://127.0.0.1:6379"
)
DEFAULT_REDIS_PREFIX = os.getenv("CRICKET_MEMORY_REDIS_PREFIX", "cricket:memory:")
DEFAULT_REDIS_TTL_SEC = int(os.getenv("CRICKET_MEMORY_REDIS_TTL_SEC", str(60 * 60 * 24 * 7)))


class CricketMemoryStore:
    def __init__(self, db_path: Path | None = None) -> None:
        self._db_path = Path(db_path or DEFAULT_DB_PATH)
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._redis = self._build_redis_client()
        self._pool = self._build_connection_pool()
        self._initialize()
        atexit.register(self.close_pool)

    def _build_connection_pool(self) -> Any:
        import queue
        pool = queue.Queue(maxsize=5)
        for _ in range(5):
            conn = sqlite3.connect(str(self._db_path), timeout=5.0, check_same_thread=False)
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA synchronous=NORMAL")
            pool.put(conn)
        return pool

    def _get_connection(self) -> sqlite3.Connection:
        try:
            return self._pool.get(timeout=2.0)
        except Exception:
            # Fallback: create new connection if pool exhausted
            conn = sqlite3.connect(str(self._db_path), timeout=5.0, check_same_thread=False)
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA synchronous=NORMAL")
            return conn

    def _return_connection(self, conn: sqlite3.Connection) -> None:
        try:
            self._pool.put_nowait(conn)
        except Exception:
            conn.close()

    def close_pool(self) -> None:
        """Close all connections in the pool. Call on shutdown."""
        while not self._pool.empty():
            try:
                conn = self._pool.get_nowait()
                conn.close()
            except Exception:
                pass

    def load(self, match_id: str) -> dict[str, Any]:
        redis_memory = self._load_from_redis(match_id)
        if redis_memory is not None:
            return redis_memory
        return self._load_from_sqlite(match_id)

    def save(
        self,
        *,
        match_id: str,
        state_version: int,
        event_seq: int,
        snapshot: dict[str, Any],
    ) -> dict[str, Any]:
        memory = self._normalized_memory(snapshot)
        now_iso = datetime.now(timezone.utc).isoformat()

        if self._redis is not None:
            current = self._load_record_from_redis(match_id)
            if current is not None:
                current_state_version = int(current.get("last_state_version") or 0)
                current_event_seq = int(current.get("last_event_seq") or 0)
                if (state_version, event_seq) < (current_state_version, current_event_seq):
                    return self._normalized_memory(current.get("memory_json"))

            self._save_to_redis(
                match_id=match_id,
                state_version=state_version,
                event_seq=event_seq,
                memory=memory,
                updated_at=now_iso,
            )

        sqlite_memory = self._save_to_sqlite(
            match_id=match_id,
            state_version=state_version,
            event_seq=event_seq,
            memory=memory,
            updated_at=now_iso,
        )

        return sqlite_memory

    def clear(self, match_id: str) -> None:
        if self._redis is not None:
            try:
                self._redis.delete(self._redis_key(match_id))
            except Exception:
                pass

        with self._lock, self._connect() as conn:
            conn.execute(
                """
                DELETE FROM cricket_match_memory
                WHERE match_id = ?
                """,
                (match_id,),
            )
            conn.commit()

    def _initialize(self) -> None:
        with self._lock, self._connect() as conn:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA synchronous=NORMAL")
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS cricket_match_memory (
                    match_id TEXT PRIMARY KEY,
                    last_state_version INTEGER NOT NULL,
                    last_event_seq INTEGER NOT NULL,
                    memory_json TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE INDEX IF NOT EXISTS cricket_match_memory_updated_at_idx
                ON cricket_match_memory(updated_at)
                """
            )
            conn.commit()

    @contextmanager
    def _connect(self):
        conn = self._get_connection()
        try:
            yield conn
        finally:
            self._return_connection(conn)

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

    def _load_from_sqlite(self, match_id: str) -> dict[str, Any]:
        with self._lock, self._connect() as conn:
            row = conn.execute(
                """
                SELECT memory_json
                FROM cricket_match_memory
                WHERE match_id = ?
                """,
                (match_id,),
            ).fetchone()

        if row is None or row[0] is None:
            return self._empty_memory()

        try:
            payload = json.loads(row[0])
        except json.JSONDecodeError:
            return self._empty_memory()

        return self._normalized_memory(payload)

    def _save_to_sqlite(
        self,
        *,
        match_id: str,
        state_version: int,
        event_seq: int,
        memory: dict[str, Any],
        updated_at: str,
    ) -> dict[str, Any]:
        with self._lock, self._connect() as conn:
            current_row = conn.execute(
                """
                SELECT last_state_version, last_event_seq, memory_json
                FROM cricket_match_memory
                WHERE match_id = ?
                """,
                (match_id,),
            ).fetchone()

            if current_row is not None:
                current_state_version = int(current_row[0] or 0)
                current_event_seq = int(current_row[1] or 0)
                if (state_version, event_seq) < (current_state_version, current_event_seq):
                    try:
                        return self._normalized_memory(json.loads(current_row[2]))
                    except json.JSONDecodeError:
                        return self._empty_memory()

            conn.execute(
                """
                INSERT INTO cricket_match_memory (
                    match_id,
                    last_state_version,
                    last_event_seq,
                    memory_json,
                    updated_at
                )
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(match_id) DO UPDATE SET
                    last_state_version = excluded.last_state_version,
                    last_event_seq = excluded.last_event_seq,
                    memory_json = excluded.memory_json,
                    updated_at = excluded.updated_at
                """,
                (
                    match_id,
                    state_version,
                    event_seq,
                    json.dumps(memory, separators=(",", ":")),
                    updated_at,
                ),
            )
            conn.commit()

        return memory

    def _redis_key(self, match_id: str) -> str:
        return f"{DEFAULT_REDIS_PREFIX}{match_id}"

    def _load_record_from_redis(self, match_id: str) -> dict[str, Any] | None:
        if self._redis is None:
            return None
        try:
            payload = self._redis.get(self._redis_key(match_id))
        except Exception:
            return None
        if not payload:
            return None
        try:
            decoded = json.loads(payload)
        except json.JSONDecodeError:
            return None
        return decoded if isinstance(decoded, dict) else None

    def _load_from_redis(self, match_id: str) -> dict[str, Any] | None:
        record = self._load_record_from_redis(match_id)
        if not record:
            return None
        return self._normalized_memory(record.get("memory_json"))

    def _save_to_redis(
        self,
        *,
        match_id: str,
        state_version: int,
        event_seq: int,
        memory: dict[str, Any],
        updated_at: str,
    ) -> None:
        if self._redis is None:
            return
        payload = json.dumps(
            {
                "match_id": match_id,
                "last_state_version": state_version,
                "last_event_seq": event_seq,
                "memory_json": memory,
                "updated_at": updated_at,
            },
            separators=(",", ":"),
        )
        try:
            if DEFAULT_REDIS_TTL_SEC > 0:
                self._redis.setex(self._redis_key(match_id), DEFAULT_REDIS_TTL_SEC, payload)
            else:
                self._redis.set(self._redis_key(match_id), payload)
        except Exception:
            return

    def _empty_memory(self) -> dict[str, Any]:
        return {
            "recent_events": [],
            "recent_reprices": [],
            "recent_suspensions": [],
            "prior_probability_team1": None,
            "match_dossier": {},
            "pitch_learnings": {},
            "pre_match_context_pack": {},
            "last_fancy_projection": {},
            "last_fancy_fair_projection": {},
            "last_reasoning": None,
            "last_state_version": None,
            "last_event_seq": None,
        }

    def _normalized_memory(self, payload: dict[str, Any] | None) -> dict[str, Any]:
        base = self._empty_memory()
        payload = payload or {}

        base["recent_events"] = self._prune_events(payload.get("recent_events"))
        base["recent_reprices"] = self._prune_reprices(payload.get("recent_reprices"))
        base["recent_suspensions"] = self._prune_suspensions(payload.get("recent_suspensions"))
        base["prior_probability_team1"] = self._float_or_none(payload.get("prior_probability_team1"))
        base["match_dossier"] = self._normalize_dossier(payload.get("match_dossier"))
        base["pitch_learnings"] = self._normalize_dossier(payload.get("pitch_learnings"))
        base["pre_match_context_pack"] = self._normalize_dossier(payload.get("pre_match_context_pack"))
        base["last_fancy_projection"] = self._normalize_projection_map(payload.get("last_fancy_projection"))
        base["last_fancy_fair_projection"] = self._normalize_projection_map(payload.get("last_fancy_fair_projection"))
        base["last_reasoning"] = self._string_or_none(payload.get("last_reasoning"))
        base["last_state_version"] = self._int_or_none(payload.get("last_state_version"))
        base["last_event_seq"] = self._int_or_none(payload.get("last_event_seq"))
        return base

    def _normalize_dossier(self, dossier: Any) -> dict[str, Any]:
        if not isinstance(dossier, dict):
            return {}
        return json.loads(json.dumps(dossier))

    def _normalize_projection_map(self, payload: Any) -> dict[str, str]:
        if not isinstance(payload, dict):
            return {}
        normalized: dict[str, str] = {}
        for key, value in payload.items():
            if key is None or value is None:
                continue
            normalized[str(key)] = str(value)
        return normalized

    def _prune_events(self, events: Any) -> list[dict[str, Any]]:
        items = events if isinstance(events, list) else []
        normalized: list[dict[str, Any]] = []
        for item in items[-DEFAULT_EVENT_WINDOW:]:
            if not isinstance(item, dict):
                continue
            normalized.append(
                {
                    "event_type": self._string_or_none(item.get("event_type")) or "unknown",
                    "severity": self._string_or_none(item.get("severity")) or "minor",
                    "over": self._string_or_none(item.get("over")),
                    "ball_in_over": self._int_or_none(item.get("ball_in_over")),
                    "runs_total": self._int_or_none(item.get("runs_total")) or 0,
                    "wickets_total": self._int_or_none(item.get("wickets_total")) or 0,
                    "momentum_index": self._float_or_none(item.get("momentum_index")),
                    "event_time": self._string_or_none(item.get("event_time")),
                }
            )
        return normalized

    def _prune_reprices(self, reprices: Any) -> list[dict[str, Any]]:
        items = reprices if isinstance(reprices, list) else []
        normalized: list[dict[str, Any]] = []
        for item in items[-DEFAULT_REPRICE_WINDOW:]:
            if not isinstance(item, dict):
                continue
            normalized.append(
                {
                    "state_version": self._int_or_none(item.get("state_version")),
                    "event_seq": self._int_or_none(item.get("event_seq")),
                    "probability_team1": self._float_or_none(item.get("probability_team1")),
                    "model_name": self._string_or_none(item.get("model_name")),
                    "fallback_used": bool(item.get("fallback_used", False)),
                    "event_type": self._string_or_none(item.get("event_type")),
                    "timestamp": self._string_or_none(item.get("timestamp")),
                }
            )
        return normalized

    def _prune_suspensions(self, suspensions: Any) -> list[dict[str, Any]]:
        items = suspensions if isinstance(suspensions, list) else []
        normalized: list[dict[str, Any]] = []
        for item in items[-DEFAULT_REPRICE_WINDOW:]:
            if not isinstance(item, dict):
                continue
            normalized.append(
                {
                    "reason": self._string_or_none(item.get("reason")) or "unknown",
                    "timestamp": self._string_or_none(item.get("timestamp")),
                }
            )
        return normalized

    def _string_or_none(self, value: Any) -> str | None:
        if value is None:
            return None
        text = str(value).strip()
        return text or None

    def _int_or_none(self, value: Any) -> int | None:
        try:
            return int(value) if value is not None else None
        except (TypeError, ValueError):
            return None

    def _float_or_none(self, value: Any) -> float | None:
        try:
            return float(value) if value is not None else None
        except (TypeError, ValueError):
            return None
