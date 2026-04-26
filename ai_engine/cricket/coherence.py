from __future__ import annotations

import re
from decimal import Decimal
from typing import Any

from cricket.risk_limits import ReviewerLimits, parse_decimal, parse_float


def evaluate_market_coherence(
    *,
    markets: list[dict[str, Any]],
    current_odds: list[Any],
    match_state: Any,
    limits: ReviewerLimits,
    fancy_markets: list[dict[str, Any]] | None = None,
) -> tuple[list[str], list[str]]:
    hard_flags: list[str] = []
    soft_flags: list[str] = []

    hard_flags.extend(check_absolute_bounds(markets, limits))
    hard_flags.extend(check_two_way_totals(markets, limits))
    hard_flags.extend(check_irrational_drift(markets, current_odds))
    hard_flags.extend(check_over_under_consistency(markets, match_state))

    if fancy_markets:
        hard_flags.extend(check_fancy_two_way_totals(fancy_markets, limits))

    if not markets:
        hard_flags.append("no_markets_emitted")

    return dedupe(hard_flags), dedupe(soft_flags)


def check_absolute_bounds(markets: list[dict[str, Any]], limits: ReviewerLimits) -> list[str]:
    flags: list[str] = []
    for market in markets:
        price = parse_decimal(market.get("price"))
        label = market.get("label") or market.get("selection_key") or market.get("market_key") or "unknown"
        if price is None:
            flags.append(f"invalid_price:{label}")
            continue
        if price < limits.min_decimal_odds:
            flags.append(f"reviewer_hard_bound_violation:below_floor:{label}:{price}")
        elif price > limits.hard_decimal_ceiling:
            flags.append(f"reviewer_hard_bound_violation:above_hard_ceiling:{label}:{price}")
        elif price > limits.soft_decimal_ceiling:
            flags.append(f"soft_ceiling_breach:{label}:{price}")
    return flags


def check_two_way_totals(markets: list[dict[str, Any]], limits: ReviewerLimits) -> list[str]:
    flags: list[str] = []
    for market_key in {"match_winner", "over_under", "in_play"}:
        rows = [market for market in markets if market.get("market_key") == market_key]
        if not rows:
            continue
        if len(rows) != 2:
            flags.append(f"market_coherence_invalid_pair_count:{market_key}")
            continue

        implied_total = 0.0
        for row in rows:
            price = parse_float(row.get("price"))
            if price is None or price <= 1.0:
                flags.append(f"market_coherence_invalid_price:{market_key}")
                implied_total = -1.0
                break
            implied_total += 1.0 / price

        if implied_total < 0:
            continue

        if implied_total < limits.two_way_total_min or implied_total > limits.two_way_total_max:
            flags.append(f"market_coherence_broken_total:{market_key}:{implied_total:.4f}")
    return flags


def check_irrational_drift(markets: list[dict[str, Any]], current_odds: list[Any]) -> list[str]:
    flags: list[str] = []
    for market_key in {"match_winner", "in_play"}:
        rows = [market for market in markets if market.get("market_key") == market_key]
        if len(rows) != 2:
            continue

        candidate_prices = {str(row.get("selection_key")): parse_float(row.get("price")) for row in rows}
        current_prices = current_market_prices(current_odds, market_key)
        if len(current_prices) < 2:
            continue

        shared_keys = [key for key in candidate_prices.keys() if key in current_prices]
        if len(shared_keys) < 2:
            continue

        movements = []
        for key in shared_keys:
            candidate = candidate_prices.get(key)
            current = current_prices.get(key)
            if candidate is None or current is None:
                continue
            delta = candidate - current
            if abs(delta) < 0.02:
                continue
            movements.append(delta)

        if len(movements) == 2 and ((movements[0] > 0 and movements[1] > 0) or (movements[0] < 0 and movements[1] < 0)):
            flags.append(f"market_coherence_same_direction_drift:{market_key}")
    return flags


def check_over_under_consistency(markets: list[dict[str, Any]], match_state: Any) -> list[str]:
    rows = [market for market in markets if market.get("market_key") == "over_under"]
    if len(rows) != 2:
        return []

    current_total = float(getattr(match_state, "runs_total", 0) or 0)
    lines = [extract_numeric_line(row.get("label")) for row in rows]
    if any(line is None for line in lines):
        return ["market_coherence_invalid_total_line:over_under"]

    line = lines[0]
    if line is None:
        return ["market_coherence_invalid_total_line:over_under"]

    if line <= current_total:
        return [f"market_coherence_total_line_below_score:{line:.1f}:{current_total:.1f}"]

    return []


def current_market_prices(current_odds: list[Any], market_key: str) -> dict[str, float]:
    result: dict[str, float] = {}
    for row in current_odds:
        row_market_key = getattr(row, "market_key", None)
        if row_market_key != market_key:
            continue
        selection_key = getattr(row, "selection_key", None)
        price = parse_float(getattr(row, "price", None))
        if selection_key is None or price is None:
            continue
        result[str(selection_key)] = price
    return result


def extract_numeric_line(label: Any) -> float | None:
    if not isinstance(label, str):
        return None
    match = re.search(r"(\d+(?:\.\d+)?)", label)
    if not match:
        return None
    try:
        return float(Decimal(match.group(1)))
    except Exception:
        return None


def check_fancy_two_way_totals(fancy_markets: list[dict[str, Any]], limits: ReviewerLimits) -> list[str]:
    """Check each (market_key, projected_line) pair in fancy and ladder markets sums correctly."""
    flags: list[str] = []
    # Group by (market_key, projected_line) — each pair must be over+under
    pairs: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for market in fancy_markets:
        market_key = str(market.get("market_key") or "")
        projected_line = str(market.get("projected_line") or "")
        if not market_key or not projected_line:
            continue
        key = (market_key, projected_line)
        pairs.setdefault(key, []).append(market)

    for (market_key, projected_line), rows in pairs.items():
        if len(rows) != 2:
            flags.append(f"fancy_coherence_invalid_pair:{market_key}:{projected_line}")
            continue

        implied_total = 0.0
        valid = True
        for row in rows:
            price = parse_float(row.get("price"))
            if price is None or price <= 1.0:
                flags.append(f"fancy_coherence_invalid_price:{market_key}:{projected_line}")
                valid = False
                break
            implied_total += 1.0 / price

        if not valid:
            continue

        # Fancy markets carry higher margin so allow up to 1.25
        if implied_total < limits.two_way_total_min or implied_total > 1.25:
            flags.append(f"fancy_coherence_broken_total:{market_key}:{projected_line}:{implied_total:.4f}")

    return flags


def dedupe(flags: list[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for flag in flags:
        if flag in seen:
            continue
        seen.add(flag)
        ordered.append(flag)
    return ordered

