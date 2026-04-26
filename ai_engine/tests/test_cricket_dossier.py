from __future__ import annotations

import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from cricket.dossier import build_match_dossier, infer_match_format


class MatchStateStub:
    def __init__(self, raw_data: dict, score: dict | None = None) -> None:
        self.raw_data = raw_data
        self.score = score or {}
        self.team1 = "Team 1"
        self.team2 = "Team 2"


class CricketDossierTests(unittest.TestCase):
    def test_weather_profile_marks_rain_risk(self) -> None:
        match_state = MatchStateStub(
            raw_data={
                "weather": {"condition": "Light rain showers"},
                "venue": {"name": "Karachi Stadium"},
            }
        )

        dossier = build_match_dossier(match_state)
        self.assertIn("weather_profile", dossier)
        self.assertGreaterEqual(dossier["weather_profile"]["interruption_risk"], 0.7)

    def test_infer_match_format_detects_odi_from_one_day_labels(self) -> None:
        format_name = infer_match_format(
            raw_data={"type": "One Day International"},
            score={},
        )
        self.assertEqual(format_name, "odi")

    def test_infer_match_format_detects_t20_from_competition_hints(self) -> None:
        format_name = infer_match_format(
            raw_data={"league_type": "Premier League"},
            score={},
        )
        self.assertEqual(format_name, "t20")


if __name__ == "__main__":
    unittest.main()
