defmodule Back.Live.CricketRepriceExecutor do
  @moduledoc false

  require Logger

  alias Back.Betting.Match
  alias Back.Live.LangGraphClient
  alias Back.State.MarketManager
  alias Back.State.MatchLiveEvent

  @spec execute(Match.t(), MatchLiveEvent.t(), map()) :: :ok | {:error, :unrecoverable_anomaly}
  def execute(%Match{} = match, %MatchLiveEvent{} = live_event, decision) when is_map(decision) do
    case LangGraphClient.calculate_odds(match, live_event, decision) do
      {:ok, response} ->
        case MarketManager.apply_engine_response(match.id, response) do
          {:ok, _result} ->
            :ok

          {:error, reason} ->
            Logger.warning("LangGraph apply failed for match #{match.id}: #{inspect(reason)}")
            :ok
        end

      {:error, :unrecoverable_anomaly} ->
        _ =
          MarketManager.keep_match_suspended(match.id, "unrecoverable_anomaly", %{
            "engine_error" => "self_heal_exhausted",
            "trigger" => Atom.to_string(decision.reason),
            "event_type" => live_event.event_type,
            "event_seq" => live_event.event_seq,
            "state_version" => live_event.state_version
          })

        Logger.error(
          "[SELF_HEAL] unrecoverable anomaly for match #{match.id} event_seq=#{live_event.event_seq} state_version=#{live_event.state_version}"
        )

        {:error, :unrecoverable_anomaly}

      {:error, reason} ->
        preserve_existing_board_or_suspend(match, live_event, decision, reason)
        :ok
    end
  end

  defp preserve_existing_board_or_suspend(
         %Match{} = match,
         %MatchLiveEvent{} = live_event,
         decision,
         reason
       ) do
    meta = %{
      "engine_error" => inspect(reason),
      "trigger" => Atom.to_string(decision.reason),
      "event_type" => live_event.event_type,
      "event_seq" => live_event.event_seq,
      "state_version" => live_event.state_version
    }

    if MarketManager.published_platform_odds_exist?(match.id) do
      _ = MarketManager.resume_match(match.id, Map.put(meta, "board_preserved", true))

      Logger.warning(
        "LangGraph reprice failed for match #{match.id}, preserving existing published board: #{inspect(reason)}"
      )
    else
      _ = MarketManager.keep_match_suspended(match.id, failure_reason(reason), meta)
      Logger.warning("LangGraph reprice failed for match #{match.id}: #{inspect(reason)}")
    end
  end

  defp failure_reason(:timeout), do: "ai_engine_unavailable"
  defp failure_reason(:circuit_open), do: "ai_engine_unavailable"
  defp failure_reason(:empty_markets), do: "ai_engine_unavailable"
  defp failure_reason({:http_error, _status, _body}), do: "ai_engine_unavailable"
  defp failure_reason(_), do: "ai_engine_unavailable"
end
