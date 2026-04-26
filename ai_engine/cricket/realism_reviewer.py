from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from typing import Any


def apply_realism_review(
    *,
    markets: list[dict[str, Any]],
    match_state: Any,
    over_number: float,
    balls_remaining: int | None,
) -> tuple[list[dict[str, Any]], list[str]]:
    """Harden overly soft two-way live markets to reduce near-certain free-win quotes.

    This pass is intentionally conservative and only touches totals/fancy/session style markets.
    It preserves market overround while capping favorite fair-probability by match phase.
    """
    if not markets:
        return markets, []

    max_fair_prob = _max_fair_prob(over_number=over_number, balls_remaining=balls_remaining)
    grouped: dict[tuple[str, str], list[dict[str, Any]]] = {}

    for market in markets:
        market_key = str(market.get("market_key") or "")
        if not _eligible_market(market_key):
            continue

        line_key = str(market.get("projected_line") or _line_from_label(market.get("label")) or "")
        group_key = (market_key, line_key)
        grouped.setdefault(group_key, []).append(market)

    flags: list[str] = []
    current_runs = _to_float(getattr(match_state, "runs_total", None))

    for (_, _), group in grouped.items():
        if len(group) != 2:
            continue

        prices = [_to_float(item.get("price")) for item in group]
        if any(price is None or price <= 1.0 for price in prices):
            continue

        implied = [1.0 / float(price) for price in prices]  # includes vig
        overround = sum(implied)
        if overround <= 0.0:
            continue
        market_class = _market_class(str(group[0].get("market_key") or ""))
        target_overround = _target_overround(market_class)

        fair = [value / overround for value in implied]
        favorite_index = 0 if fair[0] >= fair[1] else 1
        favorite_fair = fair[favorite_index]
        hardened_fair = list(fair)

        # 1) Avoid unrealistically generous favorites by enforcing likely-side floor when
        # the line context indicates one side should be strongly favored.
        likely_index, likely_floor = _likely_side_floor(
            group=group,
            market_key=str(group[0].get("market_key") or ""),
            line=_line_from_market_group(group),
            current_runs=current_runs,
            balls_remaining=balls_remaining,
            match_state=match_state,
        )
        if likely_index is not None and likely_floor is not None:
            if hardened_fair[likely_index] < likely_floor:
                hardened_fair[likely_index] = likely_floor
                hardened_fair[1 - likely_index] = 1.0 - likely_floor
                flags.append(
                    f"realism_likely_side_floor:{group[0].get('market_key')}:{round(fair[likely_index], 4)}->{round(likely_floor, 4)}"
                )

        # 2) Keep extreme tails bounded in speculative markets (only very high extremes).
        favorite_index = 0 if hardened_fair[0] >= hardened_fair[1] else 1
        favorite_fair = hardened_fair[favorite_index]
        if favorite_fair > max_fair_prob:
            hardened_favorite = max_fair_prob
            hardened_other = 1.0 - hardened_favorite
            hardened_fair[favorite_index] = hardened_favorite
            hardened_fair[1 - favorite_index] = hardened_other
            flags.append(
                f"realism_hardened:{group[0].get('market_key')}:{round(favorite_fair, 4)}->{round(max_fair_prob, 4)}"
            )

        # Apply 5% probability lattice so prices stay in predictable risk buckets.
        lattice_favorite = _snap_probability_step(
            hardened_fair[favorite_index],
            step=0.05,
            floor=0.05,
            ceiling=max_fair_prob,
        )
        lattice_other = 1.0 - lattice_favorite
        lattice_fair = [lattice_other, lattice_other]
        lattice_fair[favorite_index] = lattice_favorite
        lattice_fair[1 - favorite_index] = lattice_other
        effective_overround = max(overround, target_overround)
        hardened_implied = [max(0.001, value * effective_overround) for value in lattice_fair]

        for idx, market in enumerate(group):
            hardened_price = _decimal_price_from_implied(hardened_implied[idx])
            market["price"] = hardened_price
            trace = dict(market.get("trace_meta") or {})
            trace["realism_review_applied"] = True
            trace["realism_phase_max_fair_prob"] = round(max_fair_prob, 4)
            trace["realism_prior_fair_prob"] = round(fair[idx], 4)
            trace["realism_lattice_fair_prob"] = round(lattice_fair[idx], 4)
            trace["realism_overround_before"] = round(overround, 4)
            trace["realism_overround_after"] = round(effective_overround, 4)
            market["trace_meta"] = trace

        flags.append(
            f"realism_prob_lattice:{group[0].get('market_key')}:{round(lattice_fair[favorite_index], 4)}"
        )
        if effective_overround > overround:
            flags.append(
                f"realism_overround_floor:{group[0].get('market_key')}:{round(overround, 4)}->{round(effective_overround, 4)}"
            )

        line = _line_from_market_group(group)
        if _line_already_resolved(
            group=group,
            market_key=str(group[0].get("market_key") or ""),
            line=line,
            current_runs=current_runs,
            balls_remaining=balls_remaining,
        ):
            for market in group:
                market["is_suspended"] = True
                market["reason"] = "line_already_resolved"
                market["valid_for_ms"] = 0
                trace = dict(market.get("trace_meta") or {})
                trace["realism_auto_suspended"] = True
                trace["realism_suspend_reason"] = "line_already_resolved"
                market["trace_meta"] = trace

            if line is not None:
                flags.append(f"realism_resolved_line_suspend:{group[0].get('market_key')}:{line}")
            else:
                flags.append(f"realism_resolved_line_suspend:{group[0].get('market_key')}")

    return markets, flags


def _eligible_market(market_key: str) -> bool:
    key = market_key.lower()
    return (
        "over_under" in key
        or "fancy" in key
        or "session" in key
        or "total" in key
    )


def _market_class(market_key: str) -> str:
    key = market_key.lower()
    if "fancy" in key or "session" in key:
        return "fancy"
    if "over_under" in key or "total" in key:
        return "totals"
    return "other"


def _target_overround(market_class: str) -> float:
    if market_class == "fancy":
        return 1.07
    if market_class == "totals":
        return 1.055
    return 1.05


def _max_fair_prob(*, over_number: float, balls_remaining: int | None) -> float:
    # Keep cap very high so realism pass does not soften likely-side protection.
    if balls_remaining is None:
        return 0.98
    if balls_remaining > 60 or over_number <= 8.0:
        return 0.98
    if balls_remaining > 30 or over_number <= 14.0:
        return 0.985
    if balls_remaining > 12:
        return 0.99
    return 0.995


def _decimal_price_from_implied(implied_prob: float) -> str:
    implied_prob = max(0.001, min(0.985, implied_prob))
    value = (Decimal("1") / Decimal(str(implied_prob))).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    if value < Decimal("1.01"):
        value = Decimal("1.01")
    return format(value, "f")


def _to_float(value: Any) -> float | None:
    try:
        if value is None:
            return None
        numeric = float(value)
        return numeric if numeric > 0 else None
    except (TypeError, ValueError):
        return None


def _line_from_label(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    parts = value.strip().split()
    if not parts:
        return None
    tail = parts[-1]
    try:
        float(tail)
        return tail
    except ValueError:
        return None


def _line_from_market_group(group: list[dict[str, Any]]) -> float | None:
    if not group:
        return None
    first = group[0]
    projected_line = _to_float(first.get("projected_line"))
    if projected_line is not None:
        return projected_line
    return _to_float(_line_from_label(first.get("label")))


def _line_already_resolved(
    *,
    group: list[dict[str, Any]],
    market_key: str,
    line: float | None,
    current_runs: float | None,
    balls_remaining: int | None,
) -> bool:
    if line is None:
        return False

    has_over_under_shape = all(
        str(item.get("selection_key") or "").lower().startswith(("over", "under"))
        or str(item.get("label") or "").lower().startswith(("over", "under"))
        for item in group
    )
    if not has_over_under_shape:
        return False

    if _is_incremental_market(market_key):
        # For next-over/session markets line is incremental, not absolute total.
        if balls_remaining is not None and balls_remaining <= 0:
            return True
        return False

    if current_runs is not None and current_runs > line:
        return True

    if balls_remaining is not None and balls_remaining <= 0:
        return True

    return False


def _likely_side_floor(
    *,
    group: list[dict[str, Any]],
    market_key: str,
    line: float | None,
    current_runs: float | None,
    balls_remaining: int | None,
    match_state: Any,
) -> tuple[int | None, float | None]:
    if line is None:
        return None, None

    over_idx, under_idx = _find_over_under_indices(group)
    if over_idx is None or under_idx is None:
        return None, None

    rr = _to_float(getattr(match_state, "current_run_rate", None)) or 0.0
    conservative_rr = max(2.5, rr * 0.72)

    if _is_incremental_market(market_key):
        window_balls = _window_balls(group, balls_remaining)
        expected_window = conservative_rr * max(window_balls, 0) / 6.0
        projected_floor = expected_window * 0.58
        gap = projected_floor - line
    else:
        if current_runs is None:
            return None, None
        if balls_remaining is None:
            expected_remaining = conservative_rr * 2.0
        else:
            expected_remaining = conservative_rr * max(balls_remaining, 0) / 6.0
        projected_floor = current_runs + (expected_remaining * 0.58)
        gap = projected_floor - line

    # Over is increasingly likely as projected floor exceeds the line.
    if gap >= 18.0:
        return over_idx, 0.90
    if gap >= 12.0:
        return over_idx, 0.86
    if gap >= 7.0:
        return over_idx, 0.81
    if gap >= 4.0:
        return over_idx, 0.76

    if gap <= -18.0:
        return under_idx, 0.90
    if gap <= -12.0:
        return under_idx, 0.86
    if gap <= -7.0:
        return under_idx, 0.81
    if gap <= -4.0:
        return under_idx, 0.76

    return None, None


def _find_over_under_indices(group: list[dict[str, Any]]) -> tuple[int | None, int | None]:
    over_idx: int | None = None
    under_idx: int | None = None
    for idx, item in enumerate(group):
        selection = str(item.get("selection_key") or "").lower()
        label = str(item.get("label") or "").lower()
        if over_idx is None and (selection.startswith("over") or label.startswith("over")):
            over_idx = idx
        if under_idx is None and (selection.startswith("under") or label.startswith("under")):
            under_idx = idx
    return over_idx, under_idx


def _snap_probability_step(
    value: float,
    *,
    step: float,
    floor: float,
    ceiling: float,
) -> float:
    bounded = max(floor, min(ceiling, value))
    snapped = round(bounded / step) * step
    snapped = max(floor, min(ceiling, snapped))
    # maintain two-way closure headroom
    return max(0.05, min(0.95, snapped))


def _is_incremental_market(market_key: str) -> bool:
    key = market_key.lower()
    return key.startswith("fancy_session_") or key.startswith("fancy_next_")


def _window_balls(group: list[dict[str, Any]], balls_remaining: int | None) -> int:
    if not group:
        return max(0, balls_remaining or 0)

    first = group[0]
    trace_meta = first.get("trace_meta")
    if isinstance(trace_meta, dict):
        active_balls = _to_float(trace_meta.get("active_balls"))
        if active_balls is not None and active_balls > 0:
            return int(active_balls)

    label = str(first.get("window_label") or "").lower()
    if "next over" in label:
        raw = 6
    elif "balls remaining" in label:
        raw = _first_numeric_token(label)
    else:
        overs = _first_numeric_token(label)
        raw = int(overs * 6) if overs is not None else None

    if raw is None:
        return max(0, balls_remaining or 0)

    if balls_remaining is None:
        return max(0, int(raw))
    return max(0, min(int(raw), int(balls_remaining)))


def _first_numeric_token(value: str) -> float | None:
    for token in value.replace("(", " ").replace(")", " ").split():
        try:
            return float(token)
        except ValueError:
            continue
    return None
