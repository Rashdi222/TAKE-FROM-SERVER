defmodule Back.Tennis.Score do
  @enforce_keys [:sets, :current_game]
  defstruct [
    :sets,
    :current_game,
    :server,
    :mode,
    :deuce?,
    :advantage_player,
    :tiebreak?,
    :break_point?,
    :set_point?,
    :match_point?
  ]
end
