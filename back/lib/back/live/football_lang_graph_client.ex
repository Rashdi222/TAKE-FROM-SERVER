defmodule Back.Live.FootballLangGraphClient do
  @moduledoc false

  require Logger

  alias Back.Betting.Match
  alias Back.Live.LangGraphClient
  alias Back.Providers
  alias Back.Providers.CompetitionFeed
  alias Back.Repo
  alias Back.State.MarketManager
  alias Back.State.MatchLiveEvent
  alias BackWeb.JsonHelpers

  @variance_alert_threshold 0.18

  @spec reprice_async(Match.t(), MatchLiveEvent.t(), map()) :: :ok
  def reprice_async(%Match{} = match, %MatchLiveEvent{} = live_event, decision)
      when is_map(decision) do
    Task.Supervisor.start_child(Back.TaskSupervisor, fn ->
      case calculate_or_publish(match, live_event, decision) do
        {:ok, {:engine, response}} ->
          _ = MarketManager.apply_engine_response(match.id, response)
          :ok

        {:ok, {:provider_reference, provider_name, rows, meta}} ->
          case MarketManager.apply_provider_reference_board(match.id, provider_name, rows, meta) do
            {:ok, _} ->
              :ok

            {:error, :no_active_provider_reference_rows} ->
              Logger.warning(
                "Football provider reference returned only suspended rows for match #{match.id}; preserving existing board"
              )

              _ =
                MarketManager.keep_match_suspended(match.id, "provider_reference_unavailable", %{
                  source: "football_langgraph",
                  trigger: "provider_reference_publish",
                  reason: "no_active_provider_reference_rows"
                })

              :ok

            {:error, :no_supported_provider_reference_rows} ->
              Logger.warning(
                "Football provider reference returned no supported rows for match #{match.id}; preserving existing board"
              )

              _ =
                MarketManager.keep_match_suspended(match.id, "provider_reference_unavailable", %{
                  source: "football_langgraph",
                  trigger: "provider_reference_publish",
                  reason: "no_supported_provider_reference_rows"
                })

              :ok

            {:error, reason} ->
              Logger.warning(
                "Football provider reference publish failed for match #{match.id}: #{inspect(reason)}"
              )

              _ =
                MarketManager.keep_match_suspended(match.id, "provider_reference_unavailable", %{
                  source: "football_langgraph",
                  trigger: "provider_reference_publish",
                  reason: inspect(reason)
                })

              :ok
          end

        {:error, :provider_only_mode_no_reference_rows} ->
          Logger.warning(
            "Football provider-only mode had no reference rows for match #{match.id}"
          )

          _ =
            MarketManager.keep_match_suspended(match.id, "provider_reference_unavailable", %{
              source: "football_langgraph",
              trigger: "provider_only_reprice",
              reason: "provider_only_mode_no_reference_rows"
            })

          :ok

        {:error, {:provider_reference_unavailable, reason}} ->
          Logger.warning(
            "Football provider reference unavailable for match #{match.id}: #{inspect(reason)}"
          )

          _ =
            MarketManager.keep_match_suspended(match.id, "provider_reference_unavailable", %{
              source: "football_langgraph",
              trigger: "provider_reference_fetch",
              reason: inspect(reason)
            })

          :ok

        {:error, reason} ->
          Logger.warning("Football reprice failed for match #{match.id}: #{inspect(reason)}")
          :ok
      end
    end)

    :ok
  end

  @spec force_reprice_async(Match.t(), keyword()) :: :ok
  def force_reprice_async(%Match{} = match, opts \\ []) do
    match =
      case Keyword.get(opts, :suspend_reason) do
        reason when is_binary(reason) ->
          case MarketManager.suspend_match(match.id, reason, %{
                 source: Keyword.get(opts, :source, "football_langgraph"),
                 trigger: Keyword.get(opts, :trigger, "manual")
               }) do
            {:ok, updated_match} -> updated_match
            _ -> match
          end

        _ ->
          match
      end

    synthetic_event = %MatchLiveEvent{
      match_id: match.id,
      event_seq: match.live_event_seq,
      state_version: match.live_state_version,
      event_type: Keyword.get(opts, :event_type, "football_manual_reprice"),
      severity: "critical",
      event_time: match.last_live_event_at || DateTime.utc_now() |> DateTime.truncate(:second)
    }

    decision = %{
      severity: :critical,
      requires_suspend: true,
      requires_full_reprice: true,
      requires_partial_reprice: false,
      event_type: synthetic_event.event_type,
      reason: Keyword.get(opts, :reason, :admin_force_reprice)
    }

    reprice_async(match, synthetic_event, decision)
  end

  @spec calculate_or_publish(Match.t(), MatchLiveEvent.t(), map()) ::
          {:ok, {:engine, map()} | {:provider_reference, String.t(), [map()], map()}}
          | {:error, term()}
  def calculate_or_publish(%Match{} = match, %MatchLiveEvent{} = live_event, decision)
      when is_map(decision) do
    mode = pricing_mode(match)

    with {:ok, provider_reference} <- maybe_fetch_provider_reference(match, mode) do
      case mode do
        "provider_only" ->
          rows = provider_reference[:rows] || []

          if rows == [] do
            {:error, :provider_only_mode_no_reference_rows}
          else
            {:ok,
             {:provider_reference, provider_reference.provider, rows,
              %{
                "strategy_mode" => mode,
                "provider_reference_count" => length(rows),
                "variance_alerts" => []
              }}}
          end

        "ai_only" ->
          request_engine(match, live_event, decision, mode, [])

        "hybrid" ->
          request_engine(match, live_event, decision, mode, provider_reference[:rows] || [])

        _ ->
          request_engine(match, live_event, decision, "ai_only", [])
      end
    end
  end

  defp request_engine(match, live_event, decision, mode, provider_reference_rows) do
    url = Application.get_env(:back, :ai_engine_url, "http://127.0.0.1:8001")
    timeout_ms = Application.get_env(:back, :ai_engine_timeout_ms, 2_000)

    payload =
      %{
        match_id: match.id,
        state_version: match.live_state_version,
        trigger: %{
          event_type: live_event.event_type,
          severity: live_event.severity,
          reason: to_string(decision.reason)
        },
        strategy_mode: mode,
        match_state: build_match_state(match),
        current_odds: build_current_odds(match),
        provider_reference_odds:
          Enum.map(provider_reference_rows, &provider_reference_payload(&1, match))
      }
      |> JsonHelpers.json_safe()

    case Req.post(
           url <> "/calculate_football_odds",
           json: payload,
           receive_timeout: timeout_ms,
           connect_options: [timeout: timeout_ms]
         ) do
      {:ok, %{status: 200, body: body}} when is_map(body) ->
        with {:ok, validated} <-
               validate_engine_response(body, match.id, match.live_state_version) do
          {:ok, {:engine, attach_variance_alerts(validated, provider_reference_rows, match)}}
        end

      {:ok, %{status: status, body: body}} ->
        {:error, {:http_error, status, body}}

      {:error, %Req.TransportError{reason: :timeout}} ->
        {:error, :timeout}

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp build_match_state(%Match{} = match) do
    %{
      match_id: match.id,
      provider: match.provider,
      sport: to_string(match.sport),
      state_version: match.live_state_version,
      team1: match.team1,
      team2: match.team2,
      score: match.score || %{},
      raw_data: match.raw_data || %{},
      market_state: match.market_state || %{},
      elapsed_minute: match.elapsed_minute || extract_elapsed_minute(match),
      stoppage_minute: match.stoppage_minute || 0,
      home_score: match.home_score || 0,
      away_score: match.away_score || 0,
      red_cards_home: match.home_red_cards || extract_red_cards(match, "home"),
      red_cards_away: match.away_red_cards || extract_red_cards(match, "away"),
      home_corners: match.home_corners || 0,
      away_corners: match.away_corners || 0,
      home_shots_on_target: match.home_shots_on_target || 0,
      away_shots_on_target: match.away_shots_on_target || 0,
      tempo_index: match.tempo_index || extract_tempo_index(match)
    }
  end

  defp build_current_odds(%Match{} = match) do
    Back.Betting.list_odds_by_match(match.id,
      active_only: true,
      visibility_status: :published,
      source_type: "platform"
    )
    |> Enum.map(fn odds ->
      market_key = odds.source_market_key || to_string(odds.bet_type)

      %{
        market_key: market_key,
        selection_key:
          normalize_selection_key(market_key, odds.outcome, match.team1, match.team2),
        label: odds.outcome,
        price: LangGraphClient.decimal_string(odds.odds_value)
      }
    end)
  end

  defp maybe_fetch_provider_reference(match, mode) do
    case mode do
      "ai_only" ->
        {:ok, %{provider: match.provider || "provider", rows: []}}

      "provider_only" ->
        provider_reference(match)

      "hybrid" ->
        provider_reference(match)

      _ ->
        {:ok, %{provider: match.provider || "provider", rows: []}}
    end
  end

  defp provider_reference(match) do
    case Providers.fetch_match_provider_odds(match.id) do
      {:ok, %{provider: provider, data: rows}} ->
        {:ok, %{provider: provider, rows: rows}}

      {:error, reason} ->
        {:error, {:provider_reference_unavailable, reason}}
    end
  end

  defp pricing_mode(%Match{} = match) do
    force_provider_only? =
      Application.get_env(:back, :football_provider_reference_only, true)

    if force_provider_only? do
      "provider_only"
    else
      football_ai_enabled? = Application.get_env(:back, :football_ai_engine_enabled, false)

      if not football_ai_enabled? do
        "provider_only"
      else
        feed =
          case match.competition_feed_id do
            nil -> nil
            id -> Repo.get(CompetitionFeed, id)
          end

        cond do
          feed && is_map(feed.config) &&
              Map.get(feed.config, "football_pricing_mode") in [
                "provider_only",
                "ai_only",
                "hybrid"
              ] ->
            Map.get(feed.config, "football_pricing_mode")

          feed && feed.import_provider_odds && feed.generate_platform_odds ->
            "hybrid"

          feed && feed.import_provider_odds ->
            "provider_only"

          true ->
            "ai_only"
        end
      end
    end
  end

  defp provider_reference_payload(row, match) do
    market_key = row["source_market_key"] || row["bet_type"] || "market"
    label = row["outcome"] || row["label"] || row["selection_key"] || "Selection"

    %{
      market_key: market_key,
      selection_key: normalize_selection_key(market_key, label, match.team1, match.team2),
      label: label,
      price: row["odds_value"],
      bookmaker: get_in(row, ["provider_snapshot", "bookmaker"])
    }
  end

  defp validate_engine_response(body, match_id, state_version) do
    cond do
      body["match_id"] != match_id -> {:error, :match_id_mismatch}
      body["state_version"] != state_version -> {:error, :stale_match_state}
      not is_list(body["markets"]) -> {:error, :invalid_markets}
      true -> {:ok, body}
    end
  end

  defp attach_variance_alerts(response, provider_reference_rows, %Match{} = match) do
    alerts =
      Enum.flat_map(response["markets"] || [], fn market ->
        market_key = market["market_key"]
        selection_key = market["selection_key"]

        reference =
          Enum.find(provider_reference_rows, fn row ->
            reference_market_key = row["source_market_key"] || row["bet_type"]

            reference_selection_key =
              normalize_selection_key(
                reference_market_key,
                row["outcome"] || row["selection_key"] || row["label"],
                match.team1,
                match.team2
              )

            reference_market_key == market_key and reference_selection_key == selection_key
          end)

        case reference do
          nil ->
            []

          row ->
            engine_probability = implied_probability(market["price"])
            provider_probability = implied_probability(row["odds_value"])
            delta = abs(engine_probability - provider_probability)

            if delta > @variance_alert_threshold do
              [
                %{
                  "market_key" => market_key,
                  "selection_key" => selection_key,
                  "engine_price" => market["price"],
                  "provider_price" => row["odds_value"],
                  "probability_delta" => Float.round(delta, 4)
                }
              ]
            else
              []
            end
        end
      end)

    Map.put(response, "variance_alerts", alerts)
  end

  defp extract_elapsed_minute(%Match{} = match) do
    get_in(match.raw_data || %{}, ["fixture", "status", "elapsed"]) ||
      get_in(match.raw_data || %{}, ["elapsed"]) ||
      0
  end

  defp extract_red_cards(%Match{} = match, side) do
    get_in(match.raw_data || %{}, ["cards", side, "red"]) ||
      get_in(match.raw_data || %{}, ["statistics", side, "red_cards"]) ||
      0
  end

  defp extract_tempo_index(%Match{} = match) do
    get_in(match.market_state || %{}, ["tempo_index"]) ||
      get_in(match.raw_data || %{}, ["tempo_index"]) ||
      0.0
  end

  defp normalize_selection_key("match_winner", value, team1, team2) when is_binary(value) do
    normalized = String.downcase(String.trim(value))

    cond do
      normalized in ["home", "team1", String.downcase(team1 || "")] -> "team1"
      normalized in ["away", "team2", String.downcase(team2 || "")] -> "team2"
      normalized in ["draw", "x"] -> "draw"
      true -> value
    end
  end

  defp normalize_selection_key("btts", value, _team1, _team2) when is_binary(value) do
    normalized = String.downcase(String.trim(value))

    cond do
      normalized in ["yes", "y"] -> "yes"
      normalized in ["no", "n"] -> "no"
      true -> value
    end
  end

  defp normalize_selection_key(_market_key, value, _team1, _team2), do: value || "selection"

  defp implied_probability(value) do
    decimal = Decimal.new(LangGraphClient.decimal_string(value) || "1.01")

    safe =
      if Decimal.compare(decimal, Decimal.new("1.01")) == :lt,
        do: Decimal.new("1.01"),
        else: decimal

    safe |> then(&Decimal.div(Decimal.new("1"), &1)) |> Decimal.to_float()
  end
end
