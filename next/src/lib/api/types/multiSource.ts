import type { ISODateTimeString, UUID } from "../response";

export type TeamSnapshot = {
  id?: string | null;
  name?: string | null;
  slug?: string | null;
};

export type CanonicalMatchCandidate = {
  id: UUID;
  sport: string;
  competition_name?: string | null;
  start_time?: ISODateTimeString | null;
  anchor_source_name?: string | null;
  anchor_source_match_id?: string | null;
  status?: string | null;
  home_team?: TeamSnapshot | null;
  away_team?: TeamSnapshot | null;
  metadata?: Record<string, unknown> | null;
};

export type MatchMappingSuggestion = {
  id: UUID;
  source_name: string;
  source_match_id: string;
  confidence?: number | null;
  matched_via?: string | null;
  kickoff_delta_seconds?: number | null;
  mapping_status: "suggested" | "manual_confirmed" | "rejected" | "needs_review" | string;
  source_snapshot?: Record<string, unknown> | null;
  candidate_snapshot?: Record<string, unknown> | null;
  candidate_canonical_match?: CanonicalMatchCandidate | null;
  reviewed_by_id?: UUID | null;
  reviewed_at?: ISODateTimeString | null;
  review_note?: string | null;
  inserted_at?: ISODateTimeString | null;
  updated_at?: ISODateTimeString | null;
};

export type MatchSuggestionSummary = {
  total: number;
  suggested: number;
  needs_review: number;
  rejected: number;
  approved: number;
};

export type MultiSourceConsumerHealth = {
  running: boolean;
  subscribed: boolean;
  channel: string;
  last_message_at?: ISODateTimeString | null;
};

export type MultiSourceHealth = {
  arbiter_enabled: boolean;
  canonical_live_trading_enabled: boolean;
  redis_pubsub_running: boolean;
  redis_consumer: MultiSourceConsumerHealth;
  suggestion_count: number;
  latest_suggestion_at?: ISODateTimeString | null;
};

export type MultiSourceAutomationWorkerStatus = {
  ran_at?: ISODateTimeString | null;
  ai_enabled?: boolean;
  ai_model?: string | null;
  refresh_result?: Record<string, unknown> | null;
  mapping_result?: Record<string, unknown> | null;
  timeout_seconds?: number | null;
  result?: Record<string, unknown> | null;
  deleted_count?: number | null;
};

export type MultiSourceAutomationStatus = {
  generated_at?: ISODateTimeString | null;
  ai_enabled: boolean;
  ai_model?: string | null;
  pending_source_fetches: number;
  completed_source_fetches_24h: number;
  timed_out_source_fetches_24h: number;
  auto_confirmed_mappings_24h: number;
  open_live_cricket_suggestions: number;
  workers: {
    orchestrator?: MultiSourceAutomationWorkerStatus | null;
    refresh_timeout?: MultiSourceAutomationWorkerStatus | null;
    matchmaker_prune?: MultiSourceAutomationWorkerStatus | null;
  };
};

export type MultiSourceAutomationEvent = {
  id: UUID;
  event_type: string;
  status: string;
  source_name?: string | null;
  source_match_id?: string | null;
  match_id?: UUID | null;
  canonical_match_id?: UUID | null;
  message?: string | null;
  metadata?: Record<string, unknown> | null;
  inserted_at?: ISODateTimeString | null;
  updated_at?: ISODateTimeString | null;
};

export type CricketPollingProfile = {
  match_id: UUID;
  competition_feed_id?: UUID | null;
  competition_name?: string | null;
  team1?: string | null;
  team2?: string | null;
  status?: string | null;
  start_time?: ISODateTimeString | null;
  in_play_enabled: boolean;
  current_innings?: number | null;
  current_over?: string | null;
  current_ball_in_over?: number | null;
  last_ball_event_type?: string | null;
  last_live_event_at?: ISODateTimeString | null;
  suspended_at?: ISODateTimeString | null;
  suspension_reason?: string | null;
  source_refresh_phase: "hot_live" | "warmup" | "scheduled" | "cooldown" | "archived" | string;
  recommended_poll_interval_seconds: number;
  source_refresh_required: boolean;
  source_name?: string | null;
  source_match_id?: string | null;
  source_fetch_enabled?: boolean;
  source_refresh_status?: {
    last_status?: string | null;
    last_requested_at?: ISODateTimeString | null;
    last_completed_at?: ISODateTimeString | null;
    last_message?: string | null;
    metadata?: Record<string, unknown> | null;
  } | null;
  ai_policy?: string | null;
  ai_model?: string | null;
  rationale?: string | null;
  risk_flags: string[];
};

export type CricketPollingProfileSummary = {
  total: number;
  hot_live: number;
  warmup: number;
  scheduled: number;
  cooldown: number;
  archived: number;
  needs_source_refresh: number;
};

export type CricketPollingProfileResponse = {
  ai_enabled: boolean;
  ai_model?: string | null;
  generated_at?: ISODateTimeString | null;
  summary: CricketPollingProfileSummary;
  data: CricketPollingProfile[];
};

export type SourceRefreshAdvisory = {
  match_id: UUID;
  refresh_now: boolean;
  recommended_interval_seconds: number;
  confidence: number;
  reason: string;
  requires_manual_review: boolean;
  ai_used: boolean;
  model: string;
  risk_flags: string[];
};

export type ScraperConfiguration = {
  id: UUID;
  source_name: string;
  transport: "websocket" | "polling" | string;
  bootstrap_url?: string | null;
  ws_url?: string | null;
  poll_url?: string | null;
  proxy_url?: string | null;
  gateway_id?: UUID | null;
  gateway?: EgressGateway | null;
  is_active: boolean;
  inserted_at?: ISODateTimeString | null;
  updated_at?: ISODateTimeString | null;
};

export type EgressGateway = {
  id: UUID;
  name: string;
  url?: string | null;
  is_default_direct: boolean;
  inserted_at?: ISODateTimeString | null;
  updated_at?: ISODateTimeString | null;
};
