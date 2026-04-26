defmodule Back.Tennis.MatchState do
  @enforce_keys [:event_key]
  defstruct [
    :event_key,
    :status,
    :server,
    :event_status,
    :current_set,
    :current_game_score,
    :current_point_score,
    :game_result,
    :final_result,
    :deuce?,
    :advantage_player,
    :tiebreak?,
    :set_point?,
    :match_point?,
    :break_point?,
    :player_1_name,
    :player_2_name,
    :player_1_key,
    :player_2_key,
    :sets,
    :score,
    :point_by_point,
    :tennis_context,
    :raw_live_odds,
    :published_odds,
    :raw_fixture,
    :raw_livescore,
    :updated_at
  ]
end
