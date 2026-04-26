defmodule Back.Betting.OddsLifecycle do
  @moduledoc false

  import Ecto.Query

  alias Back.Betting.{Match, Odds}
  alias Back.Live.LangGraphClient
  alias Back.State.MarketManager
  alias Back.Repo

  def sync_after_write(result, previous_match \\ nil)

  def sync_after_write({:ok, %Match{} = match} = result, previous_match) do
    _ = sync_match_runtime_state(match, previous_match)
    result
  end

  def sync_after_write(other, _previous_match), do: other

  def sync_after_transaction(result, previous_match \\ nil)

  def sync_after_transaction({:ok, %{match: %Match{} = match}} = result, previous_match) do
    _ = sync_match_runtime_state(match, previous_match)
    result
  end

  def sync_after_transaction(other, _previous_match), do: other

  def sync_match_runtime_state(%Match{status: status} = match, previous_match)
      when status in [:closed, :settled, :cancelled] do
    deactivate_all_active_odds(match.id)
    maybe_deactivate_stale_live_odds(previous_match, match)
    maybe_queue_live_reprice(previous_match, match)
  end

  def sync_match_runtime_state(%Match{} = match, previous_match) do
    maybe_deactivate_stale_live_odds(previous_match, match)
    maybe_recover_provider_disconnect(previous_match, match)
    maybe_queue_live_reprice(previous_match, match)
  end

  def deactivate_all_active_odds(match_id) do
    Repo.update_all(
      from(o in Odds, where: o.match_id == ^match_id and o.is_active == true),
      set: [is_active: false, updated_at: now()]
    )

    :ok
  end

  def maybe_deactivate_stale_live_odds(nil, _current_match), do: :ok

  def maybe_deactivate_stale_live_odds(%Match{} = previous_match, %Match{} = current_match) do
    if keep_live_board_until_replaced?(previous_match, current_match) do
      :ok
    else
      if stale_live_market_context_changed?(previous_match, current_match) do
        Repo.update_all(
          from(o in Odds,
            where:
              o.match_id == ^current_match.id and o.is_active == true and o.bet_type == :in_play
          ),
          set: [is_active: false, updated_at: now()]
        )

        :ok
      else
        :ok
      end
    end
  end

  defp keep_live_board_until_replaced?(
         %Match{id: id, status: :live, sport: sport},
         %Match{id: id, status: :live, sport: sport}
       )
       when sport in [:football, :cricket, :tennis] do
    true
  end

  defp keep_live_board_until_replaced?(_, _), do: false

  defp stale_live_market_context_changed?(
         %Match{id: id, status: old_status, score: old_score},
         %Match{id: id, status: new_status, score: new_score}
       ) do
    live_context?(old_status) and live_context?(new_status) and
      normalize_score(old_score) != normalize_score(new_score)
  end

  defp stale_live_market_context_changed?(
         %Match{id: id, status: old_status},
         %Match{id: id, status: new_status}
       ) do
    old_status != new_status and (live_context?(old_status) or live_context?(new_status))
  end

  defp stale_live_market_context_changed?(_, _), do: false

  defp maybe_queue_live_reprice(nil, %Match{sport: :cricket, status: :live} = match) do
    queue_cricket_bootstrap(
      match,
      :live_status_transition,
      "live_activation",
      "live_status_transition"
    )

    :ok
  end

  defp maybe_queue_live_reprice(
         nil,
         %Match{sport: :football, status: :live} = match
       ) do
    LangGraphClient.force_reprice_async(match,
      reason: :football_live_status_transition,
      event_type: "football_live_activation",
      suspend_reason: "live_activation",
      trigger: "football_live_status_transition"
    )

    :ok
  end

  defp maybe_queue_live_reprice(
         %Match{id: id, status: previous_status},
         %Match{id: id, sport: :cricket, status: :live} = match
       )
       when previous_status != :live do
    queue_cricket_bootstrap(
      match,
      :live_status_transition,
      "live_activation",
      "live_status_transition"
    )

    :ok
  end

  defp maybe_queue_live_reprice(
         %Match{id: id, status: previous_status},
         %Match{id: id, sport: :football, status: :live} = match
       )
       when previous_status != :live do
    LangGraphClient.force_reprice_async(match,
      reason: :football_live_status_transition,
      event_type: "football_live_activation",
      suspend_reason: "live_activation",
      trigger: "football_live_status_transition"
    )

    :ok
  end

  defp maybe_queue_live_reprice(
         %Match{id: id, sport: :cricket, status: :live, score: previous_score},
         %Match{id: id, sport: :cricket, status: :live, score: current_score} = match
       ) do
    if normalize_score(previous_score) != normalize_score(current_score) and
         not MarketManager.published_platform_odds_exist?(match.id) do
      LangGraphClient.force_reprice_async(match,
        reason: :bootstrap_recovery,
        event_type: "bootstrap_recovery",
        suspend_reason: "live_bootstrap",
        trigger: "bootstrap_recovery"
      )
    end

    :ok
  end

  defp maybe_queue_live_reprice(
         %Match{id: id, sport: :football, status: :live, score: previous_score} = previous_match,
         %Match{id: id, sport: :football, status: :live, score: current_score} = match
       ) do
    cond do
      normalize_score(previous_score) != normalize_score(current_score) ->
        LangGraphClient.force_reprice_async(match,
          reason: :football_live_score_update,
          event_type: "football_score_update",
          suspend_reason: "goal_scored",
          trigger: "football_live_score_update"
        )

      football_live_market_context_changed?(previous_match, match) ->
        LangGraphClient.force_reprice_async(match,
          reason: :football_live_context_update,
          event_type: "football_context_update",
          trigger: "football_live_context_update"
        )

      not MarketManager.published_platform_odds_exist?(match.id) ->
        LangGraphClient.force_reprice_async(match,
          reason: :bootstrap_recovery,
          event_type: "bootstrap_recovery",
          trigger: "bootstrap_recovery"
        )

      true ->
        :ok
    end

    :ok
  end

  defp maybe_queue_live_reprice(_, _), do: :ok

  defp maybe_recover_provider_disconnect(
         %Match{
           id: id,
           sport: :cricket,
           status: :live,
           suspension_reason: "provider_disconnect",
           last_live_event_at: previous_live_event_at
         },
         %Match{
           id: id,
           sport: :cricket,
           status: :live,
           last_live_event_at: current_live_event_at
         } = match
       ) do
    cond do
      is_nil(current_live_event_at) ->
        :ok

      is_nil(previous_live_event_at) ->
        LangGraphClient.force_reprice_async(match,
          reason: :provider_reconnect,
          event_type: "provider_reconnect",
          trigger: "provider_reconnect"
        )

      DateTime.compare(current_live_event_at, previous_live_event_at) == :gt ->
        LangGraphClient.force_reprice_async(match,
          reason: :provider_reconnect,
          event_type: "provider_reconnect",
          trigger: "provider_reconnect"
        )

      true ->
        :ok
    end
  end

  defp maybe_recover_provider_disconnect(_, _), do: :ok

  defp queue_cricket_bootstrap(%Match{} = match, reason, suspend_reason, trigger) do
    LangGraphClient.force_reprice_async(match,
      reason: reason,
      event_type: "live_activation",
      suspend_reason: suspend_reason,
      trigger: trigger
    )
  end

  defp live_context?(status), do: status == :live

  defp normalize_score(score) when is_map(score) do
    score
    |> deep_sort()
  end

  defp normalize_score(score), do: score

  defp deep_sort(map) when is_map(map) do
    map
    |> Enum.map(fn {key, value} -> {key, deep_sort(value)} end)
    |> Enum.sort_by(fn {key, _value} -> to_string(key) end)
  end

  defp deep_sort(list) when is_list(list), do: Enum.map(list, &deep_sort/1)
  defp deep_sort(value), do: value

  defp football_live_market_context_changed?(
         %Match{id: id} = previous_match,
         %Match{id: id} = current_match
       ) do
    football_live_market_context_snapshot(previous_match) !=
      football_live_market_context_snapshot(current_match)
  end

  defp football_live_market_context_changed?(_, _), do: false

  defp football_live_market_context_snapshot(%Match{} = match) do
    %{
      score: normalize_score(match.score),
      elapsed_minute: normalize_live_value(match.elapsed_minute),
      stoppage_minute: normalize_live_value(match.stoppage_minute),
      home_red_cards: normalize_live_value(match.home_red_cards),
      away_red_cards: normalize_live_value(match.away_red_cards),
      home_corners: normalize_live_value(match.home_corners),
      away_corners: normalize_live_value(match.away_corners),
      home_shots_on_target: normalize_live_value(match.home_shots_on_target),
      away_shots_on_target: normalize_live_value(match.away_shots_on_target),
      tempo_index: normalize_live_value(match.tempo_index)
    }
  end

  defp normalize_live_value(%Decimal{} = value), do: Decimal.to_string(value, :normal)
  defp normalize_live_value(%DateTime{} = value), do: DateTime.to_iso8601(value)
  defp normalize_live_value(value), do: value

  defp now, do: DateTime.utc_now() |> DateTime.truncate(:second)
end
