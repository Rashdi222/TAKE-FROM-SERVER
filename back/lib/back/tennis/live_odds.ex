defmodule Back.Tennis.LiveOdds do
  @enforce_keys [:event_key]
  defstruct [
    :event_key,
    :market_key,
    :market_name,
    :selection_key,
    :selection_name,
    :odds_value,
    :line,
    :scope,
    :provider_updated_at,
    :raw
  ]
end
