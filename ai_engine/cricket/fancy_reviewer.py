from __future__ import annotations

from typing import Any

from cricket.coherence import evaluate_market_coherence
from cricket.risk_limits import DEFAULT_LIMITS


def review_fancy_markets(
    *,
    fancy_markets: list[dict[str, Any]],
    memory_context: dict[str, Any],
    over_number: float,
    balls_remaining: int | None,
) -> tuple[list[dict[str, Any]], list[str], str | None]:
    if not fancy_markets:
        return [], ["fancy_no_candidate_markets"], "no_fancy_projection"

    recent_events = list(memory_context.get("recent_events") or [])
    cluster_wickets = sum(1 for event in recent_events[-6:] if event.get("event_type") == "wicket") >= 2
    unstable_context = over_number <= 0.2 or balls_remaining == 0
    near_innings_transition = over_number >= 19.0 or (balls_remaining is not None and balls_remaining <= 12)

    if unstable_context:
        return suspend_family(fancy_markets, "innings_context_unstable", "fancy_unstable_context")

    if cluster_wickets:
        return suspend_windows(
            fancy_markets,
            should_suspend=lambda market: requested_window_overs(market) <= 10,
            reason="cluster_wickets",
            flag="fancy_cluster_wickets",
            fallback_reason="cluster_wickets_family",
        )

    prior_projection = dict(memory_context.get("last_fancy_projection") or {})
    movement_cap = line_movement_cap(over_number)
    adjusted: list[dict[str, Any]] = []
    flags: list[str] = []

    for market in fancy_markets:
        projection_key = (
            get_in(market, ["trace_meta", "projection_key"]) or
            fallback_projection_key(market)
        )
        prior_line = parse_float(prior_projection.get(projection_key))
        if prior_line is None:
            prior_line = parse_float(prior_projection.get(market["market_key"]))
        next_line = parse_float(market.get("projected_line"))
        if prior_line is not None and next_line is not None:
            delta = next_line - prior_line
            if abs(delta) > movement_cap:
                damped_line = prior_line + (movement_cap if delta > 0 else -movement_cap)
                market = {
                    **market,
                    "projected_line": f"{damped_line:.1f}",
                    "trace_meta": {
                        **(market.get("trace_meta") or {}),
                        "line_dampened_from": f"{next_line:.1f}",
                        "line_dampened_to": f"{damped_line:.1f}",
                    },
                }
                flags.append(f"fancy_line_dampened:{market['market_key']}:{abs(delta):.2f}")

        if near_innings_transition:
            window_overs = requested_window_overs(market)
            overs_remaining = None if balls_remaining is None else balls_remaining / 6.0
            if overs_remaining is not None and window_overs > overs_remaining + 0.2:
                market = {
                    **market,
                    "is_suspended": True,
                    "reason": "window_beyond_remaining_overs",
                }
                flags.append("fancy_transition_window_suspended")
                adjusted.append(market)
                continue

            market = {
                **market,
                "confidence_score": max(0.2, float(market.get("confidence_score", 0.3)) - 0.08),
                "valid_for_ms": min(int(market.get("valid_for_ms", 1800)), 1200),
            }
            flags.append("fancy_transition_dampening")

        adjusted.append(market)

    coherence_hard, _ = evaluate_market_coherence(
        markets=[],
        current_odds=[],
        match_state=None,
        limits=DEFAULT_LIMITS,
        fancy_markets=adjusted,
    )
    flags.extend(coherence_hard)

    return adjusted, dedupe(flags), None


def suspend_family(
    fancy_markets: list[dict[str, Any]],
    reason: str,
    flag: str,
) -> tuple[list[dict[str, Any]], list[str], str]:
    suspended = [
        {
            **market,
            "is_suspended": True,
            "reason": reason,
        }
        for market in fancy_markets
    ]
    return suspended, [flag], reason


def suspend_windows(
    fancy_markets: list[dict[str, Any]],
    *,
    should_suspend: Any,
    reason: str,
    flag: str,
    fallback_reason: str,
) -> tuple[list[dict[str, Any]], list[str], str | None]:
    suspended_any = False
    adjusted: list[dict[str, Any]] = []
    for market in fancy_markets:
        if should_suspend(market):
            suspended_any = True
            adjusted.append({**market, "is_suspended": True, "reason": reason})
        else:
            adjusted.append(market)

    if not suspended_any:
        return suspend_family(fancy_markets, fallback_reason, flag)

    return adjusted, [flag, "fancy_window_specific_suspension"], None


def line_movement_cap(over_number: float) -> float:
    if over_number < 6.0:
        return 4.0
    if over_number < 15.0:
        return 6.0
    return 3.0


def parse_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def dedupe(flags: list[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for flag in flags:
        if flag in seen:
            continue
        seen.add(flag)
        ordered.append(flag)
    return ordered


def get_in(value: dict[str, Any], path: list[str]) -> Any:
    current: Any = value
    for key in path:
        if not isinstance(current, dict):
            return None
        current = current.get(key)
    return current


def fallback_projection_key(market: dict[str, Any]) -> str:
    market_key = str(market.get("market_key") or "fancy")
    projected_line = parse_float(market.get("projected_line"))
    if projected_line is None:
        return market_key
    return f"{market_key}::{projected_line:.1f}"


def requested_window_overs(market: dict[str, Any]) -> int:
    label = str(market.get("window_label") or "")
    for token in label.split():
        if token.isdigit():
            return int(token)
    market_key = str(market.get("market_key") or "")
    parts = market_key.split("_")
    for part in parts:
        if part.isdigit():
            return int(part)
    return 0
