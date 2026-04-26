from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from cricket.global_training_cache import load_global_format_priors
from cricket.pre_match_cache import ensure_match_dossier

_FORMAT_TOTAL_OVERS: dict[str, int] = {"t20": 20, "odi": 50, "test": 90}
_FORMAT_PAR_SCORE: dict[str, float] = {"t20": 165.0, "odi": 285.0, "test": 350.0}


def ensure_pre_match_context_pack(
    *,
    match_id: str,
    match_state: Any,
    state_version: int,
    event_seq: int,
    memory_store: Any,
    memory_context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    memory_context = memory_context or memory_store.load(match_id)
    existing_pack = memory_context.get("pre_match_context_pack")
    existing_pack = existing_pack if isinstance(existing_pack, dict) else {}

    dossier = ensure_match_dossier(
        match_id=match_id,
        match_state=match_state,
        state_version=state_version,
        event_seq=event_seq,
        memory_store=memory_store,
        memory_context=memory_context,
    )
    format_name = str(dossier.get("format_name") or dossier.get("format") or "t20").strip().lower()
    format_name = format_name if format_name in _FORMAT_TOTAL_OVERS else "t20"
    base_total_overs = _FORMAT_TOTAL_OVERS.get(format_name, 20)
    base_par_score = _FORMAT_PAR_SCORE.get(format_name, 165.0)

    global_priors = load_global_format_priors(format_name)
    global_samples = int(global_priors.get("sample_count") or 0)
    global_avg_score = global_priors.get("avg_first_innings_score")
    blended_par_score = float(base_par_score)

    if isinstance(global_avg_score, (int, float)) and global_samples >= 8:
        blend_weight = min(0.35, 0.08 + (global_samples / 220.0))
        blended_par_score = (base_par_score * (1.0 - blend_weight)) + (float(global_avg_score) * blend_weight)

    pack = {
        "initialized_at": existing_pack.get("initialized_at") or datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "venue": {
            "name": ((dossier.get("venue") or {}).get("name")),
            "country": ((dossier.get("venue") or {}).get("country")),
            "city": ((dossier.get("venue") or {}).get("city")),
        },
        "toss": dict(dossier.get("toss") or {}),
        "format": format_name,
        "format_priors": {
            "total_overs": base_total_overs,
            "par_score": round(blended_par_score, 3),
            "base_par_score": base_par_score,
            "global_avg_first_innings_score": global_avg_score,
            "global_sample_count": global_samples,
        },
        "pricing_formula_profile": {
            "next_over_rr_formula": "expected_next_over_runs=weighted_rr",
            "fancy_expected_runs_formula": "expected_runs=weighted_rr*(active_balls/6)",
            "global_prior_blend": global_samples >= 8,
            "global_prior_source": "global_training_cache",
        },
        "xi_roles": _extract_xi_roles(getattr(match_state, "raw_data", {}) or {}),
        "team_personas": dict(dossier.get("team_personas") or {}),
        "venue_bias": dict(dossier.get("venue_bias") or {}),
    }

    if pack != existing_pack:
        snapshot = dict(memory_context)
        snapshot["match_dossier"] = dossier
        snapshot["pre_match_context_pack"] = pack
        memory_store.save(
            match_id=match_id,
            state_version=state_version,
            event_seq=event_seq,
            snapshot=snapshot,
        )

    return pack


def _extract_xi_roles(raw_data: dict[str, Any]) -> list[dict[str, Any]]:
    lineup = raw_data.get("lineup")
    if not isinstance(lineup, list):
        return []

    players: list[dict[str, Any]] = []
    for entry in lineup:
        if not isinstance(entry, dict):
            continue
        player = entry.get("player") if isinstance(entry.get("player"), dict) else {}
        team = entry.get("team") if isinstance(entry.get("team"), dict) else {}
        name = (
            player.get("fullname")
            or player.get("name")
            or entry.get("fullname")
            or entry.get("name")
        )
        if not name:
            continue

        role = None
        position = player.get("position")
        if isinstance(position, dict):
            role = position.get("name") or position.get("role")
        role = role or entry.get("position") or entry.get("role")

        players.append(
            {
                "name": str(name),
                "team": team.get("name") or entry.get("team_name"),
                "role": role,
                "captain": bool(entry.get("captain") or entry.get("is_captain")),
                "wicketkeeper": bool(entry.get("wicketkeeper") or entry.get("is_wicketkeeper")),
            }
        )

    return players
