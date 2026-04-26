from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from cricket.memory import CricketMemoryStore


class CricketMemoryStoreTests(unittest.TestCase):
    def test_older_snapshot_does_not_replace_newer_snapshot(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            db_path = Path(tmp_dir) / "memory.sqlite3"
            store = CricketMemoryStore(db_path=db_path)
            try:
                latest = store.save(
                    match_id="match-1",
                    state_version=5,
                    event_seq=10,
                    snapshot={
                        "prior_probability_team1": 0.81,
                        "recent_events": [{"event_type": "wicket"}],
                    },
                )

                stale = store.save(
                    match_id="match-1",
                    state_version=4,
                    event_seq=9,
                    snapshot={
                        "prior_probability_team1": 0.22,
                        "recent_events": [{"event_type": "single"}],
                    },
                )

                self.assertEqual(stale["prior_probability_team1"], latest["prior_probability_team1"])
                loaded = store.load("match-1")
                self.assertEqual(loaded["prior_probability_team1"], latest["prior_probability_team1"])
            finally:
                store.close_pool()


if __name__ == "__main__":
    unittest.main()
