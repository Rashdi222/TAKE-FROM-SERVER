from __future__ import annotations

from typing import Any

from cricket.playbooks.death_over_panic import evaluate_death_over_panic
from cricket.playbooks.early_wicket import evaluate_early_wicket_trap
from cricket.playbooks.false_dawn_recovery import evaluate_false_dawn_recovery
from cricket.playbooks.innings_restart import evaluate_innings_restart
from cricket.playbooks.lower_order_burst import evaluate_lower_order_burst
from cricket.playbooks.fake_chase_surge import evaluate_fake_chase_surge
from cricket.playbooks.partnership_break import evaluate_partnership_break
from cricket.playbooks.powerplay_squeeze import evaluate_powerplay_squeeze
from cricket.playbooks.pitch_degradation import evaluate_pitch_degradation
from cricket.playbooks.rain_dls_distortion import evaluate_rain_dls_distortion
from cricket.playbooks.set_batter_wicket_shock import evaluate_set_batter_wicket_shock
from cricket.playbooks.super_over_surge import evaluate_super_over_surge
from cricket.playbooks.tail_exposed import evaluate_tail_exposed


def resolve_playbooks(
    *,
    dossier: dict[str, Any],
    event_type: str | None,
    over_number: float,
    batting_side: str,
    inning: int,
    target_runs: int | None,
    runs_total: int,
    wickets_total: int,
    required_run_rate: float | None,
    balls_remaining: int | None,
    recent_events: list[dict[str, Any]] | None,
    batsman_strike_rates: list[float] | None,
    boundary_pressure: dict[str, Any] | None,
) -> list[dict[str, Any]]:
    playbooks: list[dict[str, Any]] = []

    early = evaluate_early_wicket_trap(
        event_type=event_type,
        over_number=over_number,
        batting_side=batting_side,
    )
    if early:
        playbooks.append(early)

    death = evaluate_death_over_panic(
        over_number=over_number,
        batting_side=batting_side,
        target_runs=target_runs,
        runs_total=runs_total,
        required_run_rate=required_run_rate,
    )
    if death:
        playbooks.append(death)

    tail = evaluate_tail_exposed(
        batting_side=batting_side,
        wickets_total=wickets_total,
        over_number=over_number,
        target_runs=target_runs,
        required_run_rate=required_run_rate,
        balls_remaining=balls_remaining,
        boundary_pressure=boundary_pressure or {},
    )
    if tail:
        playbooks.append(tail)

    squeeze = evaluate_powerplay_squeeze(
        batting_side=batting_side,
        over_number=over_number,
        inning=inning,
        recent_events=recent_events or [],
        batsman_strike_rates=batsman_strike_rates or [],
    )
    if squeeze:
        playbooks.append(squeeze)

    false_dawn = evaluate_false_dawn_recovery(
        batting_side=batting_side,
        target_runs=target_runs,
        over_number=over_number,
        recent_events=recent_events or [],
        boundary_pressure=boundary_pressure or {},
    )
    if false_dawn:
        playbooks.append(false_dawn)

    fake_surge = evaluate_fake_chase_surge(
        batting_side=batting_side,
        target_runs=target_runs,
        over_number=over_number,
        recent_events=recent_events or [],
        boundary_pressure=boundary_pressure or {},
        required_run_rate=required_run_rate,
    )
    if fake_surge:
        playbooks.append(fake_surge)

    partnership_break = evaluate_partnership_break(
        event_type=event_type,
        batting_side=batting_side,
        over_number=over_number,
        recent_events=recent_events or [],
        wickets_total=wickets_total,
        target_runs=target_runs,
        required_run_rate=required_run_rate,
    )
    if partnership_break:
        playbooks.append(partnership_break)

    wicket_shock = evaluate_set_batter_wicket_shock(
        event_type=event_type,
        batting_side=batting_side,
        over_number=over_number,
        inning=inning,
        recent_events=recent_events or [],
        batsman_strike_rates=batsman_strike_rates or [],
        target_runs=target_runs,
        required_run_rate=required_run_rate,
    )
    if wicket_shock:
        playbooks.append(wicket_shock)

    lower_order_burst = evaluate_lower_order_burst(
        batting_side=batting_side,
        wickets_total=wickets_total,
        over_number=over_number,
        recent_events=recent_events or [],
        target_runs=target_runs,
        required_run_rate=required_run_rate,
    )
    if lower_order_burst:
        playbooks.append(lower_order_burst)

    innings_restart = evaluate_innings_restart(
        event_type=event_type,
        batting_side=batting_side,
        over_number=over_number,
        target_runs=target_runs,
        balls_remaining=balls_remaining,
    )
    if innings_restart:
        playbooks.append(innings_restart)

    pitch = evaluate_pitch_degradation(
        dossier=dossier,
        batting_side=batting_side,
        inning=inning,
        target_runs=target_runs,
        over_number=over_number,
    )
    if pitch:
        playbooks.append(pitch)

    rain_distortion = evaluate_rain_dls_distortion(
        dossier=dossier,
        event_type=event_type,
        batting_side=batting_side,
        target_runs=target_runs,
        required_run_rate=required_run_rate,
        balls_remaining=balls_remaining,
    )
    if rain_distortion:
        playbooks.append(rain_distortion)

    super_over_surge = evaluate_super_over_surge(
        event_type=event_type,
        batting_side=batting_side,
        over_number=over_number,
        balls_remaining=balls_remaining,
    )
    if super_over_surge:
        playbooks.append(super_over_surge)

    return playbooks
