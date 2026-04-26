const TENNIS_MARKET_DICTIONARY: Record<string, string> = {
  match_winner: "Match Winner",
  event_match_winner: "Match Winner",
  set_winner: "Set Winner",
  set_winner_p1: "Player 1 to Win Set",
  set_winner_p2: "Player 2 to Win Set",
  total_games_over_under: "Total Games (O/U)",
  total_games: "Total Games (O/U)",
  over_under: "Games Over/Under",
  correct_score_set: "Correct Set Score",
  set_betting: "Set Betting",
  tie_break_in_match: "Tie-Break in Match",
  tiebreak_in_match: "Tie-Break in Match",
  handicap: "Handicap",
  match_handicap: "Match Handicap",
  set_handicap: "Set Handicap",
  to_break_serve: "Break of Serve",
  set_to_break_serve: "Set Break of Serve",
  another_game: "Next Game Winner",
  game_winner: "Next Game Winner",
  in_play: "In-Play Market",
};

const TENNIS_SELECTION_DICTIONARY: Record<string, string> = {
  p1: "Player 1",
  p2: "Player 2",
  player_1: "Player 1",
  player_2: "Player 2",
  home: "Player 1",
  away: "Player 2",
  yes: "Yes",
  no: "No",
};

function normalizeKey(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function titleize(value: string) {
  return value.replace(/\b\w/g, (char) => char.toUpperCase());
}

export function formatTennisMarketLabel(value: string | null | undefined) {
  const normalized = normalizeKey(value);
  if (!normalized) return "Market";
  return TENNIS_MARKET_DICTIONARY[normalized] || titleize(normalized.replace(/_/g, " "));
}

export function formatTennisSelectionLabel(value: string | null | undefined) {
  const raw = String(value || "").trim();
  const normalized = normalizeKey(raw);
  if (!normalized) return "Selection";

  if (TENNIS_SELECTION_DICTIONARY[normalized]) {
    return TENNIS_SELECTION_DICTIONARY[normalized];
  }

  return titleize(raw.replace(/_/g, " ").replace(/\s+/g, " "));
}
