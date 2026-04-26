export type CurrencyBreakdown = {
  code: string;
  name?: string;
  symbol?: string;
  flag?: string;
  kind?: string;
  enabled?: boolean;
  user_count?: number;
  total_balance?: number | string;
  total_volume?: number | string;
  total_payouts?: number | string;
  net_revenue?: number | string;
  pending_withdrawals?: number | string;
};

export type PlatformStats = {
  total_volume?: number | string;
  total_payouts?: number | string;
  net_revenue?: number | string;
  total_users?: Record<string, number>;
  active_matches?: number;
  pending_withdrawals?: number | string;
  currency_breakdown?: CurrencyBreakdown[];
  [k: string]: unknown;
};

export type MasterAdminReport = {
  master_admin_id: string;
  account_currency?: string;
  player_count?: number;
  player_volume?: number | string;
  player_payouts?: number | string;
  house_edge?: number | string;
  commission_earned?: number | string;
  sport_breakdown?: Array<Record<string, unknown>>;
  market_breakdown?: Array<Record<string, unknown>>;
  rejected_bets_by_reason?: Array<Record<string, unknown>>;
  [k: string]: unknown;
};

export type CricketQuoteCalibrationRow = {
  id: string;
  match_id: string;
  match_status?: string;
  team1?: string | null;
  team2?: string | null;
  state_version?: number;
  event_seq?: number;
  market_key?: string;
  selection_key?: string;
  published_price?: number | string | null;
  fair_probability?: number | string | null;
  display_probability?: number | string | null;
  approved_probability?: number | string | null;
  confidence_score?: number | null;
  valid_for_ms?: number | null;
  reviewer_decision?: string | null;
  active_playbooks?: string[];
  reference_source?: string | null;
  reference_price?: number | string | null;
  reference_probability?: number | string | null;
  reference_probability_delta?: number | string | null;
  eventual_match_status?: string | null;
  eventual_winner?: string | null;
  inserted_at?: string;
};

export type CricketQuoteCalibrationReport = {
  total_quotes?: number;
  with_reference_count?: number;
  resolved_count?: number;
  unresolved_count?: number;
  high_drift_count?: number;
  average_reference_drift?: number;
  recent_quotes?: CricketQuoteCalibrationRow[];
};
