import type { Match } from "@/lib/api";
import { isMatchLiveForDisplay } from "@/lib/matches/liveStatus";

export type FootballGrid = {
  raw?: string | null;
  row?: number | null;
  col?: number | null;
};

export type FootballLineupPlayer = {
  id?: number | null;
  name?: string | null;
  number?: number | null;
  position?: string | null;
  grid?: FootballGrid | null;
};

export type FootballLineupTeam = {
  team_id?: number | null;
  team_name?: string | null;
  formation?: string | null;
  coach?: {
    id?: number | null;
    name?: string | null;
    photo?: string | null;
  } | null;
  start_xi?: FootballLineupPlayer[] | null;
  substitutes?: FootballLineupPlayer[] | null;
};

export type FootballLaneStatus = "ok" | "unsupported" | "rate_limited" | "auth_failed" | "unavailable";

export type FootballLaneMeta = {
  status: FootballLaneStatus;
  message?: string | null;
  updated_at?: string | null;
};

export type FootballStatisticsMap = Partial<Record<
  | "ball_possession"
  | "shots_on_goal"
  | "dangerous_attacks"
  | "corner_kicks"
  | "fouls"
  | "total_shots"
  | "shots_off_goal"
  | "blocked_shots"
  | "goalkeeper_saves"
  | "yellow_cards"
  | "red_cards"
  | "offsides"
  | "passes_accurate"
  | "passes_percent"
  | "expected_goals"
  | string,
  string | number | null
>>;

export type FootballContext = {
  venue?: {
    id?: number | string | null;
    name?: string | null;
    city?: string | null;
  } | null;
  officials?: {
    referee?: string | null;
  } | null;
  lineups?: FootballLineupTeam[] | null;
  formations?: Array<{
    team_name?: string | null;
    formation?: string | null;
  }> | null;
  coaches?: Array<{
    team_name?: string | null;
    coach?: {
      id?: number | null;
      name?: string | null;
      photo?: string | null;
    } | null;
  }> | null;
  statistics?: Array<{
    team_id?: number | null;
    team_name?: string | null;
    stats?: FootballStatisticsMap | null;
  }> | null;
  events?: Array<{
    minute?: number | null;
    stoppage?: number | null;
    team_id?: number | null;
    team_name?: string | null;
    player_name?: string | null;
    assist_name?: string | null;
    type?: string | null;
    detail?: string | null;
    comments?: string | null;
    label?: string | null;
  }> | null;
  event_highlights?: Array<{
    minute?: number | null;
    stoppage?: number | null;
    team_id?: number | null;
    team_name?: string | null;
    player_name?: string | null;
    assist_name?: string | null;
    type?: string | null;
    detail?: string | null;
    comments?: string | null;
    label?: string | null;
  }> | null;
  standings_snapshot?: {
    table?: Array<{
      team_name?: string | null;
      rank?: number | null;
      points?: number | null;
      goals_diff?: number | null;
      form?: string | null;
      movement?: string | null;
      zone?: string | null;
    }> | null;
    teams?: Array<{
      team_name?: string | null;
      rank?: number | null;
      points?: number | null;
      goals_diff?: number | null;
      form?: string | null;
      movement?: string | null;
      zone?: string | null;
    }> | null;
  } | null;
  meta?: {
    events?: FootballLaneMeta | null;
    lineups?: FootballLaneMeta | null;
    statistics?: FootballLaneMeta | null;
    standings?: FootballLaneMeta | null;
  } | null;
};

export function extractFootballContext(match: Match | null | undefined): FootballContext | null {
  const rawData = match?.raw_data;
  if (!rawData || typeof rawData !== "object" || Array.isArray(rawData)) return null;

  const raw = rawData as Record<string, unknown>;
  const footballContext = raw.football_context;

  if (footballContext && typeof footballContext === "object" && !Array.isArray(footballContext)) {
    return footballContext as FootballContext;
  }

  return buildFallbackFootballContext(match, raw);
}

export function isFootballHalftime(match: Match | null | undefined) {
  if (!match || match.sport !== "football") return false;

  const rawData =
    match.raw_data && typeof match.raw_data === "object" && !Array.isArray(match.raw_data)
      ? (match.raw_data as Record<string, unknown>)
      : null;

  const fixture =
    rawData?.fixture && typeof rawData.fixture === "object" && !Array.isArray(rawData.fixture)
      ? (rawData.fixture as Record<string, unknown>)
      : null;

  const status =
    fixture?.status && typeof fixture.status === "object" && !Array.isArray(fixture.status)
      ? (fixture.status as Record<string, unknown>)
      : null;

  const short = String(status?.short || "").trim().toUpperCase();
  const long = String(status?.long || "").trim().toLowerCase();

  return short === "HT" || long.includes("half-time") || long.includes("halftime");
}

export function isFootballPrematchLike(match: Match | null | undefined) {
  if (!match || match.sport !== "football") return false;
  return !isMatchLiveForDisplay(match);
}

export function resolveLineupSides(match: Match, context: FootballContext | null) {
  const lineups = Array.isArray(context?.lineups) ? context!.lineups! : [];
  const homeName = normalizeName(match.team1);
  const awayName = normalizeName(match.team2);

  const home =
    lineups.find((item) => normalizeName(item.team_name) === homeName) ||
    lineups[0] ||
    null;
  const away =
    lineups.find((item) => normalizeName(item.team_name) === awayName) ||
    lineups.find((item) => item !== home) ||
    lineups[1] ||
    null;

  return { home, away };
}

export function resolveStatisticSides(match: Match, context: FootballContext | null) {
  const stats = Array.isArray(context?.statistics) ? context.statistics : [];
  const homeName = normalizeName(match.team1);
  const awayName = normalizeName(match.team2);

  const home =
    stats.find((item) => normalizeName(item.team_name) === homeName) ||
    stats[0] ||
    null;
  const away =
    stats.find((item) => normalizeName(item.team_name) === awayName) ||
    stats.find((item) => item !== home) ||
    stats[1] ||
    null;

  return { home, away };
}

export function recentFootballSignal(match: Match | null | undefined) {
  const context = extractFootballContext(match);
  const events = Array.isArray(context?.events) ? context.events : [];
  if (!events.length) return null;

  const elapsed = typeof match?.elapsed_minute === "number" ? match.elapsed_minute : null;
  const recent = [...events].reverse().find((item) => {
    if (elapsed == null || item?.minute == null) return true;
    return elapsed - item.minute <= 2;
  });

  if (!recent) return null;

  const kind = String(recent.type || "").toLowerCase();
  const detail = String(recent.detail || "").toLowerCase();

  if (kind === "goal") return { tone: "goal" as const, label: recent.label || "Goal" };
  if (kind === "card" && detail.includes("red")) return { tone: "red_card" as const, label: recent.label || "Red Card" };
  if (kind === "var") return { tone: "var" as const, label: recent.label || "VAR" };
  return null;
}

function normalizeName(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .trim();
}

function buildFallbackFootballContext(match: Match | null | undefined, raw: Record<string, unknown>): FootballContext | null {
  if (!match) return null;

  const fixture = objectValue(raw.fixture);
  const venue = objectValue(fixture?.venue);
  const rawEvents = Array.isArray(raw.events) ? raw.events : [];
  const mappedEvents = rawEvents
    .map((item) => normalizeRawEvent(item))
    .filter((item): item is Exclude<typeof item, null> => item !== null);

  const stats = buildFallbackStatistics(match);

  return {
    venue: venue
      ? {
          id: numberOrString(venue.id),
          name: stringOrNull(venue.name),
          city: stringOrNull(venue.city),
        }
      : null,
    officials: {
      referee: stringOrNull(fixture?.referee),
    },
    statistics: stats,
    events: mappedEvents,
    event_highlights: mappedEvents.slice(-8),
    meta: {
      events: mappedEvents.length > 0 ? { status: "ok" } : { status: "unavailable", message: "No live events published yet." },
      statistics:
        stats.some((item) => item?.stats && Object.keys(item.stats).length > 0)
          ? { status: "ok" }
          : { status: "unavailable", message: "Detailed live stats are not available right now." },
      lineups: { status: "unavailable" },
      standings: { status: "unavailable" },
    },
  };
}

function buildFallbackStatistics(match: Match) {
  const homeStats: FootballStatisticsMap = {};
  const awayStats: FootballStatisticsMap = {};

  applyIfNumber(homeStats, "shots_on_goal", match.home_shots_on_target);
  applyIfNumber(awayStats, "shots_on_goal", match.away_shots_on_target);
  applyIfNumber(homeStats, "corner_kicks", match.home_corners);
  applyIfNumber(awayStats, "corner_kicks", match.away_corners);
  applyIfNumber(homeStats, "red_cards", match.home_red_cards);
  applyIfNumber(awayStats, "red_cards", match.away_red_cards);

  return [
    { team_name: match.team1, stats: homeStats },
    { team_name: match.team2, stats: awayStats },
  ];
}

function applyIfNumber(bucket: FootballStatisticsMap, key: string, value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    bucket[key] = value;
  }
}

function normalizeRawEvent(value: unknown) {
  const event = objectValue(value);
  if (!event) return null;

  const team = objectValue(event.team);
  const player = objectValue(event.player);
  const assist = objectValue(event.assist);
  const time = objectValue(event.time);
  const type = stringOrNull(event.type);
  const detail = stringOrNull(event.detail);

  return {
    minute: numberOrNull(time?.elapsed),
    stoppage: numberOrNull(time?.extra),
    team_id: numberOrNull(team?.id),
    team_name: stringOrNull(team?.name),
    player_name: stringOrNull(player?.name),
    assist_name: stringOrNull(assist?.name),
    type,
    detail,
    comments: stringOrNull(event.comments),
    label: detail || type || "Match Event",
  };
}

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringOrNull(value: unknown) {
  const normalized = String(value || "").trim();
  return normalized ? normalized : null;
}

function numberOrNull(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function numberOrString(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") return value;
  return null;
}
