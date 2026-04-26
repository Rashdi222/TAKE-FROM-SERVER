from __future__ import annotations

from typing import Any

from cricket.dossier import build_match_dossier
from cricket.memory import CricketMemoryStore


def ensure_match_dossier(
    *,
    match_id: str,
    match_state: Any,
    state_version: int,
    event_seq: int,
    memory_store: CricketMemoryStore,
    memory_context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    memory_context = memory_context or memory_store.load(match_id)
    existing_dossier = memory_context.get("match_dossier") if isinstance(memory_context, dict) else {}
    dossier = build_match_dossier(match_state, existing_dossier if isinstance(existing_dossier, dict) else {})

    if dossier != (existing_dossier or {}):
        snapshot = dict(memory_context)
        snapshot["match_dossier"] = dossier
        memory_store.save(
            match_id=match_id,
            state_version=state_version,
            event_seq=event_seq,
            snapshot=snapshot,
        )
        return dossier

    return existing_dossier or dossier
