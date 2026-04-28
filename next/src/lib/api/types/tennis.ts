export type TennisFixture = {
  event_key: string;
  status?: string | null;
  start_time?: string | null;
  tournament_name?: string | null;
  round_name?: string | null;
  court_name?: string | null;
  player_1_name?: string | null;
  player_2_name?: string | null;
  player_1_key?: string | null;
  player_2_key?: string | null;
  season?: string | null;
  raw?: Record<string, unknown> | null;
};

export type TennisLiveOdds = {
  event_key: string;
  market_key?: string | null;
  market_name?: string | null;
  selection_key?: string | null;
  selection_name?: string | null;
  odds_value?: number | string | null;
  line?: number | string | null;
  scope?: string | null;
  provider_updated_at?: string | null;
  raw?: Record<string, unknown> | null;
};

export type TennisMatchState = {
  event_key: string;
  status?: string | null;
  server?: string | null;
  event_status?: string | null;
  current_set?: number | null;
  current_game_score?: string | null;
  current_point_score?: string | null;
  game_result?: string | null;
  final_result?: string | null;
  deuce?: boolean | null;
  advantage_player?: string | null;
  tiebreak?: boolean | null;
  set_point?: boolean | null;
  match_point?: boolean | null;
  break_point?: boolean | null;
  player_1_name?: string | null;
  player_2_name?: string | null;
  player_1_key?: string | null;
  player_2_key?: string | null;
  score?: Record<string, unknown> | null;
  sets?: Array<Record<string, unknown>>;
  point_by_point?: Array<Record<string, unknown>>;
  tennis_context?: Record<string, unknown> | null;
  raw_live_odds?: TennisLiveOdds[] | null;
  published_odds?: TennisLiveOdds[] | null;
  raw_fixture?: Record<string, unknown> | null;
  raw_livescore?: Record<string, unknown> | null;
  updated_at?: string | null;
  tracking_status?: string | null;
  tracked_at?: string | null;
  published?: boolean | null;
  publish_status?: string | null;
  workflow_label?: string | null;
  workflow_hint?: string | null;
  fixture_snapshot?: Record<string, unknown> | null;
  bettor_count?: number | null;
  bet_count?: number | null;
  matched_volume?: number | string | null;
  house_position?: number | string | null;
};

export type TennisDeskResponse = {
  matches: TennisMatchState[];
  margin: string;
  simulation?: {
    enabled: boolean;
    scenario?: string | null;
    scenarios?: string[];
  };
};
