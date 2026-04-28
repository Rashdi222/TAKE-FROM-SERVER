defmodule BackWeb.OddsController do
  use BackWeb, :controller
  import Ecto.Query

  action_fallback BackWeb.FallbackController

  alias Back.Betting
  alias Back.Betting.Bet
  alias Back.Betting.InPlaySnapshot
  alias Back.Betting.Match
  alias Back.Betting.Odds
  alias Back.AI.OddsGenerator
  alias Back.AI.OddsOrchestrator
  alias Back.AI.OddsRules
  alias Back.Auth.Guardian
  alias Back.Live.LangGraphClient
  alias Back.Live.SimulationScenario
  alias Back.Providers
  alias Back.Repo
  alias BackWeb.JsonHelpers
  alias BackWeb.MatchChannel

  @public_recovery_throttle_seconds 5

  # GET /api/matches/:match_id/odds
  def index(conn, %{"match_id" => match_id} = params) do
    current_user = Guardian.Plug.current_resource(conn)

    include_unpublished =
      params["include_unpublished"] == "true" and match?(%{role: :super_admin}, current_user)

    filters =
      []
      |> maybe_filter(:bet_type, params["bet_type"])
      |> maybe_filter(:active_only, default_public_active_only(params, include_unpublished))
      |> maybe_filter(:visibility_status, params["visibility_status"])
      |> maybe_filter(:source_type, params["source_type"])
      |> maybe_filter(:include_unpublished, include_unpublished)

    match = Betting.get_match!(match_id)
    maybe_hydrate_public_live_recovery(match, filters)
    odds = Betting.list_odds_by_match(match_id, filters)
    exposure_index = odds_exposure_index(Enum.map(odds, & &1.id))
    suspended_markets = normalize_suspended_markets(match.suspended_markets)

    json(conn, %{data: Enum.map(odds, &odds_json(&1, exposure_index, suspended_markets))})
  end

  defp maybe_hydrate_public_live_recovery(match, filters) do
    odds = Betting.list_odds_by_match(match.id, filters)

    cond do
      not (match.status == :live and match.sport in [:football, :cricket]) ->
        :ok

      odds == [] ->
        queue_async_public_live_recovery(match)

      published_odds_stale?(match.id) ->
        queue_async_public_live_recovery(match)

      true ->
        :ok
    end
  end

  defp default_public_active_only(%{"active_only" => value}, _include_unpublished), do: value
  defp default_public_active_only(_params, true), do: nil
  defp default_public_active_only(_params, false), do: "true"

  defp published_odds_stale?(match_id) do
    latest_updated_at =
      Repo.one(
        from o in Odds,
          where: o.match_id == ^match_id and o.visibility_status == :published,
          order_by: [desc: o.updated_at],
          limit: 1,
          select: o.updated_at
      )

    case latest_updated_at do
      %DateTime{} = timestamp ->
        DateTime.diff(DateTime.utc_now(), timestamp, :second) >= 5

      %NaiveDateTime{} = timestamp ->
        NaiveDateTime.diff(NaiveDateTime.utc_now(), timestamp, :second) >= 5

      _ ->
        true
    end
  end

  defp queue_async_public_live_recovery(match) do
    unless public_recovery_recently_requested?(match) do
      _ = mark_public_recovery_requested(match)

      _ =
        LangGraphClient.force_reprice_async(match,
          reason: :public_odds_recovery,
          event_type: "public_odds_recovery",
          trigger: "public_odds_recovery"
        )
    end

    :ok
  end

  defp public_recovery_recently_requested?(%Match{} = match) do
    market_state =
      if is_map(match.market_state) do
        match.market_state
      else
        %{}
      end

    timestamp =
      market_state["public_recovery_requested_at"] ||
        market_state[:public_recovery_requested_at]

    case parse_iso8601(timestamp) do
      {:ok, %DateTime{} = requested_at} ->
        DateTime.diff(DateTime.utc_now(), requested_at, :second) <
          @public_recovery_throttle_seconds

      _ ->
        false
    end
  end

  defp mark_public_recovery_requested(%Match{} = match) do
    market_state =
      if is_map(match.market_state) do
        match.market_state
      else
        %{}
      end

    match
    |> Match.live_state_changeset(%{
      market_state:
        Map.put(
          market_state,
          "public_recovery_requested_at",
          DateTime.utc_now() |> DateTime.truncate(:second) |> DateTime.to_iso8601()
        )
    })
    |> Repo.update()
  end

  defp parse_iso8601(value) when is_binary(value), do: DateTime.from_iso8601(value)
  defp parse_iso8601(_), do: :error

  # POST /api/matches/:match_id/odds
  def create(conn, %{"match_id" => match_id} = params) do
    attrs = Map.put(params, "match_id", match_id)

    with {:ok, odds} <- Betting.create_odds(attrs) do
      _ = maybe_log_limit_change(conn, "create_odds_limits", nil, odds)
      conn |> put_status(:created) |> json(%{data: odds_json(odds)})
    end
  end

  # PUT /api/odds/:id
  def update(conn, %{"id" => id} = params) do
    odds = Betting.get_odds!(id)

    with {:ok, updated} <- Betting.update_odds(odds, params) do
      MatchChannel.broadcast_odds_update(updated.match_id, [
        odds_json(updated, odds_exposure_index([updated.id]))
      ])

      _ = maybe_log_limit_change(conn, "update_odds_limits", odds, updated)
      json(conn, %{data: odds_json(updated)})
    end
  end

  # POST /api/odds/:id/activate
  def activate(conn, %{"id" => id}) do
    odds = Betting.get_odds!(id)

    with {:ok, updated} <- Betting.set_odds_active(odds, true) do
      MatchChannel.broadcast_odds_update(updated.match_id, [
        odds_json(updated, odds_exposure_index([updated.id]))
      ])

      json(conn, %{data: odds_json(updated)})
    end
  end

  # POST /api/odds/:id/deactivate
  def deactivate(conn, %{"id" => id}) do
    odds = Betting.get_odds!(id)

    with {:ok, updated} <- Betting.set_odds_active(odds, false) do
      MatchChannel.broadcast_odds_update(updated.match_id, [
        odds_json(updated, odds_exposure_index([updated.id]))
      ])

      json(conn, %{data: odds_json(updated)})
    end
  end

  # POST /api/matches/:match_id/odds/generate
  def generate(conn, %{"match_id" => match_id} = params) do
    current_user = Guardian.Plug.current_resource(conn)
    match = Betting.get_match!(match_id)

    with {:ok, bet_types} <- parse_bet_types(params["bet_types"], match.sport),
         {:ok, hardness} <- parse_hardness(params["hardness"]) do
      model = params["model"]
      admin_note = params["admin_note"]
      version_no = Betting.next_odds_version(match_id)

      opts =
        [hardness: hardness, admin_note: admin_note]
        |> maybe_put_opt(:model, model)

      with {:ok, generated_odds} <- OddsGenerator.generate_odds(match, bet_types, opts) do
        inserted = persist_generated_odds(generated_odds, match, version_no, admin_note, params)

        conn
        |> put_status(:created)
        |> json(%{
          data: inserted,
          count: length(inserted),
          version_no: version_no,
          generated_by: current_user.id
        })
        |> tap(fn _ ->
          odds_ids = Enum.map(inserted, & &1.id)

          _ =
            maybe_log_generation_action(conn, "generate_odds", match_id, admin_note, %{
              version_no: version_no,
              count: length(inserted),
              odds_ids: odds_ids,
              has_limit_payload:
                !!(params["default_max_stake_amount"] || params["default_max_payout_amount"] ||
                     params["market_limits"])
            })
        end)
      end
    end
  end

  # POST /api/super-admin/matches/:id/odds/publish
  def publish(conn, %{"id" => match_id}) do
    current_user = Guardian.Plug.current_resource(conn)

    with {:ok, result} <- Betting.publish_match_odds(match_id, current_user.id, audit_meta(conn)) do
      json(conn, %{data: result})
    end
  end

  # POST /api/super-admin/matches/:id/odds/unpublish
  def unpublish(conn, %{"id" => match_id}) do
    current_user = Guardian.Plug.current_resource(conn)

    with {:ok, result} <-
           Betting.unpublish_match_odds(match_id, current_user.id, audit_meta(conn)) do
      json(conn, %{data: result})
    end
  end

  # GET /api/super-admin/matches/:match_id/provider-odds
  def provider_reference(conn, %{"match_id" => match_id}) do
    with {:ok, result} <- Providers.fetch_match_provider_odds(match_id) do
      json(conn, %{data: %{result | data: Enum.map(result.data, &provider_reference_json/1)}})
    end
  end

  # POST /api/super-admin/matches/:match_id/provider-odds/import
  def import_provider_odds(conn, %{"match_id" => match_id}) do
    with {:ok, result} <- Providers.import_match_provider_odds(match_id) do
      conn
      |> put_status(:created)
      |> json(%{data: %{result | data: Enum.map(result.data, &odds_json/1)}})
    end
  end

  # POST /api/super-admin/matches/:id/odds/regenerate
  def regenerate(conn, %{"id" => match_id} = params) do
    _ = maybe_log_generation_action(conn, "regenerate_odds", match_id, params["admin_note"])
    generate(conn, Map.put(params, "match_id", match_id))
  end

  # POST /api/super-admin/matches/:id/odds/rewrite
  def rewrite(conn, %{"id" => match_id} = params) do
    rewrite_note = params["note"] || params["admin_note"]
    _ = maybe_log_generation_action(conn, "rewrite_odds", match_id, rewrite_note)
    regenerate(conn, params |> Map.put("id", match_id) |> Map.put("admin_note", rewrite_note))
  end

  # POST /api/super-admin/matches/:id/odds/orchestrate
  def orchestrate(conn, %{"id" => match_id} = params) do
    current_user = Guardian.Plug.current_resource(conn)
    match = Betting.get_match!(match_id)

    case OddsOrchestrator.run(match, params) do
      {:needs_input, payload} ->
        json(conn, %{status: "needs_input", data: payload})

      {:ready, %{plan: plan} = payload} ->
        version_no = Betting.next_odds_version(match_id)

        opts =
          [hardness: plan.hardness, admin_note: plan.admin_note]
          |> maybe_put_opt(:model, plan.generation_model || plan.model)

        with {:ok, generated_odds} <- OddsGenerator.generate_odds(match, plan.bet_types, opts) do
          inserted =
            persist_generated_odds(
              generated_odds,
              match,
              version_no,
              plan.admin_note,
              plan_to_generation_params(plan)
            )

          _ =
            maybe_log_generation_action(
              conn,
              "orchestrated_generate_odds",
              match_id,
              plan.admin_note,
              %{
                version_no: version_no,
                count: length(inserted),
                odds_ids: Enum.map(inserted, & &1.id),
                planning_model: plan.planning_model,
                generation_model: plan.generation_model,
                validation_model: plan.validation_model
              }
            )

          conn
          |> put_status(:created)
          |> json(%{
            status: "generated",
            data: inserted,
            count: length(inserted),
            version_no: version_no,
            generated_by: current_user.id,
            orchestration: Map.drop(payload, [:plan]),
            applied_plan: %{
              bet_types: plan.bet_types,
              hardness: plan.hardness,
              model: plan.model,
              planning_model: plan.planning_model,
              generation_model: plan.generation_model,
              validation_model: plan.validation_model,
              admin_note: plan.admin_note,
              default_max_stake_amount: plan.default_max_stake_amount,
              default_max_payout_amount: plan.default_max_payout_amount,
              limit_scope: plan.limit_scope,
              market_limits: plan.market_limits
            }
          })
        end
    end
  end

  def simulate(conn, %{"id" => match_id, "scenario" => scenario}) do
    if SimulationScenario.allowed?(scenario) do
      match = Betting.get_match!(match_id)

      LangGraphClient.force_reprice_async(match,
        simulation_mode: true,
        simulation_scenario: scenario,
        suspend_reason: "simulation_injection",
        source: "simulation_suite",
        trigger: scenario,
        event_type: "simulation_#{scenario}",
        reason: :simulation_scenario_injection
      )

      json(conn, %{data: %{accepted: true, match_id: match_id, scenario: scenario}})
    else
      conn
      |> put_status(:unprocessable_entity)
      |> json(%{error: "unknown_scenario"})
    end
  end

  defp odds_json(o, exposure_index \\ %{}, suspended_markets \\ %{}) do
    exposure = Map.get(exposure_index, o.id, %{})
    market_key = o.source_market_key || to_string(o.bet_type)
    market_suspension = suspended_markets[market_key]
    row_suspended = o.is_active != true
    family_suspended = is_map(market_suspension)
    provider_snapshot = o.provider_snapshot || %{}

    %{
      id: o.id,
      match_id: o.match_id,
      bet_type: o.bet_type,
      market_family: provider_snapshot["market_family"],
      window_label: provider_snapshot["window_label"],
      projected_line: provider_snapshot["projected_line"],
      fair_projected_line:
        get_in(provider_snapshot, ["trace_meta", "fair_projected_line"]) ||
          provider_snapshot["fair_projected_line"],
      selection_key: provider_snapshot["selection_key"],
      outcome: o.outcome,
      odds_value: JsonHelpers.decimal(o.odds_value),
      is_active: o.is_active,
      is_suspended: row_suspended or family_suspended,
      suspension_reason:
        cond do
          row_suspended -> "row_deactivated"
          family_suspended -> market_suspension["reason"]
          true -> nil
        end,
      ai_generated: o.ai_generated,
      ai_model: o.ai_model,
      visibility_status: o.visibility_status,
      version_no: o.version_no,
      admin_note: o.admin_note,
      published_by_id: o.published_by_id,
      published_at: o.published_at,
      max_stake_amount: JsonHelpers.decimal(o.max_stake_amount),
      max_payout_amount: JsonHelpers.decimal(o.max_payout_amount),
      limit_scope: o.limit_scope,
      source_type: o.source_type,
      source_provider: o.source_provider,
      source_external_id: o.source_external_id,
      source_market_key: o.source_market_key,
      fair_probability: provider_snapshot["fair_probability"],
      display_probability: provider_snapshot["display_probability"],
      final_published_probability:
        provider_snapshot["approved_probability"] ||
          get_in(provider_snapshot, ["trace_meta", "approved_probability"]),
      shading_magnitude: provider_snapshot["shading_magnitude"],
      volatility_mode_active: provider_snapshot["volatility_mode_active"] || false,
      elasticity_applied: provider_snapshot["elasticity_applied"] || false,
      elasticity_reason: provider_snapshot["elasticity_reason"],
      active_playbooks: provider_snapshot["active_playbooks"] || [],
      bookmaker_summary: provider_snapshot["bookmaker_summary"] || %{},
      bookmaker_node_latency_ms: provider_snapshot["bookmaker_node_latency_ms"] || 0,
      reference_source: provider_snapshot["reference_source"],
      reference_price: provider_snapshot["reference_price"],
      reference_probability: provider_snapshot["reference_probability"],
      reference_probability_delta: provider_snapshot["reference_probability_delta"],
      matched_volume: exposure[:matched_volume] || "0",
      liability: exposure[:liability] || "0",
      provider_snapshot: o.provider_snapshot,
      inserted_at: o.inserted_at
    }
  end

  defp odds_exposure_index([]), do: %{}

  defp odds_exposure_index(odds_ids) do
    Repo.all(
      from b in Bet,
        where: b.odds_id in ^odds_ids and b.status == :pending,
        group_by: b.odds_id,
        select: %{
          odds_id: b.odds_id,
          matched_volume: coalesce(sum(b.stake), 0),
          potential_payout: coalesce(sum(b.potential_win), 0)
        }
    )
    |> Map.new(fn row ->
      liability = Decimal.sub(row.matched_volume, row.potential_payout)

      {row.odds_id,
       %{
         matched_volume: JsonHelpers.decimal(row.matched_volume),
         liability: JsonHelpers.decimal(liability)
       }}
    end)
  end

  defp normalize_suspended_markets(value) when is_map(value), do: value
  defp normalize_suspended_markets(_), do: %{}

  defp maybe_filter(filters, _key, nil), do: filters
  defp maybe_filter(filters, :active_only, "true"), do: [{:active_only, true} | filters]
  defp maybe_filter(filters, :active_only, _), do: filters

  defp maybe_filter(filters, :include_unpublished, true),
    do: [{:include_unpublished, true} | filters]

  defp maybe_filter(filters, :include_unpublished, _), do: filters

  defp maybe_filter(filters, :bet_type, val)
       when val in [
              "match_winner",
              "over_under",
              "in_play",
              "double_chance",
              "btts",
              "set_betting",
              "place"
            ],
       do: [{:bet_type, String.to_existing_atom(val)} | filters]

  defp maybe_filter(filters, :bet_type, _), do: filters

  defp maybe_filter(filters, :visibility_status, val)
       when val in ["draft", "published", "archived"],
       do: [{:visibility_status, String.to_existing_atom(val)} | filters]

  defp maybe_filter(filters, :visibility_status, _), do: filters

  defp maybe_filter(filters, :source_type, val) when val in ["platform", "provider_import"],
    do: [{:source_type, val} | filters]

  defp maybe_filter(filters, :source_type, _), do: filters
  defp maybe_filter(filters, _key, _val), do: filters

  defp maybe_put_opt(opts, _key, nil), do: opts
  defp maybe_put_opt(opts, key, value), do: Keyword.put(opts, key, value)

  defp provider_reference_json(attrs) do
    %{
      bet_type: attrs["bet_type"],
      outcome: attrs["outcome"],
      odds_value: JsonHelpers.decimal(attrs["odds_value"]),
      source_type: attrs["source_type"],
      source_provider: attrs["source_provider"],
      source_external_id: attrs["source_external_id"],
      source_market_key: attrs["source_market_key"],
      provider_snapshot: attrs["provider_snapshot"]
    }
  end

  defp persist_generated_odds(generated_odds, match, version_no, admin_note, params) do
    request_defaults =
      extract_request_defaults(params)
      |> Map.put(:market_limits, parse_market_limits(params["market_limits"]))

    Enum.map(generated_odds, fn o ->
      resolved_limits = resolve_limits_for_odds(match, o, request_defaults)

      attrs = %{
        "match_id" => match.id,
        "bet_type" => to_string(o.bet_type),
        "outcome" => o.outcome,
        "odds_value" => o.odds_value,
        "ai_generated" => true,
        "ai_model" => o.ai_model,
        "visibility_status" => "draft",
        "version_no" => version_no,
        "admin_note" => admin_note,
        "published_by_id" => nil,
        "published_at" => nil,
        "provider_snapshot" => in_play_snapshot(match, o.bet_type),
        "max_stake_amount" => resolved_limits.max_stake_amount,
        "max_payout_amount" => resolved_limits.max_payout_amount,
        "limit_scope" => resolved_limits.limit_scope
      }

      case Betting.create_odds(attrs) do
        {:ok, odds} ->
          odds_json(odds)
          |> Map.put(:applied_limit_source, resolved_limits.source)

        _ ->
          nil
      end
    end)
    |> Enum.reject(&is_nil/1)
  end

  defp extract_request_defaults(params) do
    %{
      max_stake_amount: params["default_max_stake_amount"] || params["max_stake_amount"],
      max_payout_amount: params["default_max_payout_amount"] || params["max_payout_amount"],
      limit_scope: params["limit_scope"] || "market"
    }
  end

  defp in_play_snapshot(match, :in_play), do: InPlaySnapshot.build(match, :in_play)
  defp in_play_snapshot(_match, _bet_type), do: nil

  defp resolve_limits_for_odds(match, generated_odd, defaults) do
    bet_type = generated_odd.bet_type
    outcome = generated_odd.outcome
    market_config = Betting.get_sport_market_config(match.sport, bet_type)

    override = find_market_limit_override(defaults.market_limits || [], bet_type, outcome)

    max_stake_amount =
      choose_limit(
        override && override.max_stake_amount,
        defaults.max_stake_amount,
        market_config && market_config.default_max_stake_amount
      )

    max_payout_amount =
      choose_limit(
        override && override.max_payout_amount,
        defaults.max_payout_amount,
        market_config && market_config.default_max_payout_amount
      )

    limit_scope =
      normalize_scope((override && override.limit_scope) || defaults.limit_scope || "market")

    %{
      max_stake_amount: max_stake_amount,
      max_payout_amount: max_payout_amount,
      limit_scope: limit_scope,
      source: %{
        max_stake_amount:
          source_label(
            override && override.max_stake_amount,
            defaults.max_stake_amount,
            market_config && market_config.default_max_stake_amount
          ),
        max_payout_amount:
          source_label(
            override && override.max_payout_amount,
            defaults.max_payout_amount,
            market_config && market_config.default_max_payout_amount
          ),
        limit_scope: if(override && override.limit_scope, do: :override, else: :request_default)
      }
    }
  end

  defp choose_limit(override, request_default, market_default) do
    override || request_default || market_default
  end

  defp source_label(override, request_default, market_default) do
    cond do
      not is_nil(override) -> :override
      not is_nil(request_default) -> :request_default
      not is_nil(market_default) -> :market_default
      true -> :none
    end
  end

  defp parse_market_limits(nil), do: []
  defp parse_market_limits(""), do: []

  defp parse_market_limits(v) when is_binary(v) do
    case Jason.decode(v) do
      {:ok, decoded} -> parse_market_limits(decoded)
      _ -> []
    end
  end

  defp parse_market_limits(v) when is_list(v) do
    v
    |> Enum.filter(&is_map/1)
    |> Enum.map(fn item ->
      %{
        bet_type: parse_bet_type(item["bet_type"] || item[:bet_type]),
        outcome: normalize_outcome(item["outcome"] || item[:outcome]),
        max_stake_amount: item["max_stake_amount"] || item[:max_stake_amount],
        max_payout_amount: item["max_payout_amount"] || item[:max_payout_amount],
        limit_scope: item["limit_scope"] || item[:limit_scope]
      }
    end)
    |> Enum.filter(& &1.bet_type)
  end

  defp parse_market_limits(_), do: []

  defp find_market_limit_override(market_limits, bet_type, outcome) do
    normalized_outcome = normalize_outcome(outcome)

    exact =
      Enum.find(market_limits, fn row ->
        row.bet_type == bet_type and row.outcome not in [nil, ""] and
          row.outcome == normalized_outcome
      end)

    exact ||
      Enum.find(market_limits, fn row ->
        row.bet_type == bet_type and row.outcome in [nil, ""]
      end)
  end

  defp normalize_scope(v) when v in [:global, :market, :selection], do: v
  defp normalize_scope("global"), do: :global
  defp normalize_scope("selection"), do: :selection
  defp normalize_scope(_), do: :market

  defp normalize_outcome(nil), do: nil

  defp normalize_outcome(v) do
    v
    |> to_string()
    |> String.trim()
    |> String.downcase()
    |> String.replace(" ", "_")
  end

  defp parse_bet_type(v)
       when v in [
              :match_winner,
              :over_under,
              :in_play,
              :double_chance,
              :btts,
              :set_betting,
              :place
            ],
       do: v

  defp parse_bet_type("match_winner"), do: :match_winner
  defp parse_bet_type("over_under"), do: :over_under
  defp parse_bet_type("in_play"), do: :in_play
  defp parse_bet_type("double_chance"), do: :double_chance
  defp parse_bet_type("btts"), do: :btts
  defp parse_bet_type("set_betting"), do: :set_betting
  defp parse_bet_type("place"), do: :place
  defp parse_bet_type(_), do: nil

  defp plan_to_generation_params(plan) when is_map(plan) do
    %{
      "default_max_stake_amount" => plan.default_max_stake_amount,
      "default_max_payout_amount" => plan.default_max_payout_amount,
      "limit_scope" => plan.limit_scope && to_string(plan.limit_scope),
      "market_limits" => plan.market_limits
    }
  end

  defp parse_bet_types(nil, sport), do: {:ok, OddsRules.allowed_bet_types(sport)}

  defp parse_bet_types(values, sport) when is_list(values) do
    allowed = OddsRules.allowed_bet_types(sport)

    parsed =
      values
      |> Enum.map(&to_string/1)
      |> Enum.map(&String.trim/1)
      |> Enum.map(&String.downcase/1)
      |> Enum.filter(
        &(&1 in [
            "match_winner",
            "over_under",
            "in_play",
            "double_chance",
            "btts",
            "set_betting",
            "place"
          ])
      )
      |> Enum.map(&string_to_bet_type/1)
      |> Enum.filter(&(&1 in allowed))
      |> Enum.uniq()

    if parsed == [], do: {:error, :sport_market_not_supported}, else: {:ok, parsed}
  end

  defp parse_bet_types(value, sport) when is_binary(value) do
    parse_bet_types(String.split(value, ",", trim: true), sport)
  end

  defp parse_bet_types(_, _), do: {:error, :sport_market_not_supported}

  defp parse_hardness(nil), do: {:ok, :medium}
  defp parse_hardness("easy"), do: {:ok, :easy}
  defp parse_hardness("medium"), do: {:ok, :medium}
  defp parse_hardness("hard"), do: {:ok, :hard}
  defp parse_hardness(:easy), do: {:ok, :easy}
  defp parse_hardness(:medium), do: {:ok, :medium}
  defp parse_hardness(:hard), do: {:ok, :hard}
  defp parse_hardness(_), do: {:error, :invalid_hardness}

  defp string_to_bet_type("match_winner"), do: :match_winner
  defp string_to_bet_type("over_under"), do: :over_under
  defp string_to_bet_type("in_play"), do: :in_play
  defp string_to_bet_type("double_chance"), do: :double_chance
  defp string_to_bet_type("btts"), do: :btts
  defp string_to_bet_type("set_betting"), do: :set_betting
  defp string_to_bet_type("place"), do: :place

  defp audit_meta(conn) do
    %{
      ip_address: conn.remote_ip |> :inet.ntoa() |> to_string(),
      user_agent: List.first(get_req_header(conn, "user-agent"))
    }
  rescue
    _ -> %{}
  end

  defp maybe_log_generation_action(conn, action, match_id, note, extra_payload \\ %{}) do
    case Guardian.Plug.current_resource(conn) do
      %{id: actor_id} ->
        payload =
          %{
            admin_note: note,
            endpoint: conn.request_path,
            method: conn.method
          }
          |> Map.merge(extra_payload || %{})

        Back.Admin.log_action(%{
          actor_id: actor_id,
          action: action,
          target_type: "Match",
          target_id: match_id,
          payload: payload,
          ip_address: audit_meta(conn)[:ip_address],
          user_agent: audit_meta(conn)[:user_agent]
        })

      _ ->
        :ok
    end
  end

  defp maybe_log_limit_change(conn, action, previous, current) do
    previous_limits = extract_limits(previous)
    current_limits = extract_limits(current)

    if previous_limits != current_limits do
      case Guardian.Plug.current_resource(conn) do
        %{id: actor_id} ->
          Back.Admin.log_action(%{
            actor_id: actor_id,
            action: action,
            target_type: "Odds",
            target_id: current.id,
            payload: %{
              previous_limits: previous_limits,
              new_limits: current_limits,
              endpoint: conn.request_path,
              method: conn.method
            },
            ip_address: audit_meta(conn)[:ip_address],
            user_agent: audit_meta(conn)[:user_agent]
          })

        _ ->
          :ok
      end
    else
      :ok
    end
  end

  defp extract_limits(nil), do: %{max_stake_amount: nil, max_payout_amount: nil, limit_scope: nil}

  defp extract_limits(odds) do
    %{
      max_stake_amount: odds.max_stake_amount,
      max_payout_amount: odds.max_payout_amount,
      limit_scope: odds.limit_scope
    }
  end
end
