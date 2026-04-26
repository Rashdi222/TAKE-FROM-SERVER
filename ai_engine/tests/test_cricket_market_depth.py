from __future__ import annotations

import sys
import unittest
from decimal import Decimal
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from cricket.exposure import apply_exposure_shading
from cricket.fancy_reviewer import review_fancy_markets
from cricket.fancy_generator import build_fancy_markets
from cricket.market_factory import build_candidate_markets, project_final_total


class MatchStateStub:
    def __init__(self) -> None:
        self.runs_total = 117
        self.wickets_total = 8
        self.current_run_rate = "7.50"
        self.momentum_index = "0"
        self.target_runs = 183
        self.format = "t20"


class CricketMarketDepthTests(unittest.TestCase):
    def test_candidate_markets_include_totals_ladder(self) -> None:
        markets = build_candidate_markets(
            match_state=MatchStateStub(),
            team1_name="Quetta Gladiators",
            team2_name="Rawalpindiz",
            batting_side="team2",
            over_number=15.6,
            balls_remaining=25,
            probability_team1=0.88,
            confidence=0.5,
            margin=Decimal("0.04"),
        )

        ladder = [market for market in markets if market.get("market_key") == "over_under_ladder"]
        self.assertEqual(len(ladder), 10)
        specials = [market for market in markets if str(market.get("market_key", "")).startswith("next_")]
        self.assertEqual(len(specials), 6)

    def test_in_play_specials_apply_bounded_liquidity_nudge(self) -> None:
        neutral = build_candidate_markets(
            match_state=MatchStateStub(),
            team1_name="Quetta Gladiators",
            team2_name="Rawalpindiz",
            batting_side="team2",
            over_number=15.6,
            balls_remaining=25,
            probability_team1=0.88,
            confidence=0.5,
            margin=Decimal("0.04"),
        )
        pressured = build_candidate_markets(
            match_state=MatchStateStub(),
            team1_name="Quetta Gladiators",
            team2_name="Rawalpindiz",
            batting_side="team2",
            over_number=15.6,
            balls_remaining=25,
            probability_team1=0.88,
            confidence=0.5,
            margin=Decimal("0.04"),
            liability_book={
                "markets": {
                    "next_over_wicket": {
                        "selections": {
                            "yes": {"potential_payout": 4500},
                            "no": {"potential_payout": 1000},
                        }
                    }
                }
            },
        )

        neutral_wicket_yes = next(m for m in neutral if m.get("market_key") == "next_over_wicket" and m.get("selection_key") == "yes")
        pressured_wicket_yes = next(m for m in pressured if m.get("market_key") == "next_over_wicket" and m.get("selection_key") == "yes")

        self.assertGreater(float(pressured_wicket_yes["trace_meta"]["liquidity_nudge"]), 0.0)
        self.assertLess(Decimal(pressured_wicket_yes["price"]), Decimal(neutral_wicket_yes["price"]))

    def test_fancy_markets_emit_ten_prices_per_window(self) -> None:
        fancy_markets = build_fancy_markets(
            match_state=MatchStateStub(),
            memory_context={"recent_events": []},
            over_number=15.6,
            balls_remaining=25,
            confidence=0.5,
            margin=Decimal("0.04"),
            engine_trace_id="trace-1",
        )

        six_over = [market for market in fancy_markets if market.get("market_key") == "fancy_session_6_overs"]
        self.assertEqual(len(six_over), 10)

    def test_next_over_market_uses_full_over_run_rate(self) -> None:
        fancy_markets = build_fancy_markets(
            match_state=MatchStateStub(),
            memory_context={"recent_events": []},
            over_number=15.6,
            balls_remaining=25,
            confidence=0.5,
            margin=Decimal("0.04"),
            engine_trace_id="trace-next-over",
        )

        next_over_rows = [
            market
            for market in fancy_markets
            if market.get("market_key") == "fancy_next_over"
        ]
        self.assertTrue(next_over_rows)
        self.assertTrue(all(row.get("window_label") == "Runs In Next Over" for row in next_over_rows))
        projected_lines = {
            float(market.get("projected_line"))
            for market in next_over_rows
            if market.get("projected_line") is not None
        }
        self.assertTrue(any(line >= 3.5 for line in projected_lines))

    def test_fancy_window_label_reflects_partial_remaining_balls(self) -> None:
        fancy_markets = build_fancy_markets(
            match_state=MatchStateStub(),
            memory_context={"recent_events": []},
            over_number=18.5,
            balls_remaining=7,
            confidence=0.5,
            margin=Decimal("0.04"),
            engine_trace_id="trace-partial-window",
        )

        session_market = next(
            market
            for market in fancy_markets
            if market.get("market_key") == "fancy_session_6_overs"
        )
        self.assertIn("Balls Remaining", session_market.get("window_label", ""))

    def test_fancy_markets_are_identity_deduped(self) -> None:
        fancy_markets = build_fancy_markets(
            match_state=MatchStateStub(),
            memory_context={"recent_events": [{"event_type": "dot"} for _ in range(20)]},
            over_number=19.2,
            balls_remaining=9,
            confidence=0.5,
            margin=Decimal("0.04"),
            engine_trace_id="trace-dedupe",
        )

        identities = {
            (
                str(market.get("market_key")),
                str(market.get("selection_key")),
                str(market.get("window_label")),
                str(market.get("projected_line")),
            )
            for market in fancy_markets
        }
        self.assertEqual(len(identities), len(fancy_markets))

    def test_exposure_phase_profile_tightens_in_fragile_death_chase(self) -> None:
        liability_book = {
            "policy": {
                "selection_soft_share": 0.58,
                "selection_hard_share": 0.68,
                "max_probability_shade": 0.04,
                "high_user_concentration_ratio": 0.45,
            },
            "markets": {
                "match_winner": {
                    "selections": {
                        "team1": {"potential_payout": 1000, "max_user_potential": 200},
                        "team2": {"potential_payout": 4000, "max_user_potential": 2400},
                    }
                }
            },
        }

        neutral = apply_exposure_shading(
            liability_book=liability_book,
            candidate_probability=0.62,
            current_published_probability=0.6,
            prior_probability=0.59,
            match_state=MatchStateStub(),
            batting_side="team2",
            balls_remaining=60,
            boundary_pressure={"desperate_chase": False},
        )
        death = apply_exposure_shading(
            liability_book=liability_book,
            candidate_probability=0.62,
            current_published_probability=0.6,
            prior_probability=0.59,
            match_state=MatchStateStub(),
            batting_side="team2",
            balls_remaining=18,
            boundary_pressure={"desperate_chase": True},
        )

        self.assertLess(death.max_allowed_high, neutral.max_allowed_high)
        self.assertIn("phase_profile", death.summary)
        self.assertEqual(death.summary["phase_profile"]["name"], "death_over_chase")

    def test_fancy_cluster_wickets_suspends_only_short_windows(self) -> None:
        fancy_markets = [
            {
                "market_key": "fancy_session_6_overs",
                "selection_key": "over_12.5",
                "window_label": "Runs In Next 6 Overs",
                "projected_line": "12.5",
                "valid_for_ms": 1800,
                "trace_meta": {"projection_key": "fancy_session_6_overs::12.5"},
            },
            {
                "market_key": "fancy_session_20_overs",
                "selection_key": "over_30.5",
                "window_label": "Runs In Next 20 Overs",
                "projected_line": "30.5",
                "valid_for_ms": 1800,
                "trace_meta": {"projection_key": "fancy_session_20_overs::30.5"},
            },
        ]
        memory_context = {
            "recent_events": [
                {"event_type": "dot"},
                {"event_type": "wicket"},
                {"event_type": "single"},
                {"event_type": "wicket"},
            ]
        }

        reviewed, flags, reason = review_fancy_markets(
            fancy_markets=fancy_markets,
            memory_context=memory_context,
            over_number=15.6,
            balls_remaining=25,
        )

        self.assertIsNone(reason)
        self.assertIn("fancy_window_specific_suspension", flags)
        self.assertTrue(reviewed[0]["is_suspended"])
        self.assertFalse(reviewed[1].get("is_suspended", False))

    def test_odi_totals_ladder_uses_10_run_step(self) -> None:
        state = MatchStateStub()
        state.format = "odi"
        state.runs_total = 225
        state.wickets_total = 4
        state.current_run_rate = "6.00"
        state.target_runs = None

        markets = build_candidate_markets(
            match_state=state,
            team1_name="A",
            team2_name="B",
            batting_side="team1",
            over_number=35.0,
            balls_remaining=90,
            probability_team1=0.52,
            confidence=0.52,
            margin=Decimal("0.04"),
            format_name="odi",
        )

        lines = sorted(
            {
                float(m["projected_line"])
                for m in markets
                if m.get("market_key") == "over_under_ladder" and str(m.get("selection_key", "")).startswith("over_")
            }
        )
        self.assertGreaterEqual(len(lines), 5)
        step_values = [round(lines[i + 1] - lines[i], 1) for i in range(len(lines) - 1)]
        self.assertTrue(all(step == 10.0 for step in step_values))

    def test_project_final_total_fallback_respects_match_format_when_balls_missing(self) -> None:
        t20_state = MatchStateStub()
        t20_state.format = "t20"
        t20_state.runs_total = 150
        t20_state.wickets_total = 3
        t20_state.current_run_rate = "6.00"

        odi_state = MatchStateStub()
        odi_state.format = "odi"
        odi_state.runs_total = 150
        odi_state.wickets_total = 3
        odi_state.current_run_rate = "6.00"

        t20_total = project_final_total(t20_state, 25.0, None)
        odi_total = project_final_total(odi_state, 25.0, None)

        self.assertGreater(odi_total, t20_total + 10.0)


if __name__ == "__main__":
    unittest.main()
