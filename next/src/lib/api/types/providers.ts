import type { ISODateTimeString, UUID } from "../response";

export type Provider = {
  id: UUID;
  name: string;
  is_active: boolean;
  is_enabled: boolean;
  base_url?: string | null;
  socket_url?: string | null;
  auth_mode?: "header" | "query" | "path" | "generic" | string | null;
  headers_template?: Record<string, unknown> | null;
  query_template?: Record<string, unknown> | null;
  sport_scope?: string[] | null;
  has_api_key?: boolean;
  api_key_masked?: string | null;
  config?: Record<string, unknown>;
  inserted_at?: ISODateTimeString;
  updated_at?: ISODateTimeString;
  [k: string]: unknown;
};

export type ProviderSyncLog = {
  id: UUID;
  provider_id?: UUID;
  sync_type?: string;
  status: "success" | "failure" | "partial" | string;
  error?: string | null;
  duration_ms?: number | null;
  metadata?: Record<string, unknown> | null;
  inserted_at?: ISODateTimeString;
  [k: string]: unknown;
};

export type ProviderHealthResponse = {
  active_provider?: Provider | null;
  last_successful_sync?: ProviderSyncLog | null;
  last_failure?: ProviderSyncLog | null;
};

export type CompetitionFeed = {
  id: UUID;
  name: string;
  sport: string;
  competition_key: string;
  league_id?: string | null;
  season_id?: string | null;
  region?: string | null;
  track?: string | null;
  import_mode?: string | null;
  enabled: boolean;
  live_sync_enabled: boolean;
  import_provider_odds: boolean;
  generate_platform_odds: boolean;
  pricing_mode?: "provider_only" | "ai_only" | "hybrid" | string | null;
  upcoming_window_days?: number | null;
  live_start_offset_minutes?: number | null;
  live_poll_interval_seconds?: number | null;
  live_stop_offset_minutes?: number | null;
  config?: Record<string, unknown> | null;
  auto_generate_prematch_odds?: boolean;
  auto_generate_inplay_odds?: boolean;
  prematch_generation_window_minutes?: number | null;
  inplay_generation_interval_seconds?: number | null;
  max_automation_runs_per_match?: number | null;
  live_ai_publish_mode?: "auto_publish" | "review_required" | string | null;
  provider_id?: UUID | null;
  provider?: Provider | null;
  metrics?: CompetitionFeedMetrics | null;
  inserted_at?: ISODateTimeString;
  updated_at?: ISODateTimeString;
};

export type CricketAutomationRun = {
  id: UUID;
  match_id: UUID;
  competition_feed_id: UUID;
  phase: "prematch" | "inplay" | string;
  status: "success" | "failure" | "skipped" | "started" | string;
  trigger: string;
  model?: string | null;
  generated_count?: number;
  state_hash?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
  inserted_at?: ISODateTimeString;
  updated_at?: ISODateTimeString;
};

export type CompetitionFeedMetrics = {
  feed_id: UUID;
  imported_fixture_count: number;
  upcoming_match_count: number;
  live_match_count: number;
  closed_match_count: number;
  settled_match_count: number;
  cancelled_match_count: number;
  failed_sync_count: number;
  provider_odds_imported_count: number;
  last_provider_odds_import_at?: ISODateTimeString | null;
  failed_provider_odds_operation_count: number;
  last_fixture_import?: ProviderSyncLog | null;
  last_live_sync?: ProviderSyncLog | null;
  last_provider_odds_fetch?: ProviderSyncLog | null;
  last_provider_odds_import?: ProviderSyncLog | null;
  live_index?: CompetitionFeedLiveIndexMetrics | null;
  detail_refresh?: CompetitionFeedDetailRefreshMetrics | null;
  live_odds_index?: CompetitionFeedLiveIndexMetrics | null;
};

export type CompetitionFeedLiveIndexMetrics = {
  active_fixture_count: number;
  last_refresh_at?: ISODateTimeString | null;
  last_successful_refresh_at?: ISODateTimeString | null;
  stale?: boolean | null;
};

export type CompetitionFeedDetailRefreshMetrics = {
  tracked_match_count: number;
  refreshed_count: number;
  unchanged_count: number;
  failed_count: number;
  cooldown_suppressed_count?: number;
  hot_target_count?: number;
  warm_target_count?: number;
  due_count?: number;
  selected_count?: number;
  throttled_count?: number;
  last_refresh_at?: ISODateTimeString | null;
  last_successful_refresh_at?: ISODateTimeString | null;
};

export type PublicTournament = {
  id: UUID;
  name: string;
  slug: string;
  sport: string;
  competition_key: string;
  season_id?: string | null;
  match_count: number;
  next_match_time?: ISODateTimeString | null;
  matches?: import("./matches").Match[];
  inserted_at?: ISODateTimeString;
  updated_at?: ISODateTimeString;
};

export type CricketCompetitionDiscoveryItem = {
  id: string;
  provider: "sportmonks" | string;
  sport: "cricket" | string;
  name: string;
  display_name?: string;
  competition_key: string;
  category: "franchise_t20" | "international" | "domestic" | string;
  category_label: string;
  league_id: string;
  season_id: string;
  season_name?: string | null;
  season_label?: string | null;
  starts_at?: ISODateTimeString | string | null;
  ends_at?: ISODateTimeString | string | null;
  raw_context?: Record<string, unknown> | null;
};

export type FootballCompetitionDiscoveryItem = {
  id: string;
  provider: "api_sports" | string;
  sport: "football" | string;
  name: string;
  display_name?: string;
  competition_key: string;
  category: string;
  category_label: string;
  league_id: string;
  season_id?: string | null;
  season_name?: string | null;
  season_label?: string | null;
  country_name?: string | null;
  country_code?: string | null;
  logo_url?: string | null;
  fixture_coverage?: boolean;
  live_coverage?: boolean;
  odds_coverage?: boolean;
  raw_context?: Record<string, unknown> | null;
};

export type CricketSeasonResolution = {
  provider: "sportmonks" | string;
  sport: "cricket" | string;
  league_id: string;
  league_name?: string | null;
  season_id: string;
  season_name?: string | null;
  season_label?: string | null;
  starts_at?: ISODateTimeString | string | null;
  ends_at?: ISODateTimeString | string | null;
  raw_context?: Record<string, unknown> | null;
};
