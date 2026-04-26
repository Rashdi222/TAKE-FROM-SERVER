import type { ISODateTimeString, UUID } from "../response";

export type MatchStatus = "scheduled" | "live" | "closed" | "settled" | "cancelled";

export type Match = {
  id: UUID;
  slug?: string | null;
  sport: string;
  team1?: string | null;
  team2?: string | null;
  start_time?: ISODateTimeString | null;
  status: MatchStatus | string;
  winner?: string | null;
  in_play_enabled?: boolean;
  external_id?: string | null;
  provider?: string | null;
  competition_feed_id?: UUID | null;
  competition?: {
    id: UUID;
    name?: string | null;
    competition_key?: string | null;
  } | null;
  team1_logo?: string | null;
  team2_logo?: string | null;
  venue_name?: string | null;
  round_name?: string | null;
  season_name?: string | null;
  quality?: {
    public_renderable?: boolean;
    issues?: string[];
  } | null;
  live_state_version?: number;
  live_event_seq?: number;
  current_innings?: number;
  current_over?: number | string | null;
  current_ball_in_over?: number;
  balls_remaining?: number | null;
  batting_team?: string | null;
  bowling_team?: string | null;
  runs_total?: number;
  wickets_total?: number;
  target_runs?: number | null;
  required_run_rate?: number | string | null;
  current_run_rate?: number | string | null;
  momentum_index?: number | string | null;
  elapsed_minute?: number;
  stoppage_minute?: number;
  home_score?: number;
  away_score?: number;
  home_red_cards?: number;
  away_red_cards?: number;
  home_corners?: number;
  away_corners?: number;
  home_shots_on_target?: number;
  away_shots_on_target?: number;
  tempo_index?: number | string | null;
  market_state?: Record<string, unknown> | null;
  suspended_markets?: Record<string, unknown> | null;
  suspended_at?: ISODateTimeString | null;
  suspension_reason?: string | null;
  score?: unknown;
  raw_data?: unknown;
  inserted_at?: ISODateTimeString;
  [k: string]: unknown;
};

export type MatchCompetitionAggregate = {
  sport: string;
  competition_feed_id?: UUID | null;
  competition_key?: string | null;
  name?: string | null;
  match_count: number;
  next_match_time?: ISODateTimeString | null;
};

export type CreateMatchRequest = Record<string, unknown>;
export type UpdateMatchRequest = Record<string, unknown>;
