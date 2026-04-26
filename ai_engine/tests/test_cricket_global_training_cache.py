from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from cricket.global_training_cache import GlobalTrainingCache


class GlobalTrainingCacheTests(unittest.TestCase):
    def test_record_is_deduplicated_per_match(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            cache = GlobalTrainingCache(db_path=Path(tmp_dir) / "global.sqlite3")

            first = cache.record_match_completion(
                match_id="match-1",
                format_name="t20",
                first_innings_score=178,
            )
            second = cache.record_match_completion(
                match_id="match-1",
                format_name="t20",
                first_innings_score=182,
            )

            priors = cache.load_format_prior("t20")

            self.assertTrue(first)
            self.assertFalse(second)
            self.assertEqual(priors["sample_count"], 1)
            self.assertEqual(priors["avg_first_innings_score"], 178.0)

    def test_running_average_updates(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            cache = GlobalTrainingCache(db_path=Path(tmp_dir) / "global.sqlite3")

            cache.record_match_completion(
                match_id="m-1",
                format_name="odi",
                first_innings_score=280,
            )
            cache.record_match_completion(
                match_id="m-2",
                format_name="odi",
                first_innings_score=320,
            )

            priors = cache.load_format_prior("odi")
            self.assertEqual(priors["sample_count"], 2)
            self.assertAlmostEqual(priors["avg_first_innings_score"], 300.0, places=3)


if __name__ == "__main__":
    unittest.main()
