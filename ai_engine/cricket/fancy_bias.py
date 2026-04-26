from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class FancyTrapOutcome:
    displayed_line: float
    active_playbooks: list[str] = field(default_factory=list)
    flags: list[str] = field(default_factory=list)
    summary: dict[str, Any] = field(default_factory=dict)


def apply_fancy_bias(
    *,
    fair_line: float,
    overs_window: int,
    recent_events: list[dict[str, Any]],
) -> FancyTrapOutcome:
    dead_over_shift = dead_over_pressure_shift(recent_events, overs_window)
    false_recovery_shift = false_recovery_shift_amount(recent_events, overs_window)
    total_shift = dead_over_shift + false_recovery_shift
    displayed_line = round_to_half(max(0.5, fair_line + total_shift))

    active_playbooks: list[str] = []
    flags: list[str] = []
    if dead_over_shift != 0.0:
        active_playbooks.append("dead_over_pressure")
        flags.append(f"fancy_playbook:dead_over_pressure:{dead_over_shift:.2f}")
    if false_recovery_shift != 0.0:
        active_playbooks.append("false_recovery")
        flags.append(f"fancy_playbook:false_recovery:{false_recovery_shift:.2f}")

    return FancyTrapOutcome(
        displayed_line=displayed_line,
        active_playbooks=active_playbooks,
        flags=flags,
        summary={
            "fair_line": round(fair_line, 3),
            "displayed_line": round(displayed_line, 3),
            "total_shift": round(total_shift, 3),
            "dead_over_shift": round(dead_over_shift, 3),
            "false_recovery_shift": round(false_recovery_shift, 3),
        },
    )


def dead_over_pressure_shift(recent_events: list[dict[str, Any]], overs_window: int) -> float:
    recent = recent_events[-4:]
    if len(recent) < 3:
        return 0.0

    dot_count = sum(1 for event in recent if event.get("event_type") in {"dot", "dot_ball"})
    if dot_count < 3:
        return 0.0

    base_shift = -0.5 if dot_count == 3 else -1.0
    window_multiplier = 1.15 if overs_window <= 10 else 0.9
    return base_shift * window_multiplier


def false_recovery_shift_amount(recent_events: list[dict[str, Any]], overs_window: int) -> float:
    if len(recent_events) < 2:
        return 0.0

    last = recent_events[-1].get("event_type")
    previous = recent_events[-2].get("event_type")
    if previous != "wicket" or last not in {"four", "six", "boundary"}:
        return 0.0

    base_shift = 0.75 if last in {"four", "boundary"} else 1.0
    window_multiplier = 1.0 if overs_window <= 10 else 0.8
    return base_shift * window_multiplier


def round_to_half(value: float) -> float:
    return round(value * 2.0) / 2.0
