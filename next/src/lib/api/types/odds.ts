import type { ISODateTimeString, UUID } from "../response";

export type OddsVisibilityStatus = "draft" | "published" | "archived";
export type OddsSourceType = "platform" | "provider_import";

export type Odds = {
  id: UUID;
  match_id: UUID;
  market?: string | null;
  market_family?: string | null;
  window_label?: string | null;
  projected_line?: string | null;
  fair_projected_line?: string | null;
  bet_type?: string | null;
  selection_key?: string | null;
  outcome?: string | null;
  odds_value?: number | string | null;
  fair_probability?: number | string | null;
  display_probability?: number | string | null;
  final_published_probability?: number | string | null;
  shading_magnitude?: number | string | null;
  volatility_mode_active?: boolean | null;
  elasticity_applied?: boolean | null;
  elasticity_reason?: string | null;
  active_playbooks?: string[] | null;
  bookmaker_summary?: Record<string, unknown> | null;
  bookmaker_node_latency_ms?: number | string | null;
  reference_source?: string | null;
  reference_price?: number | string | null;
  reference_probability?: number | string | null;
  reference_probability_delta?: number | string | null;
  valid_for_ms?: number | string | null;
  transition_state?: string | null;
  is_transitioning?: boolean;
  freeze_reason?: string | null;
  visibility_status?: OddsVisibilityStatus | string;
  version_no?: number;
  admin_note?: string | null;
  published_by_id?: UUID | null;
  published_at?: ISODateTimeString | null;
  is_active?: boolean;
  max_stake_amount?: number | string | null;
  max_payout_amount?: number | string | null;
  limit_scope?: string | null;
  source_type?: OddsSourceType | string;
  source_provider?: string | null;
  source_external_id?: string | null;
  source_market_key?: string | null;
  matched_volume?: number | string | null;
  liability?: number | string | null;
  is_suspended?: boolean;
  suspension_reason?: string | null;
  provider_snapshot?: Record<string, unknown> | null;
  inserted_at?: ISODateTimeString;
  updated_at?: ISODateTimeString;
  [k: string]: unknown;
};

export type ProviderOddsReference = {
  bet_type?: string | null;
  outcome?: string | null;
  odds_value?: number | string | null;
  source_type?: OddsSourceType | string;
  source_provider?: string | null;
  source_external_id?: string | null;
  source_market_key?: string | null;
  provider_snapshot?: Record<string, unknown> | null;
};

export type ProviderOddsReferenceResponse = {
  match_id: UUID;
  provider: string;
  imported_supported: boolean;
  data: ProviderOddsReference[];
};

export type SportMarketConfig = {
  id: UUID;
  sport: string;
  bet_type: string;
  default_min_odds?: number | string | null;
  default_max_odds?: number | string | null;
  default_max_stake_amount?: number | string | null;
  default_max_payout_amount?: number | string | null;
  is_enabled: boolean;
  inserted_at?: ISODateTimeString;
  updated_at?: ISODateTimeString;
};

export type CreateOddsRequest = Record<string, unknown>;
export type UpdateOddsRequest = Record<string, unknown>;
