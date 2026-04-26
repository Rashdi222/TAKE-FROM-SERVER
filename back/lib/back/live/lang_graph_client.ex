defmodule Back.Live.LangGraphClient do
  @moduledoc false

  require Logger

  alias Back.Betting.Match
  alias Back.Live.CricketExposureBook
  alias Back.Live.CricketRepriceQueue
  alias Back.Live.CricketRuntimeConfig
  alias Back.Live.FootballLangGraphClient
  alias Back.Live.SimulationScenario
  alias Back.State.MatchLiveEvent
  alias Back.State.MarketManager

  @breaker_table :langgraph_client_breaker
  @health_table :langgraph_client_health
  @failure_threshold 3
  @cooloff_ms 5_000
  @health_cache_ms 2_000
  @self_heal_max_attempts 3

  @type engine_market :: map()

  @type engine_response :: map()

  @type source_refresh_response :: map()
  @type observability_response :: map()

  @spec decimal_string(term()) :: String.t() | nil
  def decimal_string(value), do: decimal_to_string(value)

  @spec reprice_async(Match.t(), MatchLiveEvent.t(), map()) :: :ok
  def reprice_async(%Match{sport: :football} = match, %MatchLiveEvent{} = live_event, decision)
      when is_map(decision) do
    FootballLangGraphClient.reprice_async(match, live_event, decision)
  end

  def reprice_async(%Match{} = match, %MatchLiveEvent{} = live_event, decision)
      when is_map(decision) do
    CricketRepriceQueue.enqueue(match, live_event, decision)
    :ok
  end

  @spec force_reprice_async(Match.t(), keyword()) :: :ok
  def force_reprice_async(match, opts \\ [])

  def force_reprice_async(%Match{sport: :football} = match, opts) when is_list(opts) do
    FootballLangGraphClient.force_reprice_async(match, opts)
  end

  def force_reprice_async(%Match{} = match, opts) do
    match =
      case Keyword.get(opts, :suspend_reason) do
        reason when is_binary(reason) ->
          should_suspend_board =
            Keyword.get(opts, :force_suspend, false) or
              not MarketManager.published_platform_odds_exist?(match.id)

          if should_suspend_board do
            case MarketManager.suspend_match(match.id, reason, %{
                   source: Keyword.get(opts, :source, "langgraph"),
                   trigger: Keyword.get(opts, :trigger, "manual")
                 }) do
              {:ok, updated_match} -> updated_match
              _ -> match
            end
          else
            match
          end

        _ ->
          match
      end

    synthetic_event = %MatchLiveEvent{
      match_id: match.id,
      event_seq:
        if(simulation_mode?(opts),
          do: System.unique_integer([:positive]),
          else: match.live_event_seq
        ),
      state_version: match.live_state_version,
      event_type: Keyword.get(opts, :event_type, match.last_ball_event_type || "manual_reprice"),
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

    CricketRepriceQueue.enqueue(match, synthetic_event, decision)
  end

  @spec calculate_odds(Match.t(), MatchLiveEvent.t(), map()) ::
          {:ok, engine_response()} | {:error, term()}
  def calculate_odds(%Match{} = match, %MatchLiveEvent{} = live_event, decision)
      when is_map(decision) do
    if circuit_open?() do
      {:error, :circuit_open}
    else
      with :ok <- ensure_engine_ready(decision) do
        do_calculate_odds(match, live_event, decision)
      end
    end
  end

  @spec source_refresh_policy(Match.t(), map()) ::
          {:ok, source_refresh_response()} | {:error, term()}
  def source_refresh_policy(%Match{} = match, current_policy) when is_map(current_policy) do
    url = Application.get_env(:back, :ai_engine_url, "http://127.0.0.1:8001")
    runtime_config = CricketRuntimeConfig.resolve()
    timeout_ms = runtime_config.request_timeout_ms

    payload = %{
      match_id: match.id,
      state_version: match.live_state_version,
      event_seq: match.live_event_seq,
      trigger: %{
        event_type: match.last_ball_event_type || "policy_review",
        severity: if(match.status == :live, do: "moderate", else: "minor"),
        reason: "operator_source_refresh_policy"
      },
      match_state:
        build_match_state(match, %MatchLiveEvent{
          match_id: match.id,
          event_seq: match.live_event_seq,
          state_version: match.live_state_version,
          event_type: match.last_ball_event_type || "policy_review",
          severity: if(match.status == :live, do: "moderate", else: "minor"),
          event_time: match.last_live_event_at || DateTime.utc_now() |> DateTime.truncate(:second)
        }),
      runtime_config: runtime_config_payload(runtime_config),
      current_policy: current_policy,
      risk_flags: current_policy["risk_flags"] || current_policy[:risk_flags] || []
    }

    case Req.post(
           url <> "/source_refresh_policy",
           json: payload,
           receive_timeout: timeout_ms,
           connect_options: [timeout: timeout_ms]
         ) do
      {:ok, %{status: 200, body: body}} when is_map(body) ->
        {:ok, body}

      {:ok, %{status: status, body: body}} ->
        {:error, {:http_error, status, body}}

      {:error, %Req.TransportError{reason: :timeout}} ->
        {:error, :timeout}

      {:error, reason} ->
        {:error, reason}
    end
  end

  @spec cricket_observability(String.t() | nil) ::
          {:ok, observability_response()} | {:error, term()}
  def cricket_observability(match_id \\ nil)

  def cricket_observability(match_id) when is_binary(match_id) do
    trimmed = String.trim(match_id)
    do_cricket_observability(if(trimmed == "", do: nil, else: trimmed))
  end

  def cricket_observability(_), do: do_cricket_observability(nil)

  defp do_cricket_observability(match_id) do
    url = Application.get_env(:back, :ai_engine_url, "http://127.0.0.1:8001")
    timeout_ms = Application.get_env(:back, :ai_engine_timeout_ms, 2_000)

    endpoint =
      case match_id do
        nil -> "/cricket/observability"
        id -> "/cricket/observability/" <> URI.encode(id)
      end

    case Req.get(
           url <> endpoint,
           receive_timeout: timeout_ms,
           connect_options: [timeout: timeout_ms]
         ) do
      {:ok, %{status: 200, body: body}} when is_map(body) ->
        {:ok, body}

      {:ok, %{status: status, body: body}} ->
        {:error, {:http_error, status, body}}

      {:error, %Req.TransportError{reason: :timeout}} ->
        {:error, :timeout}

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp do_calculate_odds(%Match{} = match, %MatchLiveEvent{} = live_event, decision) do
    do_calculate_odds(match, live_event, decision, 0)
  end

  defp do_calculate_odds(%Match{} = match, %MatchLiveEvent{} = live_event, decision, attempt) do
    url = Application.get_env(:back, :ai_engine_url, "http://127.0.0.1:8001")
    runtime_config = CricketRuntimeConfig.resolve()
    timeout_ms = runtime_config.request_timeout_ms

    payload =
      %{
        match_id: match.id,
        event_seq: live_event.event_seq,
        state_version: match.live_state_version,
        trigger: %{
          event_type: live_event.event_type,
          severity: live_event.severity,
          reason: Atom.to_string(decision.reason)
        },
        match_state: build_match_state(match, live_event),
        current_odds: build_current_odds(match.id),
        liability_book: CricketExposureBook.build(match.id),
        runtime_config: runtime_config_payload(runtime_config)
      }
      |> maybe_apply_simulation_overlay(decision)

    result =
      case Req.post(
             url <> "/calculate_odds",
             json: payload,
             receive_timeout: timeout_ms,
             connect_options: [timeout: timeout_ms]
           ) do
        {:ok, %{status: 200, body: body}} when is_map(body) ->
          validate_engine_response(body, match.id)

        {:ok, %{status: status, body: body}} ->
          {:error, {:http_error, status, body}}

        {:error, %Req.TransportError{reason: :timeout}} ->
          {:error, :timeout}

        {:error, reason} ->
          {:error, reason}
      end

    case result do
      {:retry, :reviewer_requested_retry} when live_event.event_type == "public_odds_recovery" ->
        Logger.warning(
          "[SELF_HEAL] skipping recursive retry for public recovery match #{match.id} event_seq=#{live_event.event_seq} state_version=#{live_event.state_version}"
        )

        {:error, :public_recovery_retry_rejected}

      {:retry, reason} when attempt < @self_heal_max_attempts ->
        Logger.warning(
          "[SELF_HEAL] retrying LangGraph payload for match #{match.id} attempt=#{attempt + 1} reason=#{inspect(reason)} event_seq=#{live_event.event_seq} state_version=#{live_event.state_version} event_type=#{inspect(live_event.event_type)}"
        )

        do_calculate_odds(match, live_event, decision, attempt + 1)

      {:retry, reason} ->
        Logger.error(
          "[SELF_HEAL] exhausted LangGraph retries for match #{match.id} reason=#{inspect(reason)} event_seq=#{live_event.event_seq} state_version=#{live_event.state_version} event_type=#{inspect(live_event.event_type)}"
        )

        register_failure(:unrecoverable_anomaly)
        mark_engine_unhealthy(:unrecoverable_anomaly)
        {:error, :unrecoverable_anomaly}

      {:ok, body} ->
        reset_breaker()
        mark_engine_healthy()
        {:ok, body}

      {:error, reason} ->
        register_failure(reason)
        mark_engine_unhealthy(reason)
        {:error, reason}
    end
  end

  defp ensure_engine_ready(decision) do
    if bootstrap_decision?(decision) do
      case cached_engine_health() do
        :healthy -> :ok
        :unhealthy -> probe_engine_health()
        :unknown -> probe_engine_health()
      end
    else
      :ok
    end
  end

  defp maybe_apply_simulation_overlay(payload, decision) do
    if simulation_mode?(decision) do
      scenario =
        decision
        |> Map.get(:simulation_scenario) || Map.get(decision, "simulation_scenario")

      case SimulationScenario.load_overlay(to_string(scenario)) do
        {:ok, overlay} ->
          Logger.info("[SIMULATION] applying scenario=#{scenario}")
          SimulationScenario.merge_overlay(payload, overlay)

        {:error, reason} ->
          Logger.error(
            "[SIMULATION] failed to load scenario=#{inspect(scenario)} reason=#{inspect(reason)}"
          )

          payload
      end
    else
      payload
    end
  end

  defp simulation_mode?(opts) when is_list(opts),
    do: Keyword.get(opts, :simulation_mode, false) == true

  defp simulation_mode?(opts) when is_map(opts),
    do: Map.get(opts, :simulation_mode) == true or Map.get(opts, "simulation_mode") == true

  defp simulation_mode?(_), do: false

  defp build_match_state(%Match{} = match, %MatchLiveEvent{} = live_event) do
    %{
      match_id: match.id,
      provider: match.provider,
      sport: match.sport |> to_string(),
      event_seq: live_event.event_seq,
      state_version: match.live_state_version,
      event_time: iso8601_or_nil(live_event.event_time),
      event_type: live_event.event_type,
      team1: match.team1,
      team2: match.team2,
      inning: match.current_innings,
      over: decimal_to_string(match.current_over),
      balls_remaining: balls_remaining_for_match(match),
      ball_in_over: match.current_ball_in_over,
      batting_team: match.batting_team,
      bowling_team: match.bowling_team,
      runs_total: match.runs_total,
      wickets_total: match.wickets_total,
      target_runs: match.target_runs,
      current_run_rate: decimal_to_string(match.current_run_rate),
      required_run_rate: decimal_to_string(match.required_run_rate),
      momentum_index: decimal_to_string(match.momentum_index),
      market_state: match.market_state || %{},
      score: match.score || %{},
      raw_data: match.raw_data || %{}
    }
  end

  defp balls_remaining_for_match(%Match{} = match) do
    over_number = decimal_to_float(match.current_over) || 0.0
    total_overs = total_overs_for_match(match)
    max(total_overs * 6 - overs_to_balls(over_number), 0)
  end

  defp total_overs_for_match(%Match{} = match) do
    format_hint =
      (get_in(match.raw_data || %{}, ["cricket_context", "format", "name"]) ||
         get_in(match.raw_data || %{}, ["cricket_context", "format"]) ||
         get_in(match.raw_data || %{}, ["format"]) ||
         "t20")
      |> to_string()
      |> String.trim()
      |> String.downcase()

    case format_hint do
      "odi" -> 50
      "one day" -> 50
      "test" -> 90
      _ -> 20
    end
  end

  defp overs_to_balls(over_number) when is_number(over_number) do
    whole = trunc(Float.floor(over_number))
    fractional = trunc(Float.round((over_number - whole) * 10))
    whole * 6 + max(0, min(5, fractional))
  end

  defp build_current_odds(match_id) do
    Back.Betting.list_odds_by_match(match_id,
      active_only: true,
      visibility_status: :published,
      source_type: "platform"
    )
    |> Enum.map(fn odds ->
      %{
        id: odds.id,
        bet_type: odds.bet_type,
        market_key: odds.source_market_key || to_string(odds.bet_type),
        selection_key: odds.outcome,
        label: odds.outcome,
        price: decimal_to_string(odds.odds_value),
        version_no: odds.version_no
      }
    end)
  end

  defp validate_engine_response(body, match_id) do
    markets = body["markets"]
    fancy_markets = body["fancy_markets"] || []
    state_version = body["state_version"]
    reviewer_decision = body["reviewer_decision"] || "approve"

    cond do
      body["match_id"] != match_id ->
        {:error, :match_id_mismatch}

      not is_integer(state_version) ->
        {:error, :invalid_state_version}

      reviewer_decision == "reject_and_keep_suspended" and not valid_market_list?(markets) ->
        {:retry, :invalid_markets}

      reviewer_decision == "approve" and not valid_market_list?(markets) ->
        {:retry, :invalid_markets}

      reviewer_decision == "approve" and markets == [] ->
        {:retry, :empty_markets}

      not valid_market_list?(fancy_markets) ->
        {:retry, :invalid_fancy_markets}

      not valid_optional_number?(body["fair_probability"]) ->
        {:retry, :invalid_fair_probability}

      not valid_optional_number?(body["display_probability"]) ->
        {:retry, :invalid_display_probability}

      not valid_optional_number?(body["shading_magnitude"]) ->
        {:retry, :invalid_shading_magnitude}

      not valid_optional_boolean?(body["volatility_mode_active"]) ->
        {:retry, :invalid_volatility_mode_active}

      not valid_optional_boolean?(body["elasticity_applied"]) ->
        {:retry, :invalid_elasticity_applied}

      not valid_optional_string?(body["elasticity_reason"]) ->
        {:retry, :invalid_elasticity_reason}

      not valid_optional_string_list?(body["active_playbooks"]) ->
        {:retry, :invalid_active_playbooks}

      not valid_optional_map?(body["bookmaker_summary"]) ->
        {:retry, :invalid_bookmaker_summary}

      not valid_optional_map?(body["fancy_summary"]) ->
        {:retry, :invalid_fancy_summary}

      not valid_optional_integer?(body["bookmaker_node_latency_ms"]) ->
        {:retry, :invalid_bookmaker_node_latency_ms}

      reviewer_decision == "reject_and_retry" ->
        {:retry, :reviewer_requested_retry}

      true ->
        {:ok, body}
    end
  end

  defp valid_optional_number?(nil), do: true
  defp valid_optional_number?(value) when is_integer(value) or is_float(value), do: true
  defp valid_optional_number?(_), do: false

  defp valid_optional_integer?(nil), do: true
  defp valid_optional_integer?(value) when is_integer(value), do: true
  defp valid_optional_integer?(_), do: false

  defp valid_optional_boolean?(nil), do: true
  defp valid_optional_boolean?(value) when is_boolean(value), do: true
  defp valid_optional_boolean?(_), do: false

  defp valid_optional_map?(nil), do: true
  defp valid_optional_map?(value) when is_map(value), do: true
  defp valid_optional_map?(_), do: false

  defp valid_optional_string_list?(nil), do: true

  defp valid_optional_string_list?(value) when is_list(value) do
    Enum.all?(value, &is_binary/1)
  end

  defp valid_optional_string_list?(_), do: false

  defp valid_market_list?(value) when is_list(value) do
    Enum.all?(value, &valid_market?/1)
  end

  defp valid_market_list?(_), do: false

  defp valid_market?(market) when is_map(market) do
    valid_optional_string?(market["market_key"]) and
      valid_optional_string?(market["selection_key"]) and
      valid_optional_string?(market["label"]) and
      valid_optional_number_or_string?(market["price"]) and
      valid_optional_map?(market["trace_meta"]) and
      valid_optional_string_list?(get_in(market, ["trace_meta", "active_fancy_playbooks"]))
  end

  defp valid_market?(_), do: false

  defp valid_optional_string?(nil), do: true
  defp valid_optional_string?(value) when is_binary(value), do: true
  defp valid_optional_string?(_), do: false

  defp valid_optional_number_or_string?(nil), do: true

  defp valid_optional_number_or_string?(value)
       when is_integer(value) or is_float(value) or is_binary(value), do: true

  defp valid_optional_number_or_string?(_), do: false

  defp bootstrap_decision?(decision) do
    reason = decision[:reason]

    reason in [
      :live_status_transition,
      :bootstrap_missing_board,
      :bootstrap_recovery,
      :live_activation
    ]
  end

  defp probe_engine_health do
    url = Application.get_env(:back, :ai_engine_url, "http://127.0.0.1:8001")

    case Req.get(url <> "/health", receive_timeout: 800, connect_options: [timeout: 800]) do
      {:ok, %{status: 200}} ->
        mark_engine_healthy()
        :ok

      {:ok, _} ->
        mark_engine_unhealthy(:healthcheck_failed)
        {:error, :ai_engine_unavailable}

      {:error, reason} ->
        mark_engine_unhealthy(reason)
        {:error, :ai_engine_unavailable}
    end
  end

  defp cached_engine_health do
    ensure_health_table!()

    case :ets.lookup(@health_table, :state) do
      [{:state, %{status: status, checked_at_ms: checked_at_ms}}]
      when is_integer(checked_at_ms) ->
        if now_ms() - checked_at_ms <= @health_cache_ms, do: status, else: :unknown

      _ ->
        :unknown
    end
  end

  defp mark_engine_healthy do
    ensure_health_table!()

    :ets.insert(
      @health_table,
      {:state, %{status: :healthy, checked_at_ms: now_ms(), last_reason: nil}}
    )

    :ok
  end

  defp mark_engine_unhealthy(reason) do
    ensure_health_table!()

    :ets.insert(
      @health_table,
      {:state, %{status: :unhealthy, checked_at_ms: now_ms(), last_reason: inspect(reason)}}
    )

    :ok
  end

  defp circuit_open? do
    ensure_breaker_table!()

    case :ets.lookup(@breaker_table, :state) do
      [{:state, %{open_until_ms: open_until_ms}}] when is_integer(open_until_ms) ->
        now_ms() < open_until_ms

      _ ->
        false
    end
  end

  defp register_failure(reason) do
    ensure_breaker_table!()

    current =
      case :ets.lookup(@breaker_table, :state) do
        [{:state, state}] -> state
        _ -> %{failures: 0, open_until_ms: 0, last_reason: nil}
      end

    failures = current.failures + 1

    next_state =
      if failures >= @failure_threshold do
        %{failures: failures, open_until_ms: now_ms() + @cooloff_ms, last_reason: inspect(reason)}
      else
        %{current | failures: failures, last_reason: inspect(reason)}
      end

    :ets.insert(@breaker_table, {:state, next_state})
    :ok
  end

  defp reset_breaker do
    ensure_breaker_table!()
    :ets.insert(@breaker_table, {:state, %{failures: 0, open_until_ms: 0, last_reason: nil}})
    :ok
  end

  defp ensure_breaker_table! do
    case :ets.whereis(@breaker_table) do
      :undefined ->
        :ets.new(@breaker_table, [
          :named_table,
          :public,
          :set,
          read_concurrency: true,
          write_concurrency: true
        ])

        :ok

      _tid ->
        :ok
    end
  rescue
    ArgumentError -> :ok
  end

  defp ensure_health_table! do
    case :ets.whereis(@health_table) do
      :undefined ->
        :ets.new(@health_table, [
          :named_table,
          :public,
          :set,
          read_concurrency: true,
          write_concurrency: true
        ])

        :ok

      _tid ->
        :ok
    end
  rescue
    ArgumentError -> :ok
  end

  defp now_ms, do: System.monotonic_time(:millisecond)

  defp decimal_to_string(nil), do: nil
  defp decimal_to_string(%Decimal{} = value), do: Decimal.to_string(value, :normal)
  defp decimal_to_string(value) when is_integer(value), do: Integer.to_string(value)

  defp decimal_to_string(value) when is_float(value),
    do: :erlang.float_to_binary(value, decimals: 6)

  defp decimal_to_string(value), do: to_string(value)

  defp decimal_to_float(nil), do: nil
  defp decimal_to_float(%Decimal{} = value), do: Decimal.to_float(value)
  defp decimal_to_float(value) when is_integer(value), do: value * 1.0
  defp decimal_to_float(value) when is_float(value), do: value

  defp decimal_to_float(value) when is_binary(value) do
    case Float.parse(String.trim(value)) do
      {parsed, _} -> parsed
      :error -> nil
    end
  end

  defp decimal_to_float(_), do: nil

  defp iso8601_or_nil(nil), do: nil
  defp iso8601_or_nil(%DateTime{} = value), do: DateTime.to_iso8601(value)
  defp iso8601_or_nil(value), do: to_string(value)

  defp runtime_config_payload(runtime_config) do
    %{
      provider: runtime_config.provider,
      api_key: runtime_config.api_key,
      api_key_ref: runtime_config.api_key_ref,
      model: runtime_config.model,
      fallback_model: runtime_config.fallback_model,
      house_margin_profile: runtime_config.house_margin_profile,
      risk_profile: runtime_config.risk_profile,
      max_price_jump_threshold: runtime_config.max_price_jump_threshold,
      request_timeout_ms: runtime_config.request_timeout_ms,
      llm_enabled: runtime_config.llm_enabled,
      fallback_allowed: runtime_config.fallback_allowed,
      config_provider: runtime_config.config_provider
    }
  end
end
