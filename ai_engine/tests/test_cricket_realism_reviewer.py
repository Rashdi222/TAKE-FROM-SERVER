from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from cricket.realism_reviewer import apply_realism_review


class MatchStateStub:
    def __init__(self, runs_total: int, current_run_rate: str = "8.0") -> None:
        self.runs_total = runs_total
        self.current_run_rate = current_run_rate


class CricketRealismReviewerTests(unittest.TestCase):
    def test_hardens_overly_soft_two_way_totals_market(self) -> None:
        markets = [
            {
                "market_key": "over_under",
                "selection_key": "over",
                "label": "Over 50.5",
                "price": "1.05",
                "trace_meta": {},
            },
            {
                "market_key": "over_under",
                "selection_key": "under",
                "label": "Under 50.5",
                "price": "9.50",
                "trace_meta": {},
            },
        ]

        reviewed, flags = apply_realism_review(
            markets=markets,
            match_state=MatchStateStub(runs_total=12),
            over_number=6.0,
            balls_remaining=84,
        )

        over_price = float(reviewed[0]["price"])
        under_price = float(reviewed[1]["price"])

        self.assertLessEqual(over_price, 1.10)
        self.assertGreaterEqual(under_price, 7.0)
        self.assertTrue(any(flag.startswith("realism_prob_lattice:") for flag in flags))
        self.assertTrue(reviewed[0]["trace_meta"].get("realism_review_applied"))

    def test_does_not_touch_non_eligible_market(self) -> None:
        markets = [
            {
                "market_key": "match_winner",
                "selection_key": "team1",
                "label": "Team 1",
                "price": "1.20",
                "trace_meta": {},
            },
            {
                "market_key": "match_winner",
                "selection_key": "team2",
                "label": "Team 2",
                "price": "4.80",
                "trace_meta": {},
            },
        ]

        reviewed, flags = apply_realism_review(
            markets=markets,
            match_state=MatchStateStub(runs_total=12),
            over_number=6.0,
            balls_remaining=84,
        )

        self.assertEqual(reviewed[0]["price"], "1.20")
        self.assertEqual(reviewed[1]["price"], "4.80")
        self.assertEqual(flags, [])

    def test_resolved_line_is_auto_suspended(self) -> None:
        markets = [
            {
                "market_key": "over_under",
                "selection_key": "over",
                "label": "Over 50.5",
                "price": "1.60",
                "trace_meta": {},
            },
            {
                "market_key": "over_under",
                "selection_key": "under",
                "label": "Under 50.5",
                "price": "2.30",
                "trace_meta": {},
            },
        ]

        reviewed, flags = apply_realism_review(
            markets=markets,
            match_state=MatchStateStub(runs_total=72),
            over_number=12.4,
            balls_remaining=40,
        )

        self.assertTrue(reviewed[0].get("is_suspended"))
        self.assertTrue(reviewed[1].get("is_suspended"))
        self.assertEqual(reviewed[0].get("reason"), "line_already_resolved")
        self.assertTrue(any(flag.startswith("realism_resolved_line_suspend:") for flag in flags))

    def test_probability_lattice_flag_added_for_eligible_pairs(self) -> None:
        markets = [
            {
                "market_key": "over_under",
                "selection_key": "over",
                "label": "Over 140.5",
                "price": "1.41",
                "trace_meta": {},
            },
            {
                "market_key": "over_under",
                "selection_key": "under",
                "label": "Under 140.5",
                "price": "3.35",
                "trace_meta": {},
            },
        ]

        reviewed, flags = apply_realism_review(
            markets=markets,
            match_state=MatchStateStub(runs_total=40),
            over_number=7.0,
            balls_remaining=78,
        )

        self.assertTrue(any(flag.startswith("realism_prob_lattice:") for flag in flags))
        self.assertIn("realism_lattice_fair_prob", reviewed[0]["trace_meta"])

    def test_overround_floor_is_enforced_for_totals(self) -> None:
        markets = [
            {
                "market_key": "over_under",
                "selection_key": "over",
                "label": "Over 150.5",
                "price": "2.20",
                "trace_meta": {},
            },
            {
                "market_key": "over_under",
                "selection_key": "under",
                "label": "Under 150.5",
                "price": "2.20",
                "trace_meta": {},
            },
        ]

        reviewed, flags = apply_realism_review(
            markets=markets,
            match_state=MatchStateStub(runs_total=30, current_run_rate="8.8"),
            over_number=6.0,
            balls_remaining=84,
        )

        over_prob = 1.0 / float(reviewed[0]["price"])
        under_prob = 1.0 / float(reviewed[1]["price"])
        self.assertGreaterEqual(over_prob + under_prob, 1.05)
        self.assertTrue(any(flag.startswith("realism_overround_floor:") for flag in flags))

    def test_likely_side_floor_hardens_easy_over_case(self) -> None:
        markets = [
            {
                "market_key": "over_under",
                "selection_key": "over",
                "label": "Over 50.5",
                "price": "1.65",
                "trace_meta": {},
            },
            {
                "market_key": "over_under",
                "selection_key": "under",
                "label": "Under 50.5",
                "price": "2.25",
                "trace_meta": {},
            },
        ]

        reviewed, flags = apply_realism_review(
            markets=markets,
            match_state=MatchStateStub(runs_total=34, current_run_rate="9.2"),
            over_number=5.0,
            balls_remaining=90,
        )

        self.assertLessEqual(float(reviewed[0]["price"]), 1.35)
        self.assertTrue(any(flag.startswith("realism_likely_side_floor:") for flag in flags))

    def test_incremental_fancy_session_is_not_resolved_by_current_total_runs(self) -> None:
        markets = [
            {
                "market_key": "fancy_session_10_overs",
                "selection_key": "over_32.5",
                "label": "Over 32.5",
                "window_label": "Runs In Next 10 Overs",
                "projected_line": "32.5",
                "price": "1.60",
                "trace_meta": {"active_balls": 60},
            },
            {
                "market_key": "fancy_session_10_overs",
                "selection_key": "under_32.5",
                "label": "Under 32.5",
                "window_label": "Runs In Next 10 Overs",
                "projected_line": "32.5",
                "price": "2.20",
                "trace_meta": {"active_balls": 60},
            },
        ]

        reviewed, flags = apply_realism_review(
            markets=markets,
            match_state=MatchStateStub(runs_total=140, current_run_rate="8.8"),
            over_number=12.0,
            balls_remaining=48,
        )

        self.assertFalse(reviewed[0].get("is_suspended", False))
        self.assertFalse(reviewed[1].get("is_suspended", False))
        self.assertFalse(any(flag.startswith("realism_resolved_line_suspend:") for flag in flags))

    def test_incremental_market_uses_window_runs_not_absolute_total(self) -> None:
        markets = [
            {
                "market_key": "fancy_session_10_overs",
                "selection_key": "over_38.5",
                "label": "Over 38.5",
                "window_label": "Runs In Next 10 Overs",
                "projected_line": "38.5",
                "price": "2.20",
                "trace_meta": {"active_balls": 60},
            },
            {
                "market_key": "fancy_session_10_overs",
                "selection_key": "under_38.5",
                "label": "Under 38.5",
                "window_label": "Runs In Next 10 Overs",
                "projected_line": "38.5",
                "price": "1.67",
                "trace_meta": {"active_balls": 60},
            },
        ]

        reviewed, _flags = apply_realism_review(
            markets=markets,
            match_state=MatchStateStub(runs_total=150, current_run_rate="7.2"),
            over_number=13.0,
            balls_remaining=60,
        )

        # Over should not be incorrectly treated as near-certain only because current total runs are high.
        self.assertGreaterEqual(float(reviewed[0]["price"]), 1.40)


if __name__ == "__main__":
    unittest.main()
