from __future__ import annotations

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from cricket.lifecycle_analytics import summarize_market_lifecycle
from cricket.replay import CricketReplayRequest, run_replay


class CricketReplayTests(unittest.TestCase):
    @classmethod
    def tearDownClass(cls) -> None:
        from cricket.replay import CRICKET_MEMORY

        CRICKET_MEMORY.close_pool()

    def test_lifecycle_analytics_summarizes_quote_mix(self) -> None:
        summary = summarize_market_lifecycle(
            markets=[
                {"market_key": "match_winner", "valid_for_ms": 1200, "confidence_score": 0.6},
                {"market_key": "over_under", "valid_for_ms": 2200, "confidence_score": 0.5},
            ],
            fancy_markets=[
                {
                    "market_key": "fancy_next_5_overs",
                    "market_family": "fancy",
                    "valid_for_ms": 900,
                    "confidence_score": 0.41,
                    "is_suspended": True,
                }
            ],
            reviewer_decision="approve_with_dampening",
            active_playbooks=["rain_dls_distortion", "partnership_break"],
            recent_reprices=[{"reviewer_decision": "approve"}, {"reviewer_decision": "approve_with_dampening"}],
            recent_events=[{"event_type": "wicket"}, {"event_type": "boundary"}],
            latency_ms=84,
        )

        self.assertEqual(summary["quote_count"], 3)
        self.assertEqual(summary["suspended_quote_count"], 1)
        self.assertEqual(summary["fast_expiring_quote_count"], 2)
        self.assertEqual(summary["reviewer_decision"], "approve_with_dampening")
        self.assertIn("fancy", summary["market_families"])

    def test_replay_aggregates_frame_results(self) -> None:
        frame = SimpleNamespace(match_id="match-1", event_seq=10)

        class ResponseStub:
            match_id = "match-1"
            state_version = 7
            reviewer_decision = "approve_with_dampening"
            latency_ms = 73
            markets = [{"market_key": "match_winner"}]
            fancy_markets = [{"market_key": "fancy_next_5_overs"}]
            active_playbooks = ["fake_chase_surge"]
            lifecycle_analytics = {"quote_count": 2}

        with patch("cricket.replay.CRICKET_MEMORY.clear") as clear_mock, patch(
            "cricket.replay.run_graph", return_value=ResponseStub()
        ):
            result = run_replay(CricketReplayRequest.model_construct(frames=[frame], reset_memory=True))

        clear_mock.assert_called_once_with("match-1")
        self.assertEqual(result.frame_count, 1)
        self.assertEqual(result.avg_latency_ms, 73)
        self.assertEqual(result.reviewer_decisions["approve_with_dampening"], 1)
        self.assertEqual(result.active_playbooks["fake_chase_surge"], 1)


if __name__ == "__main__":
    unittest.main()
