from __future__ import annotations

import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from cricket.memory import CricketMemoryStore
from cricket.orchestrator import (
    CalculateOddsRequest,
    MatchState,
    TriggerPayload,
    observability_snapshot,
    run_graph,
)
from cricket.pre_match_bootstrap import ensure_pre_match_context_pack


class CricketOrchestratorGuardTests(unittest.TestCase):
    def _stale_payload(self, *, state_version: int) -> CalculateOddsRequest:
        stale_time = (datetime.now(timezone.utc) - timedelta(seconds=120)).isoformat()
        return CalculateOddsRequest(
            match_id="stale-guard-match",
            event_seq=1,
            state_version=state_version,
            trigger=TriggerPayload(event_type="single", severity="minor", reason="unit_test"),
            match_state=MatchState(
                match_id="stale-guard-match",
                sport="cricket",
                event_seq=1,
                state_version=state_version,
                event_time=stale_time,
                inning=1,
                over="5.2",
                ball_in_over=2,
                team1="A",
                team2="B",
                batting_team="A",
                bowling_team="B",
                runs_total=42,
                wickets_total=1,
                current_run_rate="7.87",
                required_run_rate=None,
                raw_data={},
            ),
        )

    def test_stale_feed_guard_suspends_market(self) -> None:
        payload = self._stale_payload(state_version=1001)

        response = run_graph(payload)
        self.assertEqual(response.model, "stale-feed-guard")
        self.assertEqual(response.reviewer_decision, "reject_and_keep_suspended")
        self.assertTrue(any("stale_feed_guard" in flag for flag in response.reviewer_flags))
        self.assertEqual(len(response.markets), 1)
        self.assertTrue(response.markets[0].is_suspended)
        self.assertEqual(response.markets[0].valid_for_ms, 0)

    def test_observability_snapshot_contains_stale_reason(self) -> None:
        run_graph(self._stale_payload(state_version=1002))
        snapshot = observability_snapshot(match_id="stale-guard-match")
        match = snapshot.get("matches", {}).get("stale-guard-match", {})
        self.assertEqual(match.get("match_id"), "stale-guard-match")
        suspension_reasons = match.get("suspension_reasons", {})
        self.assertTrue(any("stale_feed_guard" in key for key in suspension_reasons.keys()))

    def test_pre_match_context_pack_caches_xi_roles_and_format_priors(self) -> None:
        with self._temporary_store() as store:
            match_state = MatchState(
                match_id="pre-match-pack",
                sport="cricket",
                event_seq=1,
                state_version=1,
                inning=0,
                over="0.0",
                ball_in_over=0,
                team1="Team One",
                team2="Team Two",
                batting_team="Team One",
                bowling_team="Team Two",
                runs_total=0,
                wickets_total=0,
                current_run_rate="0.0",
                required_run_rate=None,
                raw_data={
                    "type": "One Day International",
                    "toss": {"decision": "field", "won": {"name": "Team Two"}},
                    "venue": {"name": "National Stadium", "country": "PK"},
                    "lineup": [
                        {
                            "player": {"fullname": "Batter A", "position": {"name": "Batsman"}},
                            "team_name": "Team One",
                            "captain": True,
                        },
                        {
                            "player": {"fullname": "Bowler B", "position": {"name": "Bowler"}},
                            "team_name": "Team Two",
                        },
                    ],
                },
            )

            pack = ensure_pre_match_context_pack(
                match_id="pre-match-pack",
                match_state=match_state,
                state_version=1,
                event_seq=1,
                memory_store=store,
            )
            self.assertEqual(pack.get("format"), "odi")
            self.assertEqual((pack.get("format_priors") or {}).get("total_overs"), 50)
            self.assertGreaterEqual(len(pack.get("xi_roles") or []), 2)

            loaded = store.load("pre-match-pack")
            self.assertIn("pre_match_context_pack", loaded)
            self.assertEqual(
                ((loaded.get("pre_match_context_pack") or {}).get("format_priors") or {}).get("total_overs"),
                50,
            )

    class _temporary_store:
        def __enter__(self) -> CricketMemoryStore:
            import tempfile

            self._tmp = tempfile.TemporaryDirectory()
            self._store = CricketMemoryStore(db_path=Path(self._tmp.name) / "ctx.sqlite3")
            return self._store

        def __exit__(self, exc_type, exc, tb) -> None:
            self._store.close_pool()
            self._tmp.cleanup()


if __name__ == "__main__":
    unittest.main()
