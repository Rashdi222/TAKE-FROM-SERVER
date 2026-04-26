defmodule Back.Tennis.Fixture do
  @enforce_keys [:event_key]
  defstruct [
    :event_key,
    :status,
    :start_time,
    :tournament_name,
    :round_name,
    :court_name,
    :player_1_name,
    :player_2_name,
    :player_1_key,
    :player_2_key,
    :season,
    :raw
  ]
end
