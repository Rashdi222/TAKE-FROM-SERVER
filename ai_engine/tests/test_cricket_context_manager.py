from __future__ import annotations

import sys
import unittest
from pathlib import Path
from decimal import Decimal


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from cricket.context_manager import assess_context_quality, heuristic_base_probability, run_rate_pressure
from cricket.in_play_generator import in_play_generator_node
from cricket.reviewer import review_candidate


class MatchStateStub:
    def __init__(
        self,
        *,
        target_runs: int | None,
        runs_total: int,
        wickets_total: int,
        current_run_rate: str | None,
        required_run_rate: str | None,
        momentum_index: str | None = "0",
    ) -> None:
        self.target_runs = target_runs
        self.runs_total = runs_total
        self.wickets_total = wickets_total
        self.current_run_rate = current_run_rate
        self.required_run_rate = required_run_rate
        self.momentum_index = momentum_index


class TriggerStub:
    def __init__(self, *, event_type: str, severity: str = "moderate") -> None:
        self.event_type = event_type
        self.severity = severity


class RequestStub:
    def __init__(self, *, match_state: MatchStateStub, event_type: str = "single") -> None:
        self.match_id = "match-1"
        self.trigger = TriggerStub(event_type=event_type)
        self.current_odds = []
        self.liability_book = {}
        self.match_state = match_state


class CricketContextManagerTests(unittest.TestCase):
    def test_chasing_team2_collapse_makes_team1_strong_favorite(self) -> None:
        match_state = MatchStateStub(
            target_runs=183,
            runs_total=117,
            wickets_total=8,
            current_run_rate="7.50",
            required_run_rate="15.00",
        )

        probability_team1 = heuristic_base_probability(
            match_state,
            "team2",
            25,
            {"venue_bias": {}},
        )

        self.assertGreater(
            probability_team1,
            0.85,
            "The defending team should be a strong favorite in a desperate team2 chase.",
        )

    def test_run_rate_pressure_benefits_team1_when_team2_is_behind_rate(self) -> None:
        match_state = MatchStateStub(
            target_runs=183,
            runs_total=117,
            wickets_total=8,
            current_run_rate="7.50",
            required_run_rate="15.00",
        )

        self.assertGreater(run_rate_pressure(match_state, "team2"), 0.0)
        self.assertLess(run_rate_pressure(match_state, "team1"), 0.0)

    def test_reviewer_allows_dampened_reprice_for_desperate_chase_jump(self) -> None:
        match_state = MatchStateStub(
            target_runs=183,
            runs_total=117,
            wickets_total=8,
            current_run_rate="7.50",
            required_run_rate="15.00",
        )
        request = RequestStub(match_state=match_state, event_type="single")

        outcome = review_candidate(
            request=request,
            team1_name="Quetta Gladiators",
            team2_name="Rawalpindiz",
            batting_side="team2",
            over_number=15.6,
            balls_remaining=25,
            candidate_probability=0.91,
            candidate_confidence=0.45,
            base_probability=0.91,
            prior_probability=0.24,
            current_published_probability=0.24,
            llm_error=None,
            generator_attempt=1,
            margin=Decimal("0.04"),
            hard_jump_threshold=0.20,
            volatility_mode_active=True,
            desperate_chase=True,
            bookmaker_summary={"boundary_pressure": {"desperate_chase": True, "aggressive_mode": True}},
        )

        self.assertEqual(outcome.decision, "approve_with_dampening")
        self.assertIsNotNone(outcome.approved_probability)
        self.assertGreater(outcome.approved_probability, 0.80)

    def test_sparse_context_reduces_generator_confidence(self) -> None:
        match_state = MatchStateStub(
            target_runs=183,
            runs_total=117,
            wickets_total=8,
            current_run_rate=None,
            required_run_rate=None,
        )

        quality = assess_context_quality(
            match_state=match_state,
            batting_side="unknown",
            balls_remaining=25,
            current_odds=[],
        )

        self.assertGreaterEqual(quality["confidence_penalty"], 0.15)
        self.assertIn("unknown_batting_side", quality["flags"])
        self.assertIn("missing_required_run_rate", quality["flags"])

        state = {
            "request": RequestStub(match_state=match_state, event_type="single"),
            "context_probability_team1": 0.62,
            "generator_attempt": 0,
            "context_quality_penalty": quality["confidence_penalty"],
            "context_quality_flags": quality["flags"],
            "reasoning": "base",
        }

        class RuntimeConfig:
            llm_enabled = False
            api_key = None
            model = None
            config_provider = "test"

        next_state = in_play_generator_node(
            state,
            runtime_config_resolver=lambda _request: RuntimeConfig(),
            llm_inference=lambda _state, _config: (0.7, 0.7),
        )

        self.assertLess(next_state["candidate_confidence"], 0.45)

    def test_memory_store_rejects_older_state_versions(self) -> None:
        from cricket.memory import CricketMemoryStore
        import tempfile

        with tempfile.TemporaryDirectory() as tmp_dir:
            store = CricketMemoryStore(db_path=Path(tmp_dir) / "ctx.sqlite3")
            try:
                store.save(
                    match_id="ctx-match",
                    state_version=9,
                    event_seq=15,
                    snapshot={"prior_probability_team1": 0.77},
                )
                stale = store.save(
                    match_id="ctx-match",
                    state_version=8,
                    event_seq=14,
                    snapshot={"prior_probability_team1": 0.12},
                )

                self.assertEqual(stale["prior_probability_team1"], 0.77)
            finally:
                store.close_pool()


if __name__ == "__main__":
    unittest.main()
