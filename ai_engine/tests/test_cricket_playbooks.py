from __future__ import annotations

import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from cricket.playbooks.false_dawn_recovery import evaluate_false_dawn_recovery
from cricket.playbooks.fake_chase_surge import evaluate_fake_chase_surge
from cricket.playbooks.innings_restart import evaluate_innings_restart
from cricket.playbooks.lower_order_burst import evaluate_lower_order_burst
from cricket.playbooks.partnership_break import evaluate_partnership_break
from cricket.playbooks.powerplay_squeeze import evaluate_powerplay_squeeze
from cricket.playbooks.rain_dls_distortion import evaluate_rain_dls_distortion
from cricket.playbooks.set_batter_wicket_shock import evaluate_set_batter_wicket_shock
from cricket.playbooks.super_over_surge import evaluate_super_over_surge
from cricket.playbooks.tail_exposed import evaluate_tail_exposed


class CricketPlaybookTests(unittest.TestCase):
    def test_tail_exposed_triggers_for_fragile_chase(self) -> None:
        playbook = evaluate_tail_exposed(
            batting_side="team2",
            wickets_total=8,
            over_number=17.1,
            target_runs=183,
            required_run_rate=14.5,
            balls_remaining=17,
            boundary_pressure={"desperate_chase": True},
        )

        self.assertIsNotNone(playbook)
        self.assertEqual(playbook["id"], "tail_exposed")
        self.assertGreater(playbook["team1_delta"], 0.0)

    def test_powerplay_squeeze_triggers_on_dot_ball_cluster(self) -> None:
        playbook = evaluate_powerplay_squeeze(
            batting_side="team1",
            over_number=4.2,
            inning=1,
            recent_events=[
                {"event_type": "dot"},
                {"event_type": "dot_ball"},
                {"event_type": "single"},
                {"event_type": "dot"},
                {"event_type": "wicket"},
                {"event_type": "dot"},
            ],
            batsman_strike_rates=[104.0, 112.0],
        )

        self.assertIsNotNone(playbook)
        self.assertEqual(playbook["id"], "powerplay_squeeze")
        self.assertLess(playbook["team1_delta"], 0.0)

    def test_false_dawn_recovery_triggers_after_boundary_following_wicket(self) -> None:
        playbook = evaluate_false_dawn_recovery(
            batting_side="team2",
            target_runs=183,
            over_number=16.2,
            recent_events=[
                {"event_type": "single"},
                {"event_type": "wicket"},
                {"event_type": "six"},
            ],
            boundary_pressure={"desperate_chase": True},
        )

        self.assertIsNotNone(playbook)
        self.assertEqual(playbook["id"], "false_dawn_recovery")
        self.assertGreater(playbook["team1_delta"], 0.0)

    def test_set_batter_wicket_shock_triggers_for_accelerating_wicket(self) -> None:
        playbook = evaluate_set_batter_wicket_shock(
            event_type="wicket",
            batting_side="team2",
            over_number=15.4,
            inning=2,
            recent_events=[
                {"event_type": "single"},
                {"event_type": "four"},
                {"event_type": "six"},
                {"event_type": "wicket"},
            ],
            batsman_strike_rates=[154.0, 132.0],
            target_runs=183,
            required_run_rate=11.2,
        )

        self.assertIsNotNone(playbook)
        self.assertEqual(playbook["id"], "set_batter_wicket_shock")
        self.assertGreater(playbook["team1_delta"], 0.0)

    def test_partnership_break_triggers_for_flowing_chase_wicket(self) -> None:
        playbook = evaluate_partnership_break(
            event_type="wicket",
            batting_side="team2",
            over_number=13.2,
            recent_events=[
                {"event_type": "single"},
                {"event_type": "four"},
                {"event_type": "double"},
                {"event_type": "single"},
                {"event_type": "six"},
                {"event_type": "wicket"},
            ],
            wickets_total=4,
            target_runs=183,
            required_run_rate=9.1,
        )

        self.assertIsNotNone(playbook)
        self.assertEqual(playbook["id"], "partnership_break")
        self.assertGreater(playbook["team1_delta"], 0.0)

    def test_rain_dls_distortion_triggers_under_weather_pressure(self) -> None:
        playbook = evaluate_rain_dls_distortion(
            dossier={"weather_profile": {"interruption_risk": 0.8}},
            event_type="weather_alert",
            batting_side="team2",
            target_runs=183,
            required_run_rate=10.2,
            balls_remaining=24,
        )

        self.assertIsNotNone(playbook)
        self.assertEqual(playbook["id"], "rain_dls_distortion")
        self.assertGreater(playbook["team1_delta"], 0.0)

    def test_innings_restart_triggers_early_second_innings(self) -> None:
        playbook = evaluate_innings_restart(
            event_type="innings_break",
            batting_side="team2",
            over_number=0.0,
            target_runs=165,
            balls_remaining=120,
        )

        self.assertIsNotNone(playbook)
        self.assertEqual(playbook["id"], "innings_restart")
        self.assertGreater(playbook["team1_delta"], 0.0)

    def test_fake_chase_surge_triggers_under_boundary_burst_with_pressure(self) -> None:
        playbook = evaluate_fake_chase_surge(
            batting_side="team2",
            target_runs=183,
            over_number=16.4,
            recent_events=[
                {"event_type": "dot"},
                {"event_type": "four"},
                {"event_type": "dot_ball"},
                {"event_type": "six"},
            ],
            boundary_pressure={"desperate_chase": True},
            required_run_rate=12.0,
        )

        self.assertIsNotNone(playbook)
        self.assertEqual(playbook["id"], "fake_chase_surge")
        self.assertGreater(playbook["team1_delta"], 0.0)

    def test_lower_order_burst_preserves_some_batting_upside(self) -> None:
        playbook = evaluate_lower_order_burst(
            batting_side="team2",
            wickets_total=7,
            over_number=18.2,
            recent_events=[
                {"event_type": "single"},
                {"event_type": "four"},
                {"event_type": "double"},
                {"event_type": "six"},
            ],
            target_runs=183,
            required_run_rate=11.4,
        )

        self.assertIsNotNone(playbook)
        self.assertEqual(playbook["id"], "lower_order_burst")
        self.assertLess(playbook["team1_delta"], 0.0)

    def test_super_over_surge_triggers_for_extreme_endgame(self) -> None:
        playbook = evaluate_super_over_surge(
            event_type="super_over",
            batting_side="team2",
            over_number=19.5,
            balls_remaining=6,
        )

        self.assertIsNotNone(playbook)
        self.assertEqual(playbook["id"], "super_over_surge")
        self.assertLess(playbook["team1_delta"], 0.0)


if __name__ == "__main__":
    unittest.main()
