import type { Match } from "@/lib/api";
import { extractCricketContext, type CricketLineupPlayer } from "@/lib/cricket/cricketContext";

export type LiveBatter = {
  name: string;
  team: string | null;
  role: string | null;
  runs: number | null;
  balls: number | null;
  fours: number | null;
  sixes: number | null;
  strikeRate: number | null;
  active: boolean;
};

export type LiveBowler = {
  name: string;
  team: string | null;
  role: string | null;
  overs: string | null;
  wickets: number | null;
  runs: number | null;
  economy: number | null;
  active: boolean;
};

export type RecentBall = {
  id: string;
  label: string;
  batsman?: string | null;
  bowler?: string | null;
  over?: string | number | null;
  runs?: number | null;
  isWicket?: boolean;
  isBoundary?: boolean;
};

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asBoolean(value: unknown) {
  return value === true || value === 1 || value === "1" || value === "true" || value === "yes" || value === "Yes";
}

export function extractLiveBatters(match: Match) {
  const rawData = asObject(match.raw_data);
  const batting = asArray(rawData?.batting);
  const lineupIndex = lineupRoleIndex(match);

  const parsed = batting
    .map((entry) => toBatter(entry))
    .filter((entry): entry is LiveBatter => entry !== null)
    .map((entry) => withLineupRole(entry, lineupIndex));

  const fallback = fallbackBattersFromBallFeed(match, lineupIndex);
  const source = parsed.length ? parsed : fallback;
  if (!source.length) {
    return { striker: null, nonStriker: null, batters: [] as LiveBatter[] };
  }

  const active = source.filter((entry) => entry.active);
  const striker = active[0] || source[0] || null;
  const nonStriker = active[1] || source[1] || null;

  return { striker, nonStriker, batters: source };
}

export function extractLiveBowler(match: Match) {
  const rawData = asObject(match.raw_data);
  const bowling = asArray(rawData?.bowling);
  const lineupIndex = lineupRoleIndex(match);
  const parsed = bowling
    .map((entry) => toBowler(entry))
    .filter((entry): entry is LiveBowler => entry !== null)
    .map((entry) => withLineupRole(entry, lineupIndex));
  if (parsed.length) return parsed.find((entry) => entry.active) || parsed[0] || null;
  return fallbackBowlerFromBallFeed(match, lineupIndex);
}

export function extractRecentBalls(match: Match): RecentBall[] {
  const context = extractCricketContext(match);
  const balls = context?.scoreboard?.current_scoreboard?.ball_feed;

  if (!Array.isArray(balls)) {
    return extractPatternBalls(match);
  }

  return balls
    .map((ball, index) => ({
      id: String(ball?.id || index),
      label: String(ball?.label || (ball?.runs ?? "•") || "•"),
      batsman: ball?.batsman || null,
      bowler: ball?.bowler || null,
      over: ball?.over || null,
      runs: typeof ball?.runs === "number" ? ball.runs : null,
      isWicket: ball?.is_wicket === true,
      isBoundary: ball?.is_boundary === true,
    }))
    .slice(-6);
}

export function extractCommentary(match: Match): RecentBall[] {
  const context = extractCricketContext(match);
  const balls = context?.scoreboard?.current_scoreboard?.ball_feed;

  if (!Array.isArray(balls)) {
    return extractPatternBalls(match).slice().reverse();
  }

  return balls
    .map((ball, index) => ({
      id: String(ball?.id || index),
      label: String(ball?.label || (ball?.runs ?? "•") || "•"),
      batsman: ball?.batsman || null,
      bowler: ball?.bowler || null,
      over: ball?.over || null,
      runs: typeof ball?.runs === "number" ? ball.runs : null,
      isWicket: ball?.is_wicket === true,
      isBoundary: ball?.is_boundary === true,
    }))
    .slice()
    .reverse();
}

export function extractLiveRates(match: Match) {
  const context = extractCricketContext(match);
  const scoreboard = context?.scoreboard?.current_scoreboard;

  return {
    currentRunRate: match.current_run_rate ?? scoreboard?.current_run_rate ?? null,
    requiredRunRate: match.required_run_rate ?? scoreboard?.required_run_rate ?? null,
    targetRuns: match.target_runs ?? null,
    inning: match.current_innings ?? scoreboard?.inning ?? null,
  };
}

export function extractLineupBenchmarks(match: Match) {
  const context = extractCricketContext(match);
  const lineup = context?.lineup;
  const captains = Array.isArray(lineup?.captains) ? (lineup?.captains as CricketLineupPlayer[]) : [];
  const keepers = Array.isArray(lineup?.wicketkeepers) ? (lineup?.wicketkeepers as CricketLineupPlayer[]) : [];

  return {
    tossWinner: lineup?.toss?.winner_name || null,
    tossDecision: lineup?.toss?.decision || null,
    captain: captains[0]?.player_name || null,
    wicketkeeper: keepers[0]?.player_name || null,
  };
}

function toBatter(value: unknown): LiveBatter | null {
  const entry = asObject(value);
  if (!entry) return null;
  const player = asObject(entry.batsman);
  const team = asObject(entry.team);
  const position = asObject(player?.position || entry.position);

  return {
    name:
      asString(player?.fullname) ||
      asString(player?.name) ||
      asString(entry.fullname) ||
      asString(entry.name) ||
      "Batter",
    team: asString(team?.name || entry.team_name),
    role:
      normalizeRoleLabel(
        asString(position?.name) ||
          asString((position as Record<string, unknown> | null)?.role) ||
          asString(entry.role),
      ) || null,
    runs: asNumber(entry.score),
    balls: asNumber(entry.ball),
    fours: asNumber(entry.four_x || entry.fours),
    sixes: asNumber(entry.six_x || entry.sixes),
    strikeRate: asNumber(entry.rate || entry.strike_rate),
    active: asBoolean(entry.active),
  };
}

function toBowler(value: unknown): LiveBowler | null {
  const entry = asObject(value);
  if (!entry) return null;
  const player = asObject(entry.bowler);
  const team = asObject(entry.team);
  const position = asObject(player?.position || entry.position);

  return {
    name:
      asString(player?.fullname) ||
      asString(player?.name) ||
      asString(entry.fullname) ||
      asString(entry.name) ||
      "Bowler",
    team: asString(team?.name || entry.team_name),
    role:
      normalizeRoleLabel(
        asString(position?.name) ||
          asString((position as Record<string, unknown> | null)?.role) ||
          asString(entry.role),
      ) || null,
    overs: asString(entry.overs) || (asNumber(entry.overs) != null ? String(asNumber(entry.overs)) : null),
    wickets: asNumber(entry.wickets),
    runs: asNumber(entry.runs || entry.score),
    economy: asNumber(entry.rate || entry.econ_rate || entry.economy),
    active: asBoolean(entry.active),
  };
}

function extractPatternBalls(match: Match): RecentBall[] {
  const rawData = asObject(match.raw_data);
  const pattern = asArray(rawData?.last_6_balls_pattern);

  return pattern
    .map((value, index) => {
      const label = asString(value) || (asNumber(value) != null ? String(asNumber(value)) : null);
      if (!label) return null;

      return {
        id: `pattern-${index}-${label}`,
        label,
        runs: asNumber(value),
        isWicket: label.toUpperCase() === "W",
        isBoundary: label === "4" || label === "6",
      } satisfies RecentBall;
    })
    .filter(Boolean) as RecentBall[];
}

type LineupRole = {
  role: string | null;
  team: string | null;
};

function lineupRoleIndex(match: Match) {
  const context = extractCricketContext(match);
  const lineup = Array.isArray(context?.lineup?.lineup) ? context?.lineup?.lineup : [];
  return lineup.reduce<Record<string, LineupRole>>((acc, entry) => {
    const name = normalizeName(entry.player_name ?? null);
    if (!name) return acc;
    acc[name] = {
      role: normalizeRoleLabel(asString(entry.position) || asString(entry.role)),
      team: asString(entry.team_name),
    };
    return acc;
  }, {});
}

function withLineupRole<T extends { name: string; role: string | null; team: string | null }>(
  entry: T,
  index: Record<string, LineupRole>,
): T {
  const key = normalizeName(entry.name);
  if (!key || !index[key]) return entry;
  return {
    ...entry,
    role: entry.role || index[key].role,
    team: entry.team || index[key].team,
  };
}

function fallbackBattersFromBallFeed(match: Match, index: Record<string, LineupRole>): LiveBatter[] {
  const context = extractCricketContext(match);
  const balls = Array.isArray(context?.scoreboard?.current_scoreboard?.ball_feed)
    ? context?.scoreboard?.current_scoreboard?.ball_feed
    : [];
  if (!balls.length) return [];

  const names: string[] = [];
  for (let i = balls.length - 1; i >= 0; i -= 1) {
    const name = asString(balls[i]?.batsman);
    if (!name) continue;
    if (names.includes(name)) continue;
    names.push(name);
    if (names.length >= 2) break;
  }

  return names.map((name, idx) => {
    const key = normalizeName(name);
    const lineup = key ? index[key] : null;
    return {
      name,
      team: lineup?.team || null,
      role: lineup?.role || "Batter",
      runs: null,
      balls: null,
      fours: null,
      sixes: null,
      strikeRate: null,
      active: idx === 0,
    } satisfies LiveBatter;
  });
}

function fallbackBowlerFromBallFeed(match: Match, index: Record<string, LineupRole>): LiveBowler | null {
  const context = extractCricketContext(match);
  const balls = Array.isArray(context?.scoreboard?.current_scoreboard?.ball_feed)
    ? context?.scoreboard?.current_scoreboard?.ball_feed
    : [];
  const lastBall = balls.length ? balls[balls.length - 1] : null;
  const name = asString(lastBall?.bowler);
  if (!name) return null;
  const key = normalizeName(name);
  const lineup = key ? index[key] : null;
  return {
    name,
    team: lineup?.team || null,
    role: lineup?.role || "Bowler",
    overs: null,
    wickets: null,
    runs: null,
    economy: null,
    active: true,
  };
}

function normalizeName(value: string | null) {
  if (!value) return null;
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeRoleLabel(value: string | null) {
  if (!value) return null;
  const normalized = value.trim().toLowerCase().replace(/[_-]+/g, " ");
  if (!normalized) return null;
  if (normalized.includes("allround")) return "All-rounder";
  if (normalized.includes("wicket")) return "Wicketkeeper";
  if (normalized.includes("bowl")) return "Bowler";
  if (normalized.includes("bat")) return "Batter";
  if (normalized.includes("captain wicketkeeper")) return "Captain / Wicketkeeper";
  if (normalized.includes("captain")) return "Captain";
  return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
}
