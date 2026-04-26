defmodule BackWeb.TennisChannel do
  use BackWeb, :channel

  alias Back.Tennis.MatchState
  alias BackWeb.JsonHelpers

  def join("tennis:lobby", _params, socket), do: {:ok, socket}
  def join("tennis:match:" <> _event_key, _params, socket), do: {:ok, socket}
  def join(_, _, _), do: {:error, %{reason: "invalid topic"}}

  def broadcast_state_updated(%MatchState{event_key: event_key} = state)
      when is_binary(event_key) do
    payload = payload_from_state(state)
    BackWeb.Endpoint.broadcast("tennis:lobby", "tennis_state_updated", payload)
    BackWeb.Endpoint.broadcast("tennis:match:#{event_key}", "tennis_state_updated", payload)
  end

  def broadcast_state_updated(%{} = state) do
    event_key = fetch_value(state, :event_key)

    if is_binary(event_key) do
      payload = payload_from_state(state)
      BackWeb.Endpoint.broadcast("tennis:lobby", "tennis_state_updated", payload)
      BackWeb.Endpoint.broadcast("tennis:match:#{event_key}", "tennis_state_updated", payload)
    end
  end

  defp payload_from_state(state) do
    %{
      event_key: fetch_value(state, :event_key),
      status: fetch_value(state, :status),
      event_status: fetch_value(state, :event_status),
      player_1_name: fetch_value(state, :player_1_name),
      player_2_name: fetch_value(state, :player_2_name),
      server: fetch_value(state, :server),
      current_set: fetch_value(state, :current_set),
      current_game_score: fetch_value(state, :current_game_score),
      current_point_score: fetch_value(state, :current_point_score),
      final_result: fetch_value(state, :final_result),
      score: JsonHelpers.json_safe(fetch_value(state, :score)),
      sets: JsonHelpers.json_safe(fetch_value(state, :sets)),
      point_by_point: JsonHelpers.json_safe(fetch_value(state, :point_by_point)),
      tennis_context: JsonHelpers.json_safe(fetch_value(state, :tennis_context)),
      deuce: fetch_value(state, :deuce?),
      advantage_player: fetch_value(state, :advantage_player),
      tiebreak: fetch_value(state, :tiebreak?),
      break_point: fetch_value(state, :break_point?),
      set_point: fetch_value(state, :set_point?),
      match_point: fetch_value(state, :match_point?),
      published_odds: JsonHelpers.json_safe(fetch_value(state, :published_odds)),
      updated_at: fetch_value(state, :updated_at),
      tracked_at: fetch_value(state, :tracked_at),
      published: fetch_value(state, :published),
      publish_status: fetch_value(state, :publish_status),
      tracking_status: fetch_value(state, :tracking_status),
      workflow_label: fetch_value(state, :workflow_label),
      workflow_hint: fetch_value(state, :workflow_hint),
      fixture_snapshot: JsonHelpers.json_safe(fetch_value(state, :fixture_snapshot))
    }
  end

  defp fetch_value(%{} = state, key) when is_atom(key) do
    Map.get(state, key) || Map.get(state, Atom.to_string(key))
  end
end
