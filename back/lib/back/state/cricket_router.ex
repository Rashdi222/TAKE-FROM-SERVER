defmodule Back.State.CricketRouter do
  @moduledoc false

  alias Back.Betting.Match
  alias Back.Live.CricketRepriceQueue
  alias Back.Live.LangGraphClient
  alias Back.State.MarketManager
  alias Back.State.MatchLiveEvent
  alias BackWeb.MatchChannel

  @type severity :: :minor | :moderate | :critical
  @type routing_decision :: %{
          severity: severity(),
          requires_suspend: boolean(),
          requires_full_reprice: boolean(),
          requires_partial_reprice: boolean(),
          event_type: String.t() | nil,
          reason: atom()
        }

  @spec classify_event(map(), map() | nil) :: routing_decision()
  def classify_event(event, _previous_state) when is_map(event) do
    event_type = normalize_event_type(event)

    case event_type do
      "wicket" ->
        decision(:critical, false, true, false, event_type, :wicket)

      "rain_break" ->
        decision(:critical, true, true, false, event_type, :rain_break)

      "rain_delay" ->
        decision(:critical, true, true, false, event_type, :rain_delay)

      "third_umpire_review" ->
        decision(:critical, true, true, false, event_type, :third_umpire_review)

      "innings_break" ->
        decision(:critical, true, true, false, event_type, :innings_break)

      "super_over" ->
        decision(:critical, true, true, false, event_type, :super_over)

      "match_end" ->
        decision(:critical, true, true, false, event_type, :match_end)

      "over_complete" ->
        decision(:moderate, false, true, false, event_type, :over_complete)

      "boundary" ->
        decision(:moderate, false, true, false, event_type, :boundary)

      "six" ->
        decision(:moderate, false, true, false, event_type, :boundary)

      "four" ->
        decision(:moderate, false, true, false, event_type, :boundary)

      "wide" ->
        decision(:minor, false, false, true, event_type, :wide)

      "no_ball" ->
        decision(:minor, false, false, true, event_type, :no_ball)

      "single" ->
        decision(:minor, false, false, true, event_type, :single)

      "double" ->
        decision(:minor, false, false, true, event_type, :double)

      "triple" ->
        decision(:minor, false, false, true, event_type, :triple)

      "dot" ->
        decision(:minor, false, false, true, event_type, :dot_ball)

      _ ->
        decision(:minor, false, false, true, event_type, :generic_update)
    end
  end

  @spec normalize_event_type(map()) :: String.t()
  def normalize_event_type(event) when is_map(event) do
    raw =
      event["event_type"] || event[:event_type] || event["type"] || event[:type] ||
        event["result"] || event[:result] || event["outcome"] || event[:outcome] || ""

    normalized =
      raw
      |> to_string()
      |> String.downcase()
      |> String.trim()

    cond do
      normalized in ["wicket", "out", "dismissal"] ->
        "wicket"

      normalized in ["rain", "rain_break", "interruption", "weather_delay"] ->
        "rain_break"

      normalized in ["rain_delay", "weather_delay_long", "delay"] ->
        "rain_delay"

      normalized in ["third_umpire_review", "review", "umpire_review", "drs"] ->
        "third_umpire_review"

      normalized in ["innings_break", "innings end", "end_of_innings"] ->
        "innings_break"

      normalized in ["super_over", "super over"] ->
        "super_over"

      normalized in ["match_end", "match_endded", "completed", "finished"] ->
        "match_end"

      normalized in ["boundary", "four", "six"] ->
        normalized

      normalized in ["single", "double", "triple", "dot", "dot_ball", "wide", "no_ball"] ->
        normalized

      over_complete?(event) ->
        "over_complete"

      normalized in ["wide", "no_ball"] ->
        normalized

      boundary_runs?(event, 6) ->
        "six"

      boundary_runs?(event, 4) ->
        "four"

      wicket_flag?(event) ->
        "wicket"

      run_value(event) == 0 ->
        "dot"

      run_value(event) == 1 ->
        "single"

      run_value(event) == 2 ->
        "double"

      run_value(event) == 3 ->
        "triple"

      true ->
        "ball"
    end
  end

  @spec normalize_match_status(map()) :: atom() | nil
  def normalize_match_status(event) when is_map(event) do
    case normalize_status_key(event["status"] || event[:status] || "") do
      status
      when status in [
             "live",
             "in progress",
             "in_progress",
             "1st innings",
             "2nd innings",
             "innings break",
             "innings_break",
             "super over",
             "super_over",
             "stumps"
           ] ->
        :live

      status when status in ["closed", "completed", "finished", "result", "match end"] ->
        :closed

      "settled" ->
        :settled

      status when status in ["cancelled", "abandoned", "no result"] ->
        :cancelled

      status when status in ["upcoming", "scheduled", "not started", "not_started", "ns"] ->
        :upcoming

      _ ->
        nil
    end
  end

  @spec next_momentum(float(), routing_decision()) :: float()
  def next_momentum(current_value, decision) when is_float(current_value) do
    delta =
      case decision.reason do
        :wicket -> -1.25
        :rain_break -> -0.5
        :rain_delay -> -0.65
        :third_umpire_review -> -0.35
        :innings_break -> 0.0
        :super_over -> 0.45
        :boundary -> 0.55
        :single -> 0.08
        :double -> 0.15
        :triple -> 0.2
        :dot_ball -> -0.08
        _ -> 0.02
      end

    current_value
    |> Kernel.+(delta)
    |> min(10.0)
    |> max(-10.0)
  end

  @spec next_market_state(map(), routing_decision(), map()) :: map()
  def next_market_state(current_state, decision, event)
      when is_map(current_state) and is_map(event) do
    currently_suspended? =
      current_state["suspended"] == true or current_state[:suspended] == true

    base =
      current_state
      |> Map.put("last_event_type", decision.event_type)
      |> Map.put("last_event_seq", event[:event_seq] || event["event_seq"])
      |> Map.put("last_event_reason", Atom.to_string(decision.reason))
      |> Map.put(
        "last_event_at",
        DateTime.utc_now() |> DateTime.truncate(:second) |> DateTime.to_iso8601()
      )

    if decision.requires_suspend do
      base
      |> Map.put("suspended", true)
      |> Map.put("suspension_reason", suspension_reason(decision))
    else
      if currently_suspended? do
        base
        |> Map.put("suspended", true)
        |> Map.put(
          "suspension_reason",
          current_state["suspension_reason"] || current_state[:suspension_reason]
        )
      else
        base
        |> Map.put("suspended", false)
        |> Map.delete("suspension_reason")
      end
    end
  end

  def next_market_state(_current_state, decision, event),
    do: next_market_state(%{}, decision, event)

  @spec suspension_reason(routing_decision()) :: String.t()
  def suspension_reason(decision), do: Atom.to_string(decision.reason)

  @spec should_reprice?(routing_decision()) :: boolean()
  def should_reprice?(decision) when is_map(decision) do
    decision.requires_full_reprice or decision.requires_partial_reprice
  end

  @spec broadcast_transition(Match.t(), MatchLiveEvent.t(), routing_decision()) :: :ok
  def broadcast_transition(%Match{} = match, %MatchLiveEvent{} = live_event, decision) do
    payload = %{
      event_id: live_event.id,
      provider_event_id: live_event.provider_event_id,
      event_seq: live_event.event_seq,
      state_version: live_event.state_version,
      event_type: live_event.event_type,
      severity: live_event.severity,
      reason: Atom.to_string(decision.reason)
    }

    MatchChannel.broadcast_match_state_updated(match, payload)

    if full_board_suspend?(decision) do
      MatchChannel.broadcast_market_suspended(match, suspension_reason(decision))
    end

    cond do
      match.status == :live and not MarketManager.published_platform_odds_exist?(match.id) ->
        _ =
          MarketManager.keep_match_suspended(match.id, "live_bootstrap", %{
            "source" => "cricket_router",
            "event_seq" => live_event.event_seq,
            "event_type" => live_event.event_type,
            "reason" => "bootstrap_missing_board"
          })

        LangGraphClient.force_reprice_async(match,
          reason: :bootstrap_missing_board,
          event_type: live_event.event_type || "bootstrap_missing_board",
          suspend_reason: "live_bootstrap",
          trigger: "bootstrap_missing_board"
        )

      should_reprice?(decision) ->
        CricketRepriceQueue.enqueue(match, live_event, decision)

      true ->
        :ok
    end

    :ok
  end

  defp decision(
         severity,
         requires_suspend,
         requires_full_reprice,
         requires_partial_reprice,
         event_type,
         reason
       ) do
    %{
      severity: severity,
      requires_suspend: requires_suspend,
      requires_full_reprice: requires_full_reprice,
      requires_partial_reprice: requires_partial_reprice,
      event_type: event_type,
      reason: reason
    }
  end

  defp full_board_suspend?(decision) when is_map(decision) do
    decision.requires_suspend == true and
      decision.reason in [
        :rain_break,
        :rain_delay,
        :third_umpire_review,
        :innings_break,
        :super_over,
        :match_end
      ]
  end

  defp boundary_runs?(event, target), do: run_value(event) == target

  defp over_complete?(event) do
    values = [
      event["ball_in_over"],
      event[:ball_in_over],
      event["ball"],
      event[:ball],
      get_in(event, ["ball", "number"])
    ]

    Enum.any?(values, fn
      value when is_integer(value) ->
        value >= 6

      value when is_binary(value) ->
        case Integer.parse(String.trim(value)) do
          {parsed, _} -> parsed >= 6
          _ -> false
        end

      _ ->
        false
    end)
  end

  defp wicket_flag?(event) do
    values = [event["is_wicket"], event[:is_wicket], event["wicket"], event[:wicket]]
    Enum.any?(values, &(&1 in [true, "true", 1, "1"]))
  end

  defp run_value(event) do
    Enum.find_value(
      [
        event["runs"],
        event[:runs],
        event["runs_scored"],
        event[:runs_scored],
        get_in(event, ["ball", "runs"])
      ],
      0,
      fn
        value when is_integer(value) ->
          value

        value when is_binary(value) ->
          case Integer.parse(String.trim(value)) do
            {parsed, _} -> parsed
            _ -> nil
          end

        _ ->
          nil
      end
    )
  end

  defp normalize_status_key(status) when is_binary(status) do
    status
    |> String.downcase()
    |> String.trim()
    |> String.replace(~r/[\s_-]+/, " ")
  end

  defp normalize_status_key(status), do: status |> to_string() |> normalize_status_key()
end
