from __future__ import annotations

from typing import Any


def build_match_dossier(match_state: Any, existing_dossier: dict[str, Any] | None = None) -> dict[str, Any]:
    raw_data = getattr(match_state, "raw_data", {}) or {}
    score = getattr(match_state, "score", {}) or {}
    existing_dossier = existing_dossier or {}

    competition = extract_competition(raw_data)
    venue = extract_venue(raw_data)
    toss = extract_toss(raw_data)
    team_personas = extract_team_personas(raw_data, match_state)
    format_name = infer_match_format(raw_data, score)
    venue_bias = infer_venue_bias(raw_data, venue, format_name)
    chasing_profile = infer_chasing_profile(raw_data, toss, venue_bias)
    weather_profile = infer_weather_profile(raw_data)

    dossier = {
      "competition": competition,
      "venue": venue,
      "format": format_name,
      "season_name": string_value(
          raw_data.get("season_name")
          or raw_data.get("season")
          or score.get("season_name")
      ),
      "round_name": string_value(raw_data.get("round_name") or raw_data.get("round")),
      "toss": toss,
      "team_personas": team_personas,
      "venue_bias": venue_bias,
      "chasing_profile": chasing_profile,
      "weather_profile": weather_profile,
      "source": "sportmonks_feed",
    }

    if existing_dossier:
        merged = dict(existing_dossier)
        merged.update({key: value for key, value in dossier.items() if value not in (None, {}, [])})
        return merged

    return dossier


def extract_competition(raw_data: dict[str, Any]) -> dict[str, Any]:
    feed = raw_data.get("_competition_feed") if isinstance(raw_data.get("_competition_feed"), dict) else {}
    league = raw_data.get("league") if isinstance(raw_data.get("league"), dict) else {}

    return {
        "id": string_value(feed.get("id") or league.get("id")),
        "name": string_value(feed.get("name") or league.get("name")),
        "competition_key": string_value(feed.get("competition_key")),
    }


def extract_venue(raw_data: dict[str, Any]) -> dict[str, Any]:
    venue = raw_data.get("venue") if isinstance(raw_data.get("venue"), dict) else {}
    return {
        "id": string_value(venue.get("id")),
        "name": string_value(venue.get("name")),
        "city": string_value(venue.get("city")),
        "country": string_value(venue.get("country")),
    }


def extract_toss(raw_data: dict[str, Any]) -> dict[str, Any]:
    toss = raw_data.get("toss") if isinstance(raw_data.get("toss"), dict) else {}
    won = toss.get("won") if isinstance(toss.get("won"), dict) else {}
    decision = toss.get("decision")

    return {
        "winner_team": string_value(won.get("name") or toss.get("winner_team") or toss.get("winner")),
        "decision": string_value(decision),
    }


def extract_team_personas(raw_data: dict[str, Any], match_state: Any) -> dict[str, Any]:
    teams = raw_data.get("teams") if isinstance(raw_data.get("teams"), dict) else {}
    home = teams.get("home") if isinstance(teams.get("home"), dict) else {}
    away = teams.get("away") if isinstance(teams.get("away"), dict) else {}

    return {
        "team1": {
            "name": string_value(getattr(match_state, "team1", None) or home.get("name")),
            "ranking": numeric_value(home.get("ranking") or home.get("position")),
            "brand_bias": infer_brand_bias(home),
        },
        "team2": {
            "name": string_value(getattr(match_state, "team2", None) or away.get("name")),
            "ranking": numeric_value(away.get("ranking") or away.get("position")),
            "brand_bias": infer_brand_bias(away),
        },
    }


def infer_match_format(raw_data: dict[str, Any], score: dict[str, Any]) -> str:
    candidates = [
        raw_data.get("format"),
        raw_data.get("type"),
        raw_data.get("league_type"),
        score.get("format"),
    ]
    normalized = " ".join(filter(None, [string_value(item) for item in candidates])).lower()

    if "odi" in normalized or "one day" in normalized or "50 over" in normalized or "list a" in normalized:
        return "odi"
    if "test" in normalized:
        return "test"
    if "t20" in normalized or "super league" in normalized or "premier league" in normalized:
        return "t20"
    return "unknown"


_VENUE_BIAS_TABLE: dict[str, dict[str, Any]] = {
    # PSL venues
    "karachi": {"chasing_bias": 0.08, "defending_bias": 0.0, "track_hint": "dew_chase_friendly", "pitch_degradation": 0.02, "volatility": 0.18},
    "lahore": {"chasing_bias": 0.07, "defending_bias": 0.0, "track_hint": "dew_chase_friendly", "pitch_degradation": 0.03, "volatility": 0.18},
    "multan": {"chasing_bias": 0.06, "defending_bias": 0.0, "track_hint": "dew_chase_friendly", "pitch_degradation": 0.04, "volatility": 0.16},
    "rawalpindi": {"chasing_bias": 0.04, "defending_bias": 0.0, "track_hint": "balanced", "pitch_degradation": 0.02, "volatility": 0.15},
    # UAE venues
    "dubai": {"chasing_bias": 0.0, "defending_bias": 0.06, "track_hint": "slowing_surface", "pitch_degradation": 0.08, "volatility": 0.14},
    "sharjah": {"chasing_bias": 0.0, "defending_bias": 0.05, "track_hint": "slowing_surface", "pitch_degradation": 0.07, "volatility": 0.16},
    "abu dhabi": {"chasing_bias": 0.0, "defending_bias": 0.04, "track_hint": "slowing_surface", "pitch_degradation": 0.06, "volatility": 0.13},
    # IPL venues
    "wankhede": {"chasing_bias": 0.05, "defending_bias": 0.0, "track_hint": "batting_paradise", "pitch_degradation": 0.02, "volatility": 0.20},
    "chinnaswamy": {"chasing_bias": 0.06, "defending_bias": 0.0, "track_hint": "batting_paradise", "pitch_degradation": 0.02, "volatility": 0.22},
    "eden gardens": {"chasing_bias": 0.03, "defending_bias": 0.02, "track_hint": "balanced", "pitch_degradation": 0.05, "volatility": 0.16},
    "chennai": {"chasing_bias": 0.0, "defending_bias": 0.06, "track_hint": "slowing_surface", "pitch_degradation": 0.08, "volatility": 0.14},
    "chepauk": {"chasing_bias": 0.0, "defending_bias": 0.06, "track_hint": "slowing_surface", "pitch_degradation": 0.08, "volatility": 0.14},
    "feroz shah kotla": {"chasing_bias": 0.0, "defending_bias": 0.04, "track_hint": "slowing_surface", "pitch_degradation": 0.07, "volatility": 0.15},
    "arun jaitley": {"chasing_bias": 0.0, "defending_bias": 0.04, "track_hint": "slowing_surface", "pitch_degradation": 0.07, "volatility": 0.15},
    "mohali": {"chasing_bias": 0.04, "defending_bias": 0.0, "track_hint": "balanced", "pitch_degradation": 0.03, "volatility": 0.16},
    "rajkot": {"chasing_bias": 0.05, "defending_bias": 0.0, "track_hint": "batting_paradise", "pitch_degradation": 0.02, "volatility": 0.18},
    "ahmedabad": {"chasing_bias": 0.04, "defending_bias": 0.0, "track_hint": "balanced", "pitch_degradation": 0.03, "volatility": 0.17},
    # International venues
    "lords": {"chasing_bias": 0.02, "defending_bias": 0.02, "track_hint": "balanced", "pitch_degradation": 0.04, "volatility": 0.12},
    "oval": {"chasing_bias": 0.03, "defending_bias": 0.0, "track_hint": "balanced", "pitch_degradation": 0.03, "volatility": 0.13},
    "old trafford": {"chasing_bias": 0.0, "defending_bias": 0.03, "track_hint": "seaming", "pitch_degradation": 0.05, "volatility": 0.14},
    "edgbaston": {"chasing_bias": 0.02, "defending_bias": 0.0, "track_hint": "balanced", "pitch_degradation": 0.04, "volatility": 0.13},
    "mcg": {"chasing_bias": 0.03, "defending_bias": 0.0, "track_hint": "balanced", "pitch_degradation": 0.03, "volatility": 0.14},
    "scg": {"chasing_bias": 0.0, "defending_bias": 0.03, "track_hint": "spin_friendly", "pitch_degradation": 0.06, "volatility": 0.15},
    "adelaide": {"chasing_bias": 0.04, "defending_bias": 0.0, "track_hint": "batting_paradise", "pitch_degradation": 0.02, "volatility": 0.13},
    "perth": {"chasing_bias": 0.0, "defending_bias": 0.04, "track_hint": "pace_bounce", "pitch_degradation": 0.03, "volatility": 0.16},
    "brisbane": {"chasing_bias": 0.03, "defending_bias": 0.0, "track_hint": "balanced", "pitch_degradation": 0.03, "volatility": 0.14},
    "newlands": {"chasing_bias": 0.0, "defending_bias": 0.03, "track_hint": "seaming", "pitch_degradation": 0.04, "volatility": 0.15},
    "centurion": {"chasing_bias": 0.03, "defending_bias": 0.0, "track_hint": "balanced", "pitch_degradation": 0.03, "volatility": 0.14},
    "wanderers": {"chasing_bias": 0.02, "defending_bias": 0.02, "track_hint": "pace_bounce", "pitch_degradation": 0.04, "volatility": 0.16},
}


def infer_venue_bias(raw_data: dict[str, Any], venue: dict[str, Any], format_name: str) -> dict[str, Any]:
    venue_name = (venue.get("name") or "").lower()
    venue_key = venue_name.strip()
    
    # Try to load learned venue data from database
    learned_data = _load_learned_venue_data(venue_key)
    
    # Try exact match first, then partial match in static table
    bias_data = _VENUE_BIAS_TABLE.get(venue_name)
    if not bias_data:
        for key, data in _VENUE_BIAS_TABLE.items():
            if key in venue_name:
                bias_data = data
                break
    
    # Blend learned data with static table (70% learned, 30% static if learned data exists)
    if learned_data and learned_data["matches_count"] >= 5:
        chasing_bias_learned = (learned_data["chasing_wins"] / learned_data["matches_count"]) - 0.5
        chasing_bias_learned *= 0.16  # Scale to ±0.08 range
        
        if bias_data:
            chasing_bias = (chasing_bias_learned * 0.7) + (bias_data.get("chasing_bias", 0.0) * 0.3)
            defending_bias = (-chasing_bias_learned * 0.7) + (bias_data.get("defending_bias", 0.0) * 0.3)
            track_hint = bias_data.get("track_hint", "balanced")
            pitch_degradation = bias_data.get("pitch_degradation", 0.03)
            volatility = bias_data.get("volatility", 0.18)
        else:
            chasing_bias = chasing_bias_learned
            defending_bias = -chasing_bias_learned
            track_hint = "chase_friendly" if chasing_bias > 0.03 else "defend_friendly" if defending_bias > 0.03 else "balanced"
            pitch_degradation = 0.03
            volatility = 0.18
    elif bias_data:
        chasing_bias = bias_data.get("chasing_bias", 0.0)
        defending_bias = bias_data.get("defending_bias", 0.0)
        track_hint = bias_data.get("track_hint", "balanced")
        pitch_degradation = bias_data.get("pitch_degradation", 0.03)
        volatility = bias_data.get("volatility", 0.18)
    else:
        # Format-level fallback
        if format_name == "t20":
            return {
                "track_hint": "balanced",
                "defending_bias": 0.0,
                "chasing_bias": 0.0,
                "pitch_degradation": 0.03,
                "volatility_score": 0.18,
            }
        elif format_name == "odi":
            return {
                "track_hint": "balanced",
                "defending_bias": 0.02,
                "chasing_bias": 0.0,
                "pitch_degradation": 0.04,
                "volatility_score": 0.10,
            }
        else:
            return {
                "track_hint": "balanced",
                "defending_bias": 0.0,
                "chasing_bias": 0.0,
                "pitch_degradation": 0.05,
                "volatility_score": 0.08,
            }
    
    # Apply format-specific volatility
    volatility_score = volatility if format_name == "t20" else 0.10

    return {
        "track_hint": track_hint,
        "defending_bias": defending_bias,
        "chasing_bias": chasing_bias,
        "pitch_degradation": pitch_degradation,
        "volatility_score": volatility_score,
    }


def _load_learned_venue_data(venue_key: str) -> dict[str, Any] | None:
    """Load learned venue stats from database."""
    import sqlite3
    from pathlib import Path
    
    if not venue_key:
        return None
    
    try:
        db_path = Path(__file__).resolve().parent / "data" / "cricket_memory.sqlite3"
        with sqlite3.connect(db_path) as conn:
            row = conn.execute("SELECT * FROM venue_learning WHERE venue_key = ?", (venue_key,)).fetchone()
            if row:
                return {
                    "venue_key": row[0],
                    "format_name": row[1],
                    "matches_count": row[2],
                    "chasing_wins": row[3],
                    "defending_wins": row[4],
                    "avg_first_innings": row[5],
                    "avg_second_innings": row[6],
                }
    except Exception:
        pass
    
    return None



def infer_chasing_profile(raw_data: dict[str, Any], toss: dict[str, Any], venue_bias: dict[str, Any]) -> dict[str, Any]:
    toss_decision = (toss.get("decision") or "").lower()
    elected_to_chase = toss_decision in {"bowl", "field", "chase"}

    return {
        "elected_to_chase": elected_to_chase,
        "venue_chasing_bias": venue_bias.get("chasing_bias", 0.0),
        "pressure_profile": "accelerated" if elected_to_chase else "defend_first",
    }


def infer_weather_profile(raw_data: dict[str, Any]) -> dict[str, Any]:
    weather = raw_data.get("weather") if isinstance(raw_data.get("weather"), dict) else {}
    condition = (
        string_value(weather.get("condition"))
        or string_value(raw_data.get("weather_condition"))
        or string_value(raw_data.get("weather_note"))
        or ""
    ).lower()

    interruption_risk = 0.0
    if any(token in condition for token in ["rain", "storm", "wet", "shower"]):
        interruption_risk = 0.7
    elif any(token in condition for token in ["cloud", "humid", "drizzle"]):
        interruption_risk = 0.35

    return {
        "condition": condition or None,
        "interruption_risk": interruption_risk,
    }


_TEAM_BRAND_BIAS: dict[str, float] = {
    # IPL teams
    "mumbai indians": 0.08,
    "chennai super kings": 0.08,
    "royal challengers bangalore": 0.08,
    "kolkata knight riders": 0.08,
    "punjab kings": 0.06,
    "rajasthan royals": 0.06,
    "delhi capitals": 0.05,
    "sunrisers hyderabad": 0.05,
    "gujarat titans": 0.04,
    "lucknow super giants": 0.04,
    # PSL teams
    "karachi kings": 0.07,
    "lahore qalandars": 0.07,
    "multan sultans": 0.07,
    "islamabad united": 0.07,
    "peshawar zalmi": 0.06,
    "quetta gladiators": 0.06,
    # International teams
    "india": 0.08,
    "australia": 0.07,
    "england": 0.07,
    "pakistan": 0.06,
    "south africa": 0.05,
    "new zealand": 0.05,
    "west indies": 0.04,
    "sri lanka": 0.04,
    "bangladesh": 0.03,
    "afghanistan": 0.03,
}


def infer_brand_bias(team_payload: dict[str, Any]) -> float:
    name = (string_value(team_payload.get("name")) or "").lower().strip()
    if not name:
        return 0.03
    
    # Exact match
    if name in _TEAM_BRAND_BIAS:
        return _TEAM_BRAND_BIAS[name]
    
    # Partial match (for abbreviated names)
    for key, bias in _TEAM_BRAND_BIAS.items():
        if key in name or name in key:
            return bias
    
    # Default for unknown teams
    return 0.03


def string_value(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def numeric_value(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def learn_venue_bias(venue_name: str, format_name: str, innings_complete: bool, chasing_won: bool, first_innings_score: int, second_innings_score: int) -> None:
    """Update venue bias stats from completed match. Stores in SQLite for future lookups."""
    import sqlite3
    from pathlib import Path
    
    if not venue_name or not innings_complete:
        return
    
    db_path = Path(__file__).resolve().parent / "data" / "cricket_memory.sqlite3"
    venue_key = venue_name.lower().strip()
    
    # Calculate match stats
    chasing_advantage = 1 if chasing_won else 0
    avg_score = (first_innings_score + second_innings_score) / 2.0
    
    with sqlite3.connect(db_path) as conn:
        # Create table if not exists
        conn.execute("""
            CREATE TABLE IF NOT EXISTS venue_learning (
                venue_key TEXT PRIMARY KEY,
                format_name TEXT NOT NULL,
                matches_count INTEGER DEFAULT 0,
                chasing_wins INTEGER DEFAULT 0,
                defending_wins INTEGER DEFAULT 0,
                avg_first_innings REAL DEFAULT 0.0,
                avg_second_innings REAL DEFAULT 0.0,
                last_updated TEXT NOT NULL
            )
        """)
        
        # Upsert venue stats
        existing = conn.execute("SELECT * FROM venue_learning WHERE venue_key = ?", (venue_key,)).fetchone()
        
        if existing:
            matches = existing[2] + 1
            chase_wins = existing[3] + chasing_advantage
            defend_wins = existing[4] + (1 - chasing_advantage)
            avg_1st = ((existing[5] * existing[2]) + first_innings_score) / matches
            avg_2nd = ((existing[6] * existing[2]) + second_innings_score) / matches
            
            conn.execute("""
                UPDATE venue_learning 
                SET matches_count = ?, chasing_wins = ?, defending_wins = ?,
                    avg_first_innings = ?, avg_second_innings = ?, last_updated = datetime('now')
                WHERE venue_key = ?
            """, (matches, chase_wins, defend_wins, avg_1st, avg_2nd, venue_key))
        else:
            conn.execute("""
                INSERT INTO venue_learning 
                (venue_key, format_name, matches_count, chasing_wins, defending_wins, 
                 avg_first_innings, avg_second_innings, last_updated)
                VALUES (?, ?, 1, ?, ?, ?, ?, datetime('now'))
            """, (venue_key, format_name, chasing_advantage, 1 - chasing_advantage, 
                  first_innings_score, second_innings_score))
        
        conn.commit()
