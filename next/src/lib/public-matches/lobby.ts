import type { Match } from "@/lib/api";
import { formatCricketMarketLabel } from "@/lib/cricket/cricketMarketDictionary";
import {
  formatFootballMarketLabel,
  formatFootballSelectionLabel,
} from "@/lib/football/footballMarketDictionary";
import { formatDate, formatDateTime } from "@/lib/format";
import { isMatchLiveForDisplay } from "@/lib/matches/liveStatus";

export type MatchStateBucket = "live" | "today" | "tomorrow" | "week" | "upcoming";

export const STATE_BUCKETS: Array<{ id: MatchStateBucket; label: string }> = [
  { id: "live", label: "Live" },
  { id: "today", label: "Today" },
  { id: "tomorrow", label: "Tomorrow" },
  { id: "week", label: "This Week" },
  { id: "upcoming", label: "All Upcoming" },
];

export const STATE_BUCKET_META: Record<
  MatchStateBucket,
  { headline: string; emptyTitle: string; emptyBody: string }
> = {
  live: {
    headline: "Watch the live board move in real time.",
    emptyTitle: "No live matches right now",
    emptyBody: "Switch to Today or This Week to see the next markets lining up.",
  },
  today: {
    headline: "The strongest card for the rest of today.",
    emptyTitle: "No more matches today",
    emptyBody: "Move to Tomorrow or This Week to keep browsing the next slate.",
  },
  tomorrow: {
    headline: "Tomorrow's board, grouped and ready.",
    emptyTitle: "Nothing is loaded for tomorrow yet",
    emptyBody: "Try This Week for a wider slate or switch sports to widen the board.",
  },
  week: {
    headline: "A broader look at the next seven days.",
    emptyTitle: "No upcoming matches in this week view",
    emptyBody: "Try All Upcoming or reset the sport and competition filters.",
  },
  upcoming: {
    headline: "Everything lined up next across the board.",
    emptyTitle: "No upcoming matches found",
    emptyBody: "Reset the filters or wait for more feeds to be published.",
  },
};

export const SPORT_OPTIONS = [
  { id: "all", label: "All" },
  { id: "cricket", label: "Cricket" },
  { id: "football", label: "Football" },
  { id: "tennis", label: "Tennis" },
  { id: "horse_racing", label: "Horse Racing" },
  { id: "dog_racing", label: "Dog Racing" },
] as const;

const SPORT_PRIORITY: Record<string, number> = {
  cricket: 0,
  football: 1,
  tennis: 2,
  horse_racing: 3,
  dog_racing: 4,
};

const PLACEHOLDER_TEAMS = new Set(["Team 1", "Team 2", "Unknown Team"]);

export function sanitizeCompetitionLabel(value: string | null | undefined) {
  return String(value || "")
    .replace(/\s+via\s+[A-Za-z0-9 _-]+$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function isRenderablePublicMatch(match: Match) {
  if (match.quality?.public_renderable === false) return false;

  const team1 = String(match.team1 ?? "").trim();
  const team2 = String(match.team2 ?? "").trim();

  if (!team1 || !team2) return false;
  if (PLACEHOLDER_TEAMS.has(team1) || PLACEHOLDER_TEAMS.has(team2)) return false;
  if (!match.start_time) return false;
  if (match.status === "cancelled") return false;

  return true;
}

export function matchCompetitionName(match: Match) {
  return sanitizeCompetitionLabel(
    match.competition?.name ||
    (typeof match.season_name === "string" ? match.season_name : null) ||
    ((match.raw_data as { _competition_feed?: { name?: string } } | undefined)?._competition_feed?.name ?? null) ||
    readableSport(match.sport)
  );
}

export function matchCompetitionKey(match: Match) {
  return (
    match.competition?.competition_key ||
    ((match.raw_data as { _competition_feed?: { competition_key?: string } } | undefined)?._competition_feed
      ?.competition_key ?? null)
  );
}

export function readableSport(sport: string | null | undefined) {
  switch (sport) {
    case "horse_racing":
      return "Horse Racing";
    case "dog_racing":
      return "Dog Racing";
    case "football":
      return "Football";
    case "tennis":
      return "Tennis";
    case "cricket":
    default:
      return "Cricket";
  }
}

export function filterMatches(matches: Match[], state: MatchStateBucket, sport: string, competition: string) {
  return matches
    .filter(isRenderablePublicMatch)
    .filter((match) => (sport === "all" ? true : match.sport === sport))
    .filter((match) =>
      competition === "all"
        ? true
        : (matchCompetitionKey(match) || matchCompetitionName(match)) === competition
    )
    .filter((match) => inStateBucket(match, state))
    .sort((a, b) => {
      const aTime = a.start_time ? new Date(a.start_time).getTime() : Number.MAX_SAFE_INTEGER;
      const bTime = b.start_time ? new Date(b.start_time).getTime() : Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    });
}

export function competitionOptions(matches: Match[], sport: string) {
  const values = matches
    .filter(isRenderablePublicMatch)
    .filter((match) => (sport === "all" ? true : match.sport === sport))
    .map((match) => ({
      key: matchCompetitionKey(match) || matchCompetitionName(match),
      label: sanitizeCompetitionLabel(matchCompetitionName(match)),
    }));

  const deduped = new Map<string, string>();

  for (const value of values) {
    if (!deduped.has(value.key)) deduped.set(value.key, value.label);
  }

  return [{ key: "all", label: "All Competitions" }, ...Array.from(deduped.entries())
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([key, label]) => ({ key, label }))];
}

export function groupMatches(matches: Match[], sport: string) {
  const grouped: Record<string, Record<string, Match[]>> = {};

  for (const match of matches) {
    const primary = sport === "all" ? readableSport(match.sport) : matchCompetitionName(match);
    const secondary = sport === "all" ? matchCompetitionName(match) : formatDate(match.start_time);

    grouped[primary] = grouped[primary] ?? {};
    grouped[primary][secondary] = grouped[primary][secondary] ?? [];
    grouped[primary][secondary].push(match);
  }

  return grouped;
}

export function sortPrimaryGroups(groups: Record<string, Record<string, Match[]>>, sport: string) {
  return Object.entries(groups).sort(([leftTitle, leftGroups], [rightTitle, rightGroups]) => {
    if (sport === "all") {
      const leftPriority = sportPriorityByLabel(leftTitle);
      const rightPriority = sportPriorityByLabel(rightTitle);
      if (leftPriority !== rightPriority) return leftPriority - rightPriority;
    }

    const leftNext = earliestGroupTime(leftGroups);
    const rightNext = earliestGroupTime(rightGroups);
    if (leftNext !== rightNext) return leftNext - rightNext;

    return leftTitle.localeCompare(rightTitle);
  });
}

export function sortSecondaryGroups(groups: Record<string, Match[]>) {
  return Object.entries(groups).sort(([leftTitle, leftMatches], [rightTitle, rightMatches]) => {
    const leftNext = earliestMatchTime(leftMatches);
    const rightNext = earliestMatchTime(rightMatches);
    if (leftNext !== rightNext) return leftNext - rightNext;
    return leftTitle.localeCompare(rightTitle);
  });
}

export function groupMatchesByDate(matches: Match[]) {
  const grouped: Record<string, Match[]> = {};

  for (const match of matches) {
    const key = formatDate(match.start_time);
    grouped[key] = grouped[key] ?? [];
    grouped[key].push(match);
  }

  return sortSecondaryGroups(grouped);
}

export function groupTournamentsBySport<T extends { sport: string }>(items: T[]) {
  const grouped: Record<string, T[]> = {};

  for (const item of items) {
    const key = readableSport(item.sport);
    grouped[key] = grouped[key] ?? [];
    grouped[key].push(item);
  }

  return Object.entries(grouped).sort(([left], [right]) => {
    const leftPriority = sportPriorityByLabel(left);
    const rightPriority = sportPriorityByLabel(right);
    if (leftPriority !== rightPriority) return leftPriority - rightPriority;
    return left.localeCompare(right);
  });
}

export function totalGroupedMatches(groups: Record<string, Record<string, Match[]>>) {
  return Object.values(groups).reduce(
    (groupTotal, subgroups) =>
      groupTotal +
      Object.values(subgroups).reduce((subtotal, matches) => subtotal + matches.length, 0),
    0
  );
}

export function bucketCount(matches: Match[], bucket: MatchStateBucket) {
  return matches.filter((match) => isRenderablePublicMatch(match) && inStateBucket(match, bucket)).length;
}

export function liveStrip(matches: Match[]) {
  return matches
    .filter((match) => isRenderablePublicMatch(match) && isMatchLiveForDisplay(match))
    .sort((a, b) => {
      const aTime = a.start_time ? new Date(a.start_time).getTime() : 0;
      const bTime = b.start_time ? new Date(b.start_time).getTime() : 0;
      return aTime - bTime;
    });
}

export function matchMetaLine(match: Match) {
  const parts = [match.round_name, match.venue_name].filter(Boolean).map(String);
  return parts.join(" · ");
}

export function matchContextChips(match: Match) {
  const chips: string[] = [];

  if (match.round_name) chips.push(String(match.round_name));

  switch (match.sport) {
    case "cricket": {
      const score = match.score;
      if (score && typeof score === "object") {
        const typedScore = score as Record<string, unknown>;
        const overs = stringValue(typedScore.overs);
        if (overs) chips.push(`${overs} overs`);
      }
      break;
    }
    case "football": {
      const score = match.score;
      if (score && typeof score === "object") {
        const typedScore = score as Record<string, unknown>;
        const minute =
          numericString(typedScore.minute) ||
          numericString(typedScore.time) ||
          numericString(typedScore.clock);
        if (minute) chips.push(`${minute}'`);
      }
      break;
    }
    case "tennis": {
      const score = match.score;
      if (score && typeof score === "object") {
        const typedScore = score as Record<string, unknown>;
        const setNumber = numericString(typedScore.set) || numericString(typedScore.current_set);
        if (setNumber) chips.push(`Set ${setNumber}`);
      }
      break;
    }
  }

  if (match.venue_name) chips.push(String(match.venue_name));

  return chips.slice(0, 3);
}

export function groupSubtitleLabel(sport: string, subgroupTitle: string, subgroupMatches: Match[]) {
  if (sport === "all") {
    return `${subgroupTitle} · ${subgroupMatches.length} market${subgroupMatches.length === 1 ? "" : "s"}`;
  }

  return `${subgroupTitle} · ${subgroupMatches.length} match${subgroupMatches.length === 1 ? "" : "es"}`;
}

export function matchTimeLabel(match: Match) {
  return formatDateTime(match.start_time ?? null);
}

export function matchScoreSummary(match: Match) {
  switch (match.sport) {
    case "cricket":
      return cricketScoreSummary(match);
    case "football":
      return footballScoreSummary(match);
    case "tennis":
      return tennisScoreSummary(match);
    default:
      return genericScoreSummary(match);
  }
}

export function filterSummary(state: MatchStateBucket, sport: string, competitionLabel?: string) {
  const stateLabel = STATE_BUCKETS.find((bucket) => bucket.id === state)?.label ?? "Matches";
  const sportLabel = SPORT_OPTIONS.find((option) => option.id === sport)?.label ?? "All";

  if (sport === "all" && competitionLabel) return `${stateLabel} · ${competitionLabel}`;
  if (competitionLabel) return `${sportLabel} · ${competitionLabel} · ${stateLabel}`;
  if (sport === "all") return `${stateLabel} across all sports`;
  return `${stateLabel} in ${sportLabel}`;
}

export function matchStatusTone(match: Match) {
  if (isMatchLiveForDisplay(match)) return "live";
  if (match.status === "upcoming") return "upcoming";
  return "default";
}

export function formatPublicMarketLabel(
  sport: string | null | undefined,
  value: string,
  opts?: { selections?: Array<string | null | undefined> }
) {
  if (sport === "cricket") return formatCricketMarketLabel(value);
  if (sport === "football") return formatFootballMarketLabel(value, opts);

  const key = value.trim().toLowerCase();

  switch (key) {
    case "match_winner":
      return sport === "horse_racing" || sport === "dog_racing" ? "Winner" : "Match Winner";
    case "over_under":
      return sport === "cricket" ? "Runs Line" : "Over / Under";
    case "in_play":
      return "In-Play Special";
    case "double_chance":
      return "Double Chance";
    case "btts":
      return "Both Teams to Score";
    case "set_betting":
      return sport === "tennis" ? "Set Betting" : "Set Market";
    case "place":
      return "Place";
    default:
      return value
        .replace(/_/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase());
  }
}

export function formatPublicOutcomeLabel(
  sport: string | null | undefined,
  outcome: string | null | undefined,
  marketKey?: string | null,
  team1?: string | null,
  team2?: string | null
) {
  const value = String(outcome || "").trim();
  if (!value) return "Selection";

  const normalized = value.toLowerCase();

  if (normalized === "team1") return team1 || "Home";
  if (normalized === "team2") return team2 || "Away";
  if (normalized === "x") return "Draw";
  if (normalized === "yes") return "Yes";
  if (normalized === "no") return "No";

  if (sport === "football") {
    return formatFootballSelectionLabel(value, {
      marketKey,
      team1,
      team2,
    });
  }

  if (sport === "cricket" && normalized === "over") return "Over";
  if (sport === "cricket" && normalized === "under") return "Under";

  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function sortPublicMarketGroups(
  sport: string | null | undefined,
  groups: Array<[string, MatchOddsLike[]]>
) {
  return [...groups].sort(([left], [right]) => {
    const leftPriority = marketPriority(sport, left);
    const rightPriority = marketPriority(sport, right);
    if (leftPriority !== rightPriority) return leftPriority - rightPriority;
    return formatPublicMarketLabel(sport, left).localeCompare(formatPublicMarketLabel(sport, right));
  });
}

function cricketScoreSummary(match: Match) {
  const score = match.score;
  if (!score || typeof score !== "object") return null;

  const typedScore = score as Record<string, unknown>;
  const direct = genericScoreSummary(match);

  if (direct) return direct;

  const home = stringValue(typedScore.home);
  const away = stringValue(typedScore.away);
  if (home && away) return `${home} - ${away}`;

  const runs = stringValue(typedScore.runs);
  const wickets = stringValue(typedScore.wickets);
  const overs = stringValue(typedScore.overs);

  if (runs && wickets) {
    return overs ? `${runs}/${wickets} (${overs})` : `${runs}/${wickets}`;
  }

  return null;
}

function footballScoreSummary(match: Match) {
  const generic = genericScoreSummary(match);
  if (generic) return generic;

  const score = match.score;
  if (!score || typeof score !== "object") return null;

  const typedScore = score as Record<string, unknown>;
  const home = numericString(typedScore.home_goals) || numericString(typedScore.localteam_score);
  const away = numericString(typedScore.away_goals) || numericString(typedScore.visitorteam_score);

  if (home && away) return `${home} - ${away}`;
  return null;
}

function tennisScoreSummary(match: Match) {
  const generic = genericScoreSummary(match);
  if (generic) return generic;

  const score = match.score;
  if (!score || typeof score !== "object") return null;

  const typedScore = score as Record<string, unknown>;
  const homeSets = numericString(typedScore.home_sets);
  const awaySets = numericString(typedScore.away_sets);

  if (homeSets && awaySets) return `Sets ${homeSets}-${awaySets}`;
  return null;
}

function genericScoreSummary(match: Match) {
  const score = match.score;
  if (!score || typeof score !== "object") return null;

  const typedScore = score as Record<string, unknown>;
  return [
    stringValue(typedScore.current),
    stringValue(typedScore.summary),
    stringValue(typedScore.display),
    stringValue(typedScore.score),
  ].find(Boolean) ?? null;
}

function inStateBucket(match: Match, bucket: MatchStateBucket) {
  if (!match.start_time) return false;
  const date = new Date(match.start_time);
  if (Number.isNaN(date.getTime())) return false;

  const now = new Date();
  const todayStart = startOfDay(now);
  const tomorrowStart = addDays(todayStart, 1);
  const dayAfterTomorrowStart = addDays(todayStart, 2);
  const weekEnd = addDays(todayStart, 8);

  const liveLike = isMatchLiveForDisplay(match);
  if (bucket === "live") return liveLike;
  if (liveLike) return false;

  switch (bucket) {
    case "today":
      return date >= todayStart && date < tomorrowStart;
    case "tomorrow":
      return date >= tomorrowStart && date < dayAfterTomorrowStart;
    case "week":
      return date >= tomorrowStart && date < weekEnd;
    case "upcoming":
      return date >= todayStart;
    default:
      return false;
  }
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function numericString(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return stringValue(value);
}

function marketPriority(sport: string | null | undefined, value: string) {
  const key = value.trim().toLowerCase();

  if (sport === "cricket") {
    switch (key) {
      case "match_winner":
        return 0;
      case "over_under":
        return 1;
      case "in_play":
        return 2;
      default:
        return 99;
    }
  }

  switch (key) {
    case "match_winner":
      return 0;
    case "double_chance":
      return 1;
    case "btts":
      return 2;
    case "over_under":
      return 3;
    case "set_betting":
      return 4;
    case "in_play":
      return 5;
    case "place":
      return 6;
    default:
      return 99;
  }
}

export type MatchOddsLike = {
  id?: string | number | null;
  bet_type?: string | null;
  market?: string | null;
  outcome?: string | null;
  source_market_key?: string | null;
  max_stake_amount?: number | string | null;
  odds_value?: number | string | null;
  selection_key?: string | null;
};

function earliestGroupTime(groups: Record<string, Match[]>) {
  return Object.values(groups).reduce((earliest, matches) => Math.min(earliest, earliestMatchTime(matches)), Number.MAX_SAFE_INTEGER);
}

function earliestMatchTime(matches: Match[]) {
  return matches.reduce((earliest, match) => {
    if (!match.start_time) return earliest;
    const value = new Date(match.start_time).getTime();
    if (Number.isNaN(value)) return earliest;
    return Math.min(earliest, value);
  }, Number.MAX_SAFE_INTEGER);
}

function sportPriorityByLabel(label: string) {
  const match = SPORT_OPTIONS.find((option) => option.label === label);
  return SPORT_PRIORITY[match?.id || ""] ?? 99;
}
