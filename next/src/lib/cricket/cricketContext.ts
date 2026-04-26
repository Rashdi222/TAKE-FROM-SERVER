import type { Match } from "@/lib/api";
import { isMatchLiveForDisplay } from "@/lib/matches/liveStatus";

export type CricketVenueContext = {
  venue?: {
    id?: number | string | null;
    name?: string | null;
    city?: string | null;
    country?: string | null;
    timezone?: string | null;
  } | null;
  officials?: {
    first_umpire?: { fullname?: string | null } | null;
    second_umpire?: { fullname?: string | null } | null;
    tv_umpire?: { fullname?: string | null } | null;
    referee?: { fullname?: string | null } | null;
  } | null;
  awards?: {
    man_of_match?: { fullname?: string | null } | null;
    man_of_series?: { fullname?: string | null } | null;
  } | null;
};

export type CricketLineupPlayer = {
  id?: number | string | null;
  team_id?: number | string | null;
  team_name?: string | null;
  player_id?: number | string | null;
  player_name?: string | null;
  role?: string | null;
  captain?: boolean;
  wicketkeeper?: boolean;
  substitute?: boolean;
  position?: string | null;
};

export type CricketLineupContext = {
  toss?: {
    winner_team_id?: number | string | null;
    winner_name?: string | null;
    decision?: string | null;
  } | null;
  lineup?: CricketLineupPlayer[] | null;
  captains?: CricketLineupPlayer[] | null;
  wicketkeepers?: CricketLineupPlayer[] | null;
};

export type CricketScoreboardContext = {
  scoreboards?: Array<{
    id?: number | string | null;
    type?: string | null;
    inning?: number | null;
    title?: string | null;
  }> | null;
  current_scoreboard?: {
    type?: string | null;
    inning?: number | null;
    current_run_rate?: string | number | null;
    required_run_rate?: string | number | null;
    ball_feed?: Array<{
      id?: number | string | null;
      over?: string | number | null;
      batsman?: string | null;
      bowler?: string | null;
      runs?: number | null;
      label?: string | null;
      is_wicket?: boolean;
      is_boundary?: boolean;
    }> | null;
  } | null;
};

export type CricketContext = {
  venue?: CricketVenueContext | null;
  lineup?: CricketLineupContext | null;
  scoreboard?: CricketScoreboardContext | null;
};

export function extractCricketContext(match: Match | null | undefined): CricketContext | null {
  const rawData = match?.raw_data;
  if (!rawData || typeof rawData !== "object" || Array.isArray(rawData)) return null;

  const cricketContext = (rawData as Record<string, unknown>).cricket_context;
  if (!cricketContext || typeof cricketContext !== "object" || Array.isArray(cricketContext)) return null;

  return cricketContext as CricketContext;
}

export function isCricketPrematchLike(match: Match | null | undefined) {
  if (!match || match.sport !== "cricket") return false;
  if (isMatchLiveForDisplay(match)) return false;
  return true;
}
