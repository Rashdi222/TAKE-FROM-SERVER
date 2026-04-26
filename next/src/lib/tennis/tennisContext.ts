import type { TennisMatchState } from "@/lib/api";

export type TennisPlayerContext = {
  key?: string | null;
  name?: string | null;
  rank?: string | null;
  country?: string | null;
  movement?: string | null;
  points?: string | null;
  profile?: {
    age?: string | null;
    image?: string | null;
    handedness?: string | null;
  } | null;
};

export type TennisContextSource = {
  rankings_fetched?: boolean;
  player_profiles_fetched?: boolean;
};

export type TennisContext = {
  surface?: string | null;
  tournament?: {
    name?: string | null;
    tier?: string | null;
    round?: string | null;
    season?: string | null;
    event_type?: string | null;
    court_name?: string | null;
  } | null;
  players?: {
    player_1?: TennisPlayerContext | null;
    player_2?: TennisPlayerContext | null;
  } | null;
  source?: TennisContextSource | null;
};

export function extractTennisContext(match: TennisMatchState | null | undefined): TennisContext | null {
  const value = match?.tennis_context;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as TennisContext;
}

export function isTennisPrematchLike(match: TennisMatchState | null | undefined) {
  if (!match) return false;
  if (match.status !== "live") return true;

  const eventStatus = String(match.event_status || "").toLowerCase();
  return (
    eventStatus.includes("rain") ||
    eventStatus.includes("delay") ||
    eventStatus.includes("suspended") ||
    eventStatus.includes("postponed")
  );
}
