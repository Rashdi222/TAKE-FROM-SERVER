import type { Match, Odds } from "@/lib/api";

export type LiveConnectionStatus = "connecting" | "joined" | "closed" | "error";

export type OddsDelta = {
  odds: Odds[];
};

export type MatchStateUpdatePayload = {
  match_id: string;
  status?: Match["status"];
  live_state_version?: number;
  live_event_seq?: number;
  current_innings?: number;
  current_over?: number | string | null;
  current_ball_in_over?: number;
  runs_total?: number;
  wickets_total?: number;
  batting_team?: string | null;
  bowling_team?: string | null;
  momentum_index?: number | string | null;
  market_state?: Record<string, unknown> | null;
  suspended_markets?: Record<string, unknown> | null;
  cricket_context?: Record<string, unknown> | null;
  football_context?: Record<string, unknown> | null;
  score?: unknown;
  payload?: Record<string, unknown>;
  // Football live score fields
  home_score?: number | null;
  away_score?: number | null;
  elapsed_minute?: number | null;
  stoppage_minute?: number | null;
  home_red_cards?: number | null;
  away_red_cards?: number | null;
  home_corners?: number | null;
  away_corners?: number | null;
  home_shots_on_target?: number | null;
  away_shots_on_target?: number | null;
  tempo_index?: number | string | null;
};

export type MarketSuspendedPayload = {
  match_id: string;
  status?: Match["status"];
  market_status?: "active" | "suspended" | "closed" | null;
  suspended_at?: string | null;
  suspension_reason?: string | null;
  market_keys?: string[] | null;
  suspended_markets?: Record<string, unknown> | null;
};

export type MarketResumedPayload = {
  match_id: string;
  market_status?: "active" | "suspended" | "closed" | null;
  state_version?: number;
  odds_version_no?: number;
  resumed_at?: string | null;
  archived_count?: number;
  degraded?: boolean;
  degraded_reason?: string | null;
  market_keys?: string[] | null;
  suspended_markets?: Record<string, unknown> | null;
};

export type CanonicalMarketUpdatedPayload = {
  match_id: string;
  market_key: string;
  canonical_status?: "active" | "suspended" | "closed" | string | null;
  market_status?: "active" | "suspended" | "closed" | string | null;
  is_suspended?: boolean;
  suspension_reason?: string | null;
  suspension_sources?: string[] | null;
  last_consensus_source?: string | null;
  consensus_version?: number;
  last_consensus_at?: string | null;
};

export type CanonicalOddsSelectionPayload = {
  market_key: string;
  selection_key: string;
  canonical_status?: "active" | "suspended" | "closed" | string | null;
  odds_value?: number | string | null;
  is_suspended?: boolean;
  last_consensus_source?: string | null;
  consensus_version?: number;
  high_water_mark_ms?: number;
  payload?: Record<string, unknown> | null;
};

export type CanonicalOddsUpdatedPayload = {
  match_id: string;
  consensus_source_count?: number | null;
  degraded_sources?: string[] | null;
  odds: CanonicalOddsSelectionPayload[];
};

export type HealthDegradedPayload = {
  match_id: string;
  degraded: boolean;
  consensus_source_count?: number | null;
  degraded_sources?: string[] | null;
  warning?: string | null;
};

export type LiveMatchSelectionQuote = {
  oddsId: string;
  matchId: string;
  marketKey: string;
  selectionKey: string;
  label: string;
  quotedPrice: number;
  oddsVersionNo: number;
  stateVersion: number;
};
