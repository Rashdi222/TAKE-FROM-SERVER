from __future__ import annotations

from decimal import Decimal
from typing import Any

from cricket.market_factory import price_two_way_market
from cricket.risk_limits import clamp_probability, parse_float


def build_batsman_runs_market(
    *,
    raw_data: dict[str, Any],
    batting_team: str | None,
    balls_remaining: int | None,
    margin: Decimal,
    confidence: float,
    valid_for_ms: int,
    event_time: str | None = None,
    format_name: str = "t20",
) -> list[dict[str, Any]]:
    """Build batsman runs markets for active batsmen with data freshness validation."""
    if balls_remaining is None or balls_remaining <= 0:
        return []
    
    batting_entries = raw_data.get("batting") or raw_data.get("batsmen") or []
    if not isinstance(batting_entries, list):
        return []
    
    # Data freshness check - skip if data is stale
    if event_time:
        from datetime import datetime, timezone
        try:
            event_dt = datetime.fromisoformat(event_time.replace('Z', '+00:00'))
            data_updated = raw_data.get("last_updated") or raw_data.get("updated_at")
            if data_updated:
                data_dt = datetime.fromisoformat(data_updated.replace('Z', '+00:00'))
                age_seconds = (event_dt - data_dt).total_seconds()
                if age_seconds > 30:  # Data older than 30 seconds
                    return []  # Skip batsman markets - too stale
        except Exception:
            pass  # If parsing fails, continue with caution
    
    markets: list[dict[str, Any]] = []
    normalized_team = (batting_team or "").strip().lower()
    
    for entry in batting_entries:
        if not isinstance(entry, dict):
            continue
        
        is_active = entry.get("active") is True or str(entry.get("status") or "").strip().lower() == "active"
        if not is_active:
            continue
        
        team_name = str(entry.get("team") or entry.get("team_name") or "").strip().lower()
        if normalized_team and team_name and team_name != normalized_team:
            continue
        
        batsman_name = str(entry.get("name") or entry.get("batsman") or "Unknown")
        current_runs = int(entry.get("runs") or 0)
        strike_rate = parse_float(entry.get("strike_rate") or entry.get("strike") or entry.get("sr"))
        
        if strike_rate is None or strike_rate <= 0:
            continue
        
        # Project milestones based on format: ODI (25/50/75/100), T20 (10/20/30)
        balls_faced = int(entry.get("balls_faced") or entry.get("balls") or 1)
        runs_per_ball = strike_rate / 100.0
        
        for milestone in ([25, 50, 75, 100] if format_name == "odi" else [10, 20, 30]):
            if current_runs >= milestone:
                continue  # Already passed milestone
            
            runs_needed = milestone - current_runs
            balls_needed = runs_needed / runs_per_ball if runs_per_ball > 0 else 999
            
            # Probability of reaching milestone before getting out or innings ends
            wicket_prob_per_ball = 0.028  # Base wicket probability
            survival_prob = (1.0 - wicket_prob_per_ball) ** min(balls_needed, balls_remaining)
            yes_probability = clamp_probability(survival_prob * 0.85)  # 85% discount for uncertainty
            no_probability = clamp_probability(1.0 - yes_probability)
            
            yes_price, no_price = price_two_way_market(yes_probability, no_probability, margin)
            
            markets.extend([
                {
                    "market_key": f"batsman_{batsman_name.replace(' ', '_').lower()}_{milestone}",
                    "selection_key": f"yes_{milestone}",
                    "label": f"Yes",
                    "price": yes_price,
                    "bet_type": "in_play",
                    "market_family": "batsman_markets",
                    "window_label": f"{batsman_name} To Score {milestone}+ Runs",
                    "projected_line": str(milestone),
                    "confidence_score": round(confidence * 0.75, 4),
                    "valid_for_ms": valid_for_ms,
                },
                {
                    "market_key": f"batsman_{batsman_name.replace(' ', '_').lower()}_{milestone}",
                    "selection_key": f"no_{milestone}",
                    "label": f"No",
                    "price": no_price,
                    "bet_type": "in_play",
                    "market_family": "batsman_markets",
                    "window_label": f"{batsman_name} To Score {milestone}+ Runs",
                    "projected_line": str(milestone),
                    "confidence_score": round(confidence * 0.75, 4),
                    "valid_for_ms": valid_for_ms,
                },
            ])
    
    return markets


def build_partnership_market(
    *,
    raw_data: dict[str, Any],
    batting_team: str | None,
    balls_remaining: int | None,
    margin: Decimal,
    confidence: float,
    valid_for_ms: int,
    format_name: str = "t20",
) -> list[dict[str, Any]]:
    """Build current partnership total market."""
    if balls_remaining is None or balls_remaining <= 0:
        return []
    
    batting_entries = raw_data.get("batting") or raw_data.get("batsmen") or []
    if not isinstance(batting_entries, list):
        return []
    
    normalized_team = (batting_team or "").strip().lower()
    active_batsmen = []
    
    for entry in batting_entries:
        if not isinstance(entry, dict):
            continue
        
        is_active = entry.get("active") is True or str(entry.get("status") or "").strip().lower() == "active"
        if not is_active:
            continue
        
        team_name = str(entry.get("team") or entry.get("team_name") or "").strip().lower()
        if normalized_team and team_name and team_name != normalized_team:
            continue
        
        strike_rate = parse_float(entry.get("strike_rate") or entry.get("strike") or entry.get("sr"))
        if strike_rate is not None and strike_rate > 0:
            active_batsmen.append({"name": entry.get("name", "Unknown"), "strike_rate": strike_rate})
    
    if len(active_batsmen) < 2:
        return []  # Need 2 active batsmen for partnership
    
    # Project partnership total using combined strike rates
    combined_sr = sum(b["strike_rate"] for b in active_batsmen) / len(active_batsmen)
    runs_per_ball = combined_sr / 100.0
    
    # Current partnership runs (from raw_data if available)
    current_partnership = int(raw_data.get("current_partnership") or raw_data.get("partnership_runs") or 0)
    
    # Project partnership milestones: ODI (50/100/150/200), T20 (25/50/75/100)
    markets: list[dict[str, Any]] = []
    for milestone in ([50, 100, 150, 200] if format_name == "odi" else [25, 50, 75, 100]):
        if current_partnership >= milestone:
            continue
        
        runs_needed = milestone - current_partnership
        balls_needed = runs_needed / runs_per_ball if runs_per_ball > 0 else 999
        
        # Probability of reaching milestone before wicket
        wicket_prob_per_ball = 0.028
        survival_prob = (1.0 - wicket_prob_per_ball) ** min(balls_needed, balls_remaining)
        yes_probability = clamp_probability(survival_prob * 0.80)
        no_probability = clamp_probability(1.0 - yes_probability)
        
        yes_price, no_price = price_two_way_market(yes_probability, no_probability, margin)
        
        markets.extend([
            {
                "market_key": f"partnership_{milestone}",
                "selection_key": f"yes_{milestone}",
                "label": f"Yes",
                "price": yes_price,
                "bet_type": "in_play",
                "market_family": "partnership_markets",
                "window_label": f"Partnership To Reach {milestone}+ Runs",
                "projected_line": str(milestone),
                "confidence_score": round(confidence * 0.70, 4),
                "valid_for_ms": valid_for_ms,
            },
            {
                "market_key": f"partnership_{milestone}",
                "selection_key": f"no_{milestone}",
                "label": f"No",
                "price": no_price,
                "bet_type": "in_play",
                "market_family": "partnership_markets",
                "window_label": f"Partnership To Reach {milestone}+ Runs",
                "projected_line": str(milestone),
                "confidence_score": round(confidence * 0.70, 4),
                "valid_for_ms": valid_for_ms,
            },
        ])
    
    return markets
