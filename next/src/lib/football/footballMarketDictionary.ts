const FOOTBALL_MARKET_DICTIONARY: Record<string, string> = {
  match_winner: "Match Winner",
  winner: "Match Winner",
  h2h: "Match Winner",
  full_time_result: "Full Time Result",
  halftime_result: "First Half Result",
  first_half_result: "First Half Result",
  second_half_result: "Second Half Result",
  total_goals_over_under: "Total Goals (O/U)",
  goals_over_under: "Total Goals (O/U)",
  over_under: "Total Goals (O/U)",
  goals_ou: "Total Goals (O/U)",
  total: "Total Goals",
  both_teams_to_score: "Both Teams to Score",
  btts: "Both Teams to Score",
  result_btts: "Result + BTTS",
  btts_both_teams_to_score: "Both Teams to Score",
  double_chance: "Double Chance",
  draw_no_bet: "Draw No Bet",
  asian_handicap: "Asian Handicap",
  handicap: "Handicap",
  total_corners: "Total Corners",
  corners: "Corners",
  corners_ou: "Corners (O/U)",
  total_cards: "Total Cards",
  cards: "Cards",
  cards_ou: "Cards (O/U)",
  first_half_winner: "First Half Winner",
  second_half_winner: "Second Half Winner",
  next_goal: "Next Goal",
  next_team_to_score: "Next Team To Score",
  team_to_score_next: "Next Team To Score",
  to_score_next: "Next Team To Score",
  exact_goals: "Exact Goals",
  odd_even: "Odd / Even",
  corners_over_under: "Corners (O/U)",
  cards_over_under: "Cards (O/U)",
  in_play: "In-Play Specials",
};

export function formatFootballMarketLabel(
  value: string | null | undefined,
  opts?: { selections?: Array<string | null | undefined> }
) {
  const normalized = normalizeFootballMarketKey(value);
  if (!normalized) return "Market";
  if (
    normalized === "btts" &&
    Array.isArray(opts?.selections) &&
    opts!.selections!.some((selection) => isResultBttsSelection(selection))
  ) {
    return "Result + BTTS";
  }
  return FOOTBALL_MARKET_DICTIONARY[normalized] || titleize(normalized);
}

export function normalizeFootballMarketKey(value: string | null | undefined) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/both teams to score/g, "btts")
    .replace(/both teams score/g, "btts")
    .replace(/double chance/g, "double_chance")
    .replace(/draw no bet/g, "draw_no_bet")
    .replace(/next goal/g, "next_goal")
    .replace(/full[\s-]*time result/g, "full_time_result")
    .replace(/1x2/g, "full_time_result")
    .replace(/over\/under/g, "over_under")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (normalized === "match_winner") return "match_winner";
  if (normalized === "full_time_result") return "full_time_result";
  if (normalized === "draw_no_bet") return "draw_no_bet";
  if (normalized === "double_chance") return "double_chance";
  if (normalized.includes("result") && normalized.includes("btts")) return "result_btts";
  if (normalized.includes("winner") && normalized.includes("btts")) return "result_btts";
  if (normalized.includes("next_goal")) return "next_goal";
  if (normalized.includes("handicap")) return "handicap";
  if (normalized.includes("corner") && (normalized.includes("over_under") || normalized.includes("total"))) return "corners_ou";
  if (normalized.includes("corner")) return "corners";
  if (normalized.includes("card") && (normalized.includes("over_under") || normalized.includes("total"))) return "cards_ou";
  if (normalized.includes("card")) return "cards";
  if (normalized === "btts") return "btts";
  if (normalized.includes("over_under") || normalized.includes("total")) return "over_under";
  return normalized;
}

export function formatFootballSelectionLabel(
  value: string | null | undefined,
  opts?: { team1?: string | null; team2?: string | null; marketKey?: string | null }
) {
  const rendered = String(value || "").trim();
  const normalized = rendered.toLowerCase();
  const marketKey = normalizeFootballMarketKey(opts?.marketKey);

  if (!normalized) return "Selection";
  const resultBttsLabel = formatResultBttsSelection(normalized, opts);
  if (resultBttsLabel) return resultBttsLabel;

  const ouBttsLabel = formatOuBttsSelection(rendered);
  if (ouBttsLabel) return ouBttsLabel;

  if (normalized.startsWith("over ") || normalized.startsWith("under ")) {
    return rendered.replace(/\s+/g, " ");
  }
  if (normalized.includes("/") && marketKey === "double_chance") {
    const parts = normalized.split("/").map((part) => part.trim());
    const labels = parts.map((part) => {
      if (part === "1" || part === "home") return opts?.team1 || "Home";
      if (part === "2" || part === "away") return opts?.team2 || "Away";
      if (part === "x" || part === "draw") return "Draw";
      return titleize(part);
    });
    return labels.join(" / ");
  }
  if (normalized === "x" || normalized === "draw") return "Draw";
  if (normalized === "1" || normalized === "home") return opts?.team1 || "Home";
  if (normalized === "2" || normalized === "away") return opts?.team2 || "Away";
  if (marketKey === "btts" && normalized === "yes") return "Yes";
  if (marketKey === "btts" && normalized === "no") return "No";
  if (normalized === "over") return "Over";
  if (normalized === "under") return "Under";

  return titleize(normalized.replace(/_/g, " "));
}

function titleize(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function isYesNoToken(value: string) {
  return value === "yes" || value === "no";
}

function isResultToken(value: string) {
  return (
    value === "home" ||
    value === "away" ||
    value === "draw" ||
    value === "team1" ||
    value === "team2" ||
    value === "1" ||
    value === "2" ||
    value === "x"
  );
}

function resultTokenLabel(
  token: string,
  opts?: { team1?: string | null; team2?: string | null }
) {
  switch (token) {
    case "home":
    case "team1":
    case "1":
      return opts?.team1 || "Home";
    case "away":
    case "team2":
    case "2":
      return opts?.team2 || "Away";
    case "draw":
    case "x":
      return "Draw";
    default:
      return titleize(token);
  }
}

function formatResultBttsSelection(
  normalized: string,
  opts?: { team1?: string | null; team2?: string | null; marketKey?: string | null }
) {
  if (!normalized.includes("/")) return null;
  const parts = normalized.split("/").map((part) => part.trim());
  if (parts.length !== 2) return null;
  const [first, second] = parts;

  if (isResultToken(first) && isYesNoToken(second)) {
    return `${resultTokenLabel(first, opts)} + BTTS ${titleize(second)}`;
  }

  if (isYesNoToken(first) && isResultToken(second)) {
    return `${resultTokenLabel(second, opts)} + BTTS ${titleize(first)}`;
  }

  if (
    normalizeFootballMarketKey(opts?.marketKey) === "double_chance" &&
    isResultToken(first) &&
    isResultToken(second)
  ) {
    return `${resultTokenLabel(first, opts)} / ${resultTokenLabel(second, opts)}`;
  }

  return null;
}

function formatOuBttsSelection(rendered: string) {
  const normalized = rendered.toLowerCase().replace(/\s+/g, " ").trim();
  const match = normalized.match(/^([ou])\/(yes|no)\s+([0-9]+(?:\.[0-9]+)?)$/);
  if (!match) return null;
  const overUnder = match[1] === "o" ? "Over" : "Under";
  const btts = titleize(match[2]);
  const line = match[3];
  return `${overUnder} ${line} + BTTS ${btts}`;
}

export function isResultBttsSelection(value: string | null | undefined) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized.includes("/")) return false;
  const parts = normalized.split("/").map((part) => part.trim());
  if (parts.length !== 2) return false;
  const [first, second] = parts;
  return (isResultToken(first) && isYesNoToken(second)) || (isYesNoToken(first) && isResultToken(second));
}
