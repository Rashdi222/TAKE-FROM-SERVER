const CRICKET_MARKET_DICTIONARY: Record<string, string> = {
  event_match_winner: "Match Winner",
  match_winner: "Match Winner",
  overs_over_under: "Over/Under Runs",
  over_under: "Over/Under Runs",
  runs_line: "Over/Under Runs",
  totals_ladder: "Projected Total Ladder",
  projected_total_ladder: "Projected Total Ladder",
  fancy_markets: "Fancy Session",
  fancy_session: "Fancy Session",
  // T20 session windows
  fancy_session_6_overs: "Runs In Next 6 Overs",
  fancy_session_10_overs: "Runs In Next 10 Overs",
  fancy_session_15_overs: "Runs In Next 15 Overs",
  fancy_session_20_overs: "Runs In Next 20 Overs",
  // ODI session windows
  fancy_session_20_overs_odi: "Runs In Next 20 Overs (ODI)",
  fancy_session_30_overs: "Runs In Next 30 Overs",
  fancy_session_50_overs: "Full Innings Total",
  fall_of_wicket: "Next Wicket Method",
  next_ball: "Next Ball Result",
  next_boundary: "Boundary In Next Over",
  next_over_wicket: "Wicket In Next Over",
  next_over_runs_10_plus: "10+ Runs In Next Over",
  session: "Session Market",
  in_play: "In-Play Special",
  top_batsman: "Top Batsman",
  top_bowler: "Top Bowler",
  first_innings_total: "1st Innings Total",
  total_runs: "Total Runs",
  total_match_runs: "Total Match Runs",
  team_total: "Team Total Runs",
  total_wickets: "Total Wickets",
  player_props: "Player Specials",
};

function normalizeMarketKey(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function formatCricketMarketLabel(value: string | null | undefined) {
  const normalized = normalizeMarketKey(value);
  if (!normalized) return "Market";
  return CRICKET_MARKET_DICTIONARY[normalized] || normalized.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}
