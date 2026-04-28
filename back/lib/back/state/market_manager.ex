defmodule Back.State.MarketManager do
  @moduledoc false

  import Ecto.Query

  alias Back.Analytics
  alias Back.Accounts.User
  alias Back.AI.Automation.FeedConfig
  alias Back.Betting.Bet
  alias Back.Betting.Match
  alias Back.Betting.Odds
  alias Back.MultiSource
  alias Back.Providers.CompetitionFeed
  alias Back.Providers.SportmonksLiveIndex
  alias Back.Repo
  alias BackWeb.MatchChannel

  @price_jump_threshold 0.20
  @cricket_reference_alert_threshold 0.12

  @type engine_market :: map()
  @type engine_response :: map()
  @type provider_reference_row :: map()

  @spec apply_engine_response(Ecto.UUID.t(), engine_response()) :: {:ok, map()} | {:error, term()}
  def apply_engine_response(
        match_id,
        %{"markets" => markets, "state_version" => state_version} = response
      )
      when is_list(markets) and is_integer(state_version) do
    case Repo.transaction(fn ->
           match =
             Repo.one!(
               from m in Match,
                 where: m.id == ^match_id,
                 lock: "FOR UPDATE"
             )

           reviewer_decision = response["reviewer_decision"] || "approve"
           fancy_markets = response["fancy_markets"] || []
           core_markets = Enum.reject(markets, &fancy_market?/1)
           active_fancy_markets = Enum.reject(fancy_markets, &fancy_market_suspended?/1)
           fancy_family_suspended? = fancy_family_suspended?(fancy_markets, response)
           combined_markets = core_markets ++ fancy_markets
           cricket_reference = maybe_build_cricket_reference(match, combined_markets)

           cond do
             match.live_state_version != state_version ->
               Repo.rollback(:stale_match_state)

             match.suspended_at == nil and not market_state_suspended?(match.market_state || %{}) ->
               Repo.rollback(:market_not_suspended)

             reviewer_decision == "reject_and_keep_suspended" ->
               {:error, keep_suspended_transaction(match, "reviewer_veto", response)}

             not provider_heartbeat_healthy?(match) ->
               {:error, keep_suspended_transaction(match, "provider_disconnect", response)}

             core_markets == [] ->
               {:error, keep_suspended_transaction(match, "ai_engine_unavailable", response)}

             review_required_live_publish?(match) ->
               store_review_draft_transaction(match, response, core_markets, active_fancy_markets)

             true ->
               publisher_id = system_publisher_id() || Repo.rollback(:missing_system_publisher)
               now = DateTime.utc_now() |> DateTime.truncate(:second)

               current_published =
                 Repo.all(
                   from o in Odds,
                     where:
                       o.match_id == ^match_id and o.visibility_status == :published and
                         o.source_type == "platform"
                 )

               price_jump_review_recommended? =
                 manual_review_required?(current_published, core_markets)

               version_no = Back.Betting.next_odds_version(match_id)

               {archived_count, _} =
                 Repo.update_all(
                   from(o in Odds,
                     where:
                       o.match_id == ^match_id and o.visibility_status == :published and
                         o.source_type == "platform"
                   ),
                   set: [visibility_status: :archived, updated_at: now]
                 )

               carry_forward_markets =
                 carry_forward_suspended_markets(
                   current_published,
                   combined_markets,
                   response,
                   now
                 )

               deduped_markets =
                 dedupe_markets_for_insert(combined_markets ++ carry_forward_markets)

               inserted_odds =
                 deduped_markets
                 |> Enum.map(fn market ->
                   reference_meta =
                     resolve_reference_meta(
                       market,
                       cricket_reference[:reference_lookup] || %{}
                     )

                   suspended? = truthy?(market["is_suspended"])

                   suspend_reason =
                     first_present_text([market["reason"], market["suspension_reason"]])

                   valid_for_ms =
                     market
                     |> Map.get("valid_for_ms")
                     |> normalize_integer()
                     |> public_cricket_quote_ttl()

                   provider_snapshot =
                     %{
                       "engine_trace_id" => response["engine_trace_id"],
                       "confidence_score" => market["confidence_score"],
                       "valid_for_ms" => valid_for_ms,
                       "selection_key" => market["selection_key"],
                       "market_family" => market["market_family"],
                       "window_label" => market["window_label"],
                       "projected_line" => market["projected_line"],
                       "availability_status" => if(suspended?, do: "suspended", else: "active"),
                       "availability_reason" => suspend_reason,
                       "is_carry_forward" => truthy?(market["is_carry_forward"]),
                       "trace_meta" => market["trace_meta"] || %{},
                       "fair_probability" => response["fair_probability"],
                       "display_probability" => response["display_probability"],
                       "approved_probability" =>
                         get_in(market, ["trace_meta", "approved_probability"]),
                       "shading_magnitude" => response["shading_magnitude"],
                       "volatility_mode_active" => response["volatility_mode_active"] || false,
                       "elasticity_applied" => response["elasticity_applied"] || false,
                       "elasticity_reason" => response["elasticity_reason"],
                       "active_playbooks" => response["active_playbooks"] || [],
                       "bookmaker_summary" => response["bookmaker_summary"] || %{},
                       "bookmaker_node_latency_ms" => response["bookmaker_node_latency_ms"] || 0,
                       "lifecycle_analytics" => response["lifecycle_analytics"] || %{}
                     }
                     |> Map.merge(reference_meta)
                     |> maybe_merge_fancy_snapshot(market)

                   attrs = %{
                     match_id: match_id,
                     bet_type: normalize_bet_type(market),
                     outcome: market["label"] || market["selection_key"],
                     odds_value: normalize_decimal!(market["price"]),
                     is_active: not suspended?,
                     ai_generated: true,
                     ai_model: response["model"] || "langgraph",
                     visibility_status: :published,
                     version_no: version_no,
                     admin_note: "LangGraph live repricing",
                     published_by_id: publisher_id,
                     published_at: now,
                     source_type: "platform",
                     source_provider: "langgraph",
                     source_market_key: market["market_key"],
                     provider_snapshot: provider_snapshot
                   }

                   case %Odds{} |> Odds.changeset(attrs) |> Repo.insert() do
                     {:ok, odds} -> odds
                     {:error, changeset} -> Repo.rollback({:odds_insert_failed, changeset})
                   end
                 end)

               _ =
                 persist_cricket_quote_audits(
                   match,
                   inserted_odds,
                   response,
                   cricket_reference[:reference_lookup] || %{}
                 )

               updated_market_state =
                 match.market_state
                 |> normalize_market_state()
                 |> Map.put("suspended", false)
                 |> Map.delete("suspension_reason")
                 |> Map.put("manual_admin_review", false)
                 |> Map.put("manual_review_recommended", price_jump_review_recommended?)
                 |> Map.put("last_resumed_at", DateTime.to_iso8601(now))
                 |> Map.put(
                   "suspended_markets",
                   normalize_suspended_markets(match.suspended_markets)
                 )
                 |> Map.put("engine_trace_id", response["engine_trace_id"])
                 |> Map.put("variance_alerts", response["variance_alerts"] || [])
                 |> Map.put("strategy_mode", response["strategy_mode"])
                 |> Map.put("pricing_model", response["model"])
                 |> Map.put("config_provider", response["config_provider"])
                 |> Map.put("llm_enabled", response["llm_enabled"])
                 |> Map.put("fallback_used", response["fallback_used"])
                 |> Map.put("reviewer_decision", reviewer_decision)
                 |> Map.put("reviewer_feedback", response["reviewer_feedback"])
                 |> Map.put(
                   "reviewer_flags",
                   merge_reviewer_flags(
                     response["reviewer_flags"] || [],
                     price_jump_review_recommended?
                   )
                 )
                 |> Map.put("fair_probability", response["fair_probability"])
                 |> Map.put("display_probability", response["display_probability"])
                 |> Map.put("shading_magnitude", response["shading_magnitude"])
                 |> Map.put("volatility_mode_active", response["volatility_mode_active"] || false)
                 |> Map.put("elasticity_applied", response["elasticity_applied"] || false)
                 |> Map.put("elasticity_reason", response["elasticity_reason"])
                 |> Map.put("active_playbooks", response["active_playbooks"] || [])
                 |> Map.put("bookmaker_summary", response["bookmaker_summary"] || %{})
                 |> Map.put(
                   "bookmaker_node_latency_ms",
                   response["bookmaker_node_latency_ms"] || 0
                 )
                 |> Map.put("reference_variance_alerts", cricket_reference[:alerts] || [])
                 |> Map.put("reference_source", cricket_reference[:source])
                 |> Map.put("reference_row_count", cricket_reference[:row_count] || 0)
                 |> Map.put("fancy_summary", response["fancy_summary"] || %{})
                 |> Map.put("fancy_flags", response["fancy_flags"] || [])
                 |> Map.put("fancy_suspension_reason", response["fancy_suspension_reason"])

               next_suspended_markets =
                 match.suspended_markets
                 |> normalize_suspended_markets()
                 |> update_fancy_family_suspension(
                   fancy_family_suspended?,
                   response["fancy_suspension_reason"],
                   response
                 )

               {:ok, updated_match} =
                 match
                 |> Match.live_state_changeset(%{
                   suspended_at: nil,
                   suspension_reason: nil,
                   suspended_markets: next_suspended_markets,
                   market_state:
                     updated_market_state
                     |> Map.put("suspended_markets", next_suspended_markets)
                 })
                 |> Repo.update()

               exposure_index = odds_exposure_index(Enum.map(inserted_odds, & &1.id))

               MatchChannel.broadcast_odds_update(
                 updated_match.id,
                 Enum.map(inserted_odds, &odds_broadcast_json(&1, exposure_index))
               )

               maybe_broadcast_fancy_family_transition(updated_match, fancy_family_suspended?)

               MatchChannel.broadcast_market_resumed(updated_match, %{
                 match_id: updated_match.id,
                 market_status: "active",
                 state_version: updated_match.live_state_version,
                 odds_version_no: version_no,
                 resumed_at: now,
                 archived_count: archived_count
               })

               %{
                 match: updated_match,
                 odds: inserted_odds,
                 version_no: version_no,
                 archived_count: archived_count
               }
           end
         end) do
      {:ok, {:error, reason}} -> {:error, reason}
      {:ok, value} -> {:ok, value}
      {:error, reason} -> {:error, reason}
    end
  end

  def apply_engine_response(_match_id, _response), do: {:error, :invalid_engine_response}

  defp persist_cricket_quote_audits(
         %Match{sport: sport} = match,
         inserted_odds,
         response,
         reference_lookup
       )
       when sport in [:cricket, "cricket"] and is_list(inserted_odds) and is_map(response) do
    rows =
      Enum.map(inserted_odds, fn odds ->
        provider_snapshot = odds.provider_snapshot || %{}
        selection_key = provider_snapshot["selection_key"]
        market_key = odds.source_market_key

        reference =
          Map.get(reference_lookup, {market_key, selection_key}, %{})

        %{
          match_id: match.id,
          odds_id: odds.id,
          state_version: match.live_state_version,
          event_seq: match.live_event_seq,
          market_key: market_key,
          selection_key: selection_key,
          published_price: odds.odds_value,
          confidence_score: provider_snapshot["confidence_score"],
          valid_for_ms: provider_snapshot["valid_for_ms"],
          reviewer_decision: response["reviewer_decision"],
          reviewer_flags: response["reviewer_flags"] || [],
          active_playbooks: response["active_playbooks"] || [],
          lifecycle_analytics: response["lifecycle_analytics"] || %{},
          fair_probability: provider_snapshot["fair_probability"],
          display_probability: provider_snapshot["display_probability"],
          approved_probability:
            provider_snapshot["approved_probability"] ||
              get_in(provider_snapshot, ["trace_meta", "approved_probability"]),
          reference_source: reference["source_name"] || provider_snapshot["reference_source"],
          reference_price:
            normalize_reference_decimal(
              reference["odds_value"] || provider_snapshot["reference_price"]
            ),
          reference_probability: provider_snapshot["reference_probability"],
          reference_probability_delta: provider_snapshot["reference_probability_delta"]
        }
      end)

    Analytics.insert_cricket_quote_audits(rows)
  end

  defp persist_cricket_quote_audits(_match, _inserted_odds, _response, _reference_lookup),
    do: {0, nil}

  defp maybe_build_cricket_reference(%Match{sport: sport} = match, markets)
       when sport in [:cricket, "cricket"] and is_list(markets) do
    case MultiSource.build_source_reference_rows_for_match(match, "one_x_bet_worker") do
      {:ok, rows} when is_list(rows) ->
        reference_lookup =
          Map.new(rows, fn row ->
            {
              {
                row["market_key"] || row["source_market_key"],
                row["selection_key"]
              },
              row
            }
          end)

        alerts =
          Enum.flat_map(markets, fn market ->
            case resolve_reference_meta(market, reference_lookup) do
              %{"reference_probability_delta" => delta} = meta
              when is_number(delta) and delta > @cricket_reference_alert_threshold ->
                [
                  %{
                    "market_key" => market["market_key"],
                    "selection_key" => market["selection_key"],
                    "engine_price" => market["price"],
                    "reference_price" => meta["reference_price"],
                    "probability_delta" => delta,
                    "reference_source" => meta["reference_source"]
                  }
                ]

              _ ->
                []
            end
          end)

        %{
          source: "one_x_bet_worker",
          row_count: length(rows),
          reference_lookup: reference_lookup,
          alerts: alerts
        }

      _ ->
        %{source: nil, row_count: 0, reference_lookup: %{}, alerts: []}
    end
  end

  defp maybe_build_cricket_reference(_match, _markets) do
    %{source: nil, row_count: 0, reference_lookup: %{}, alerts: []}
  end

  defp resolve_reference_meta(market, reference_lookup)
       when is_map(market) and is_map(reference_lookup) do
    key = {market["market_key"], market["selection_key"]}

    case Map.get(reference_lookup, key) do
      nil ->
        %{}

      row ->
        engine_probability = implied_probability(market["price"])
        reference_probability = implied_probability(row["odds_value"])

        probability_delta =
          if is_number(engine_probability) and is_number(reference_probability) do
            Float.round(abs(engine_probability - reference_probability), 4)
          else
            nil
          end

        %{
          "reference_source" => "one_x_bet_worker",
          "reference_price" => normalize_reference_value(row["odds_value"]),
          "reference_probability" => reference_probability,
          "reference_probability_delta" => probability_delta,
          "reference_market_key" => row["market_key"] || row["source_market_key"],
          "reference_selection_key" => row["selection_key"],
          "reference_snapshot" => row["provider_snapshot"] || %{}
        }
    end
  end

  @spec published_platform_odds_exist?(Ecto.UUID.t()) :: boolean()
  def published_platform_odds_exist?(match_id) do
    Repo.exists?(
      from o in Odds,
        where:
          o.match_id == ^match_id and o.visibility_status == :published and
            o.source_type == "platform" and o.is_active == true
    )
  end

  @spec published_platform_quotes_exist?(Ecto.UUID.t()) :: boolean()
  def published_platform_quotes_exist?(match_id) do
    Repo.exists?(
      from o in Odds,
        where:
          o.match_id == ^match_id and o.visibility_status == :published and
            o.source_type == "platform"
    )
  end

  @spec keep_match_suspended(Ecto.UUID.t(), String.t(), map()) ::
          {:ok, Match.t()} | {:error, term()}
  def keep_match_suspended(match_id, reason, meta \\ %{}) when is_binary(reason) do
    case Repo.transaction(fn ->
           match =
             Repo.one!(
               from m in Match,
                 where: m.id == ^match_id,
                 lock: "FOR UPDATE"
             )

           keep_suspended_transaction(match, reason, meta)
         end) do
      {:ok, reason_atom} when is_atom(reason_atom) -> {:error, reason_atom}
      {:error, reason_atom} when is_atom(reason_atom) -> {:error, reason_atom}
      other -> other
    end
  end

  @spec apply_provider_reference_board(
          Ecto.UUID.t(),
          String.t(),
          [provider_reference_row()],
          map()
        ) ::
          {:ok, map()} | {:error, term()}
  def apply_provider_reference_board(match_id, provider_name, rows, meta \\ %{})
      when is_binary(provider_name) and is_list(rows) do
    Repo.transaction(fn ->
      match =
        Repo.one!(
          from m in Match,
            where: m.id == ^match_id,
            lock: "FOR UPDATE"
        )

      publisher_id = system_publisher_id() || Repo.rollback(:missing_system_publisher)
      now = DateTime.utc_now() |> DateTime.truncate(:second)
      version_no = Back.Betting.next_odds_version(match_id)
      normalized_rows = prepare_provider_reference_rows(rows)

      active_rows =
        Enum.reject(normalized_rows, fn row ->
          (row["availability_status"] || "active") == "suspended"
        end)

      if normalized_rows == [] do
        Repo.rollback(:no_supported_provider_reference_rows)
      end

      if active_rows == [] do
        Repo.rollback(:no_active_provider_reference_rows)
      end

      {archived_count, _} =
        Repo.update_all(
          from(o in Odds,
            where:
              o.match_id == ^match_id and o.visibility_status == :published and
                o.source_type == "platform"
          ),
          set: [visibility_status: :archived, updated_at: now]
        )

      inserted_odds =
        active_rows
        |> Enum.map(fn row ->
          availability_status = row["availability_status"] || "active"

          attrs = %{
            match_id: match_id,
            bet_type: row["normalized_bet_type"],
            outcome: row["outcome"] || row["label"] || row["selection_key"],
            odds_value: normalize_decimal!(row["odds_value"]),
            is_active: true,
            ai_generated: false,
            ai_model: nil,
            visibility_status: :published,
            version_no: version_no,
            admin_note: "Provider reference publish",
            published_by_id: publisher_id,
            published_at: now,
            source_type: "platform",
            source_provider: provider_name,
            source_market_key: row["source_market_key"] || row["bet_type"],
            provider_snapshot: %{
              "provider_reference_publish" => true,
              "source_provider" => provider_name,
              "source_external_id" => row["source_external_id"],
              "provider_snapshot" => row["provider_snapshot"],
              "valid_for_ms" => normalize_integer(row["valid_for_ms"]),
              "provider_updated_at" => row["provider_updated_at"],
              "availability_status" => availability_status,
              "availability_reason" => row["availability_reason"]
            }
          }

          case %Odds{} |> Odds.changeset(attrs) |> Repo.insert() do
            {:ok, odds} -> odds
            {:error, changeset} -> Repo.rollback({:odds_insert_failed, changeset})
          end
        end)

      {:ok, updated_match} =
        match
        |> Match.live_state_changeset(%{
          suspended_at: nil,
          suspension_reason: nil,
          market_state:
            match.market_state
            |> normalize_market_state()
            |> Map.put("suspended", false)
            |> Map.delete("suspension_reason")
            |> Map.put("last_resumed_at", DateTime.to_iso8601(now))
            |> Map.put("pricing_source", provider_name)
            |> Map.put(
              "strategy_mode",
              meta["strategy_mode"] || meta[:strategy_mode] || "provider_only"
            )
            |> Map.put("provider_reference_count", length(normalized_rows))
            |> Map.put("variance_alerts", meta["variance_alerts"] || meta[:variance_alerts] || [])
            |> Map.put("suspended_markets", normalize_suspended_markets(match.suspended_markets))
        })
        |> Repo.update()

      exposure_index = odds_exposure_index(Enum.map(inserted_odds, & &1.id))

      MatchChannel.broadcast_odds_update(
        updated_match.id,
        Enum.map(inserted_odds, &odds_broadcast_json(&1, exposure_index))
      )

      MatchChannel.broadcast_market_resumed(updated_match, %{
        match_id: updated_match.id,
        market_status: "active",
        state_version: updated_match.live_state_version,
        odds_version_no: version_no,
        resumed_at: now,
        archived_count: archived_count
      })

      %{
        match: updated_match,
        odds: inserted_odds,
        version_no: version_no,
        archived_count: archived_count
      }
    end)
  end

  @spec suspend_match(Ecto.UUID.t(), String.t(), map()) :: {:ok, Match.t()} | {:error, term()}
  def suspend_match(match_id, reason, meta \\ %{}) when is_binary(reason) do
    Repo.transaction(fn ->
      match =
        Repo.one!(
          from m in Match,
            where: m.id == ^match_id,
            lock: "FOR UPDATE"
        )

      if match.suspended_at && match.suspension_reason == reason do
        match
      else
        now = DateTime.utc_now() |> DateTime.truncate(:second)

        {:ok, updated_match} =
          match
          |> Match.live_state_changeset(%{
            suspended_at: now,
            suspension_reason: reason,
            suspended_markets: normalize_suspended_markets(match.suspended_markets),
            market_state:
              match.market_state
              |> normalize_market_state()
              |> Map.put("suspended", true)
              |> Map.put("suspension_reason", reason)
              |> Map.put(
                "suspended_markets",
                normalize_suspended_markets(match.suspended_markets)
              )
              |> Map.put("suspension_meta", stringify_map(meta))
          })
          |> Repo.update()

        MatchChannel.broadcast_market_suspended(updated_match, reason)
        updated_match
      end
    end)
  end

  @spec resume_match(Ecto.UUID.t(), map()) :: {:ok, Match.t()} | {:error, term()}
  def resume_match(match_id, meta \\ %{}) do
    Repo.transaction(fn ->
      match =
        Repo.one!(
          from m in Match,
            where: m.id == ^match_id,
            lock: "FOR UPDATE"
        )

      {:ok, updated_match} =
        match
        |> Match.live_state_changeset(%{
          suspended_at: nil,
          suspension_reason: nil,
          suspended_markets: normalize_suspended_markets(match.suspended_markets),
          market_state:
            match.market_state
            |> normalize_market_state()
            |> Map.put("suspended", false)
            |> Map.delete("suspension_reason")
            |> Map.put("suspended_markets", normalize_suspended_markets(match.suspended_markets))
            |> Map.put("manual_resume_meta", stringify_map(meta))
            |> Map.put(
              "last_resumed_at",
              DateTime.utc_now() |> DateTime.truncate(:second) |> DateTime.to_iso8601()
            )
        })
        |> Repo.update()

      MatchChannel.broadcast_market_resumed(updated_match, %{
        match_id: updated_match.id,
        market_status: "active",
        state_version: updated_match.live_state_version,
        resumed_at: DateTime.utc_now() |> DateTime.truncate(:second)
      })

      updated_match
    end)
  end

  @spec suspend_market(Ecto.UUID.t(), String.t(), String.t(), map()) ::
          {:ok, Match.t()} | {:error, term()}
  def suspend_market(match_id, market_key, reason, meta \\ %{})
      when is_binary(market_key) and is_binary(reason) do
    Repo.transaction(fn ->
      match =
        Repo.one!(
          from m in Match,
            where: m.id == ^match_id,
            lock: "FOR UPDATE"
        )

      now = DateTime.utc_now() |> DateTime.truncate(:second)

      next_suspended =
        match.suspended_markets
        |> normalize_suspended_markets()
        |> Map.put(market_key, %{
          "status" => "suspended",
          "reason" => reason,
          "suspended_at" => DateTime.to_iso8601(now),
          "meta" => stringify_map(meta)
        })

      {:ok, updated_match} =
        match
        |> Match.live_state_changeset(%{
          suspended_markets: next_suspended,
          market_state:
            match.market_state
            |> normalize_market_state()
            |> Map.put("suspended_markets", next_suspended)
        })
        |> Repo.update()

      MatchChannel.broadcast_market_suspended(updated_match, reason, [market_key])
      updated_match
    end)
  end

  @spec resume_market(Ecto.UUID.t(), String.t(), map()) :: {:ok, Match.t()} | {:error, term()}
  def resume_market(match_id, market_key, meta \\ %{}) when is_binary(market_key) do
    Repo.transaction(fn ->
      match =
        Repo.one!(
          from m in Match,
            where: m.id == ^match_id,
            lock: "FOR UPDATE"
        )

      next_suspended =
        match.suspended_markets
        |> normalize_suspended_markets()
        |> Map.delete(market_key)

      {:ok, updated_match} =
        match
        |> Match.live_state_changeset(%{
          suspended_markets: next_suspended,
          market_state:
            match.market_state
            |> normalize_market_state()
            |> Map.put("suspended_markets", next_suspended)
            |> Map.put(
              "last_market_resume_meta",
              stringify_map(Map.put(meta, :market_key, market_key))
            )
        })
        |> Repo.update()

      MatchChannel.broadcast_market_resumed(updated_match, %{
        match_id: updated_match.id,
        market_status: "active",
        state_version: updated_match.live_state_version,
        resumed_at: DateTime.utc_now() |> DateTime.truncate(:second),
        market_keys: [market_key]
      })

      updated_match
    end)
  end

  @spec suspend_all_live_cricket_matches(map()) :: {:ok, [Ecto.UUID.t()]} | {:error, term()}
  def suspend_all_live_cricket_matches(meta \\ %{}) do
    ids =
      Repo.all(
        from m in Match,
          where: m.sport == :cricket and m.status == :live,
          select: m.id
      )

    Enum.each(ids, fn id ->
      _ = suspend_match(id, "emergency_suspend", meta)
    end)

    {:ok, ids}
  end

  @spec manual_override_publish(Ecto.UUID.t(), Ecto.UUID.t(), map()) ::
          {:ok, map()} | {:error, term()}
  def manual_override_publish(match_id, actor_id, attrs) when is_map(attrs) do
    Repo.transaction(fn ->
      match =
        Repo.one!(
          from m in Match,
            where: m.id == ^match_id,
            lock: "FOR UPDATE"
        )

      now = DateTime.utc_now() |> DateTime.truncate(:second)
      version_no = Back.Betting.next_odds_version(match_id)

      {archived_count, _} =
        Repo.update_all(
          from(o in Odds,
            where:
              o.match_id == ^match_id and o.visibility_status == :published and
                o.source_type == "platform"
          ),
          set: [visibility_status: :archived, updated_at: now]
        )

      odds_attrs = %{
        match_id: match_id,
        bet_type: normalize_bet_type(attrs),
        outcome: attrs["label"] || attrs[:label] || attrs["outcome"] || attrs[:outcome],
        odds_value: normalize_decimal!(attrs["odds_value"] || attrs[:odds_value]),
        is_active: true,
        ai_generated: false,
        ai_model: nil,
        visibility_status: :published,
        version_no: version_no,
        admin_note: attrs["admin_note"] || attrs[:admin_note] || "Manual override publish",
        published_by_id: actor_id,
        published_at: now,
        source_type: "platform",
        source_provider: "manual_override",
        source_market_key: attrs["market_key"] || attrs[:market_key],
        provider_snapshot: %{
          "selection_key" => attrs["selection_key"] || attrs[:selection_key],
          "manual_override" => true,
          "market_family" => attrs["market_family"] || attrs[:market_family]
        }
      }

      odds =
        case %Odds{} |> Odds.changeset(odds_attrs) |> Repo.insert() do
          {:ok, odds} -> odds
          {:error, changeset} -> Repo.rollback({:odds_insert_failed, changeset})
        end

      {:ok, updated_match} =
        match
        |> Match.live_state_changeset(%{
          suspended_at: nil,
          suspension_reason: nil,
          suspended_markets: %{},
          market_state:
            match.market_state
            |> normalize_market_state()
            |> Map.put("suspended", false)
            |> Map.delete("suspension_reason")
            |> Map.put("suspended_markets", %{})
            |> Map.put("manual_override", true)
            |> Map.put("last_resumed_at", DateTime.to_iso8601(now))
        })
        |> Repo.update()

      exposure_index = odds_exposure_index([odds.id])

      MatchChannel.broadcast_odds_update(updated_match.id, [
        odds_broadcast_json(odds, exposure_index)
      ])

      MatchChannel.broadcast_market_resumed(updated_match, %{
        match_id: updated_match.id,
        market_status: "active",
        state_version: updated_match.live_state_version,
        odds_version_no: version_no,
        resumed_at: now,
        archived_count: archived_count
      })

      %{match: updated_match, odds: odds, version_no: version_no, archived_count: archived_count}
    end)
  end

  defp system_publisher_id do
    Repo.one(
      from u in User,
        where: u.role == :super_admin and u.is_active == true,
        select: u.id,
        limit: 1
    )
  end

  defp manual_review_required?(current_published, incoming_markets) do
    current_index =
      Map.new(current_published, fn odds ->
        {{odds.source_market_key || to_string(odds.bet_type), odds.outcome}, odds}
      end)

    Enum.any?(incoming_markets, fn market ->
      key =
        {market["market_key"] || market["bet_type"] || "in_play",
         market["label"] || market["selection_key"]}

      case Map.get(current_index, key) do
        nil ->
          false

        current_odds ->
          current_probability = implied_probability(current_odds.odds_value)
          next_probability = implied_probability(market["price"])
          abs(next_probability - current_probability) > @price_jump_threshold
      end
    end)
  end

  defp keep_suspended_transaction(%Match{} = match, reason, meta) do
    now = DateTime.utc_now() |> DateTime.truncate(:second)

    keep_board_open? =
      degradable_keep_suspended_reason?(reason) and published_platform_quotes_exist?(match.id)

    market_state =
      match.market_state
      |> normalize_market_state()
      |> Map.put("engine_trace_id", meta["engine_trace_id"] || meta[:engine_trace_id])
      |> Map.put("config_provider", meta["config_provider"] || meta[:config_provider])
      |> Map.put("llm_enabled", meta["llm_enabled"] || meta[:llm_enabled])
      |> Map.put("fallback_used", meta["fallback_used"] || meta[:fallback_used])
      |> Map.put("reviewer_decision", meta["reviewer_decision"] || meta[:reviewer_decision])
      |> Map.put("reviewer_feedback", meta["reviewer_feedback"] || meta[:reviewer_feedback])
      |> Map.put("reviewer_flags", meta["reviewer_flags"] || meta[:reviewer_flags] || [])
      |> Map.put("suspension_meta", stringify_map(meta))
      |> Map.put("suspended_markets", normalize_suspended_markets(match.suspended_markets))

    attrs =
      if keep_board_open? do
        %{
          suspended_at: nil,
          suspension_reason: nil,
          suspended_markets: normalize_suspended_markets(match.suspended_markets),
          market_state:
            market_state
            |> Map.put("suspended", false)
            |> Map.delete("suspension_reason")
            |> Map.put("degraded", true)
            |> Map.put("degraded_reason", reason)
            |> Map.put("last_degraded_at", DateTime.to_iso8601(now))
        }
      else
        %{
          suspended_at: now,
          suspension_reason: reason,
          suspended_markets: normalize_suspended_markets(match.suspended_markets),
          market_state:
            market_state
            |> Map.put("suspended", true)
            |> Map.put("suspension_reason", reason)
            |> Map.put("degraded", false)
            |> Map.delete("degraded_reason")
        }
      end

    {:ok, updated_match} =
      match
      |> Match.live_state_changeset(attrs)
      |> Repo.update()

    if keep_board_open? do
      MatchChannel.broadcast_market_resumed(updated_match, %{
        match_id: updated_match.id,
        market_status: "active",
        degraded: true,
        degraded_reason: reason,
        state_version: updated_match.live_state_version,
        resumed_at: now
      })
    else
      MatchChannel.broadcast_market_suspended(updated_match, reason)
    end

    reason_atom(reason)
  end

  defp reason_atom("reviewer_veto"), do: :reviewer_veto
  defp reason_atom("manual_admin_review"), do: :manual_admin_review_required
  defp reason_atom("provider_disconnect"), do: :provider_disconnect
  defp reason_atom("provider_reference_unavailable"), do: :provider_reference_unavailable
  defp reason_atom("ai_engine_unavailable"), do: :ai_engine_unavailable
  defp reason_atom("live_bootstrap"), do: :live_bootstrap
  defp reason_atom("bootstrap_recovery"), do: :bootstrap_recovery

  defp reason_atom(reason) when is_binary(reason) do
    if String.starts_with?(reason, "stale_feed_guard:"),
      do: :stale_feed_guard,
      else: :unknown_suspension_reason
  end

  defp reason_atom(_reason), do: :unknown_suspension_reason

  defp degradable_keep_suspended_reason?(reason)
       when reason in [
              "reviewer_veto",
              "ai_engine_unavailable",
              "provider_reference_unavailable",
              "bootstrap_recovery",
              "live_bootstrap"
            ],
       do: true

  defp degradable_keep_suspended_reason?(reason) when is_binary(reason) do
    String.starts_with?(reason, "stale_feed_guard:")
  end

  defp degradable_keep_suspended_reason?(_reason), do: false

  defp review_required_live_publish?(%Match{competition_feed_id: nil}), do: false

  defp review_required_live_publish?(%Match{competition_feed_id: competition_feed_id}) do
    case Repo.get(CompetitionFeed, competition_feed_id) do
      %CompetitionFeed{} = feed -> FeedConfig.live_ai_review_required?(feed)
      _ -> false
    end
  end

  defp store_review_draft_transaction(%Match{} = match, response, core_markets, fancy_markets) do
    now = DateTime.utc_now() |> DateTime.truncate(:second)
    version_no = Back.Betting.next_odds_version(match.id)

    inserted_odds =
      (core_markets ++ fancy_markets)
      |> Enum.reject(fn market -> market["is_suspended"] == true end)
      |> Enum.map(fn market ->
        provider_snapshot =
          %{
            "engine_trace_id" => response["engine_trace_id"],
            "confidence_score" => market["confidence_score"],
            "valid_for_ms" => market["valid_for_ms"],
            "live_review_draft" => true,
            "selection_key" => market["selection_key"],
            "trace_meta" => market["trace_meta"] || %{},
            "fair_probability" => response["fair_probability"],
            "display_probability" => response["display_probability"],
            "shading_magnitude" => response["shading_magnitude"],
            "volatility_mode_active" => response["volatility_mode_active"] || false,
            "elasticity_applied" => response["elasticity_applied"] || false,
            "elasticity_reason" => response["elasticity_reason"],
            "active_playbooks" => response["active_playbooks"] || [],
            "bookmaker_summary" => response["bookmaker_summary"] || %{},
            "bookmaker_node_latency_ms" => response["bookmaker_node_latency_ms"] || 0
          }
          |> maybe_merge_fancy_snapshot(market)

        attrs = %{
          match_id: match.id,
          bet_type: normalize_bet_type(market),
          outcome: market["label"] || market["selection_key"],
          odds_value: normalize_decimal!(market["price"]),
          is_active: true,
          ai_generated: true,
          ai_model: response["model"] || "langgraph",
          visibility_status: :draft,
          version_no: version_no,
          admin_note: "LangGraph live repricing review draft",
          published_by_id: nil,
          published_at: nil,
          source_type: "platform",
          source_provider: "langgraph",
          source_market_key: market["market_key"],
          provider_snapshot: provider_snapshot
        }

        case %Odds{} |> Odds.changeset(attrs) |> Repo.insert() do
          {:ok, odds} -> odds
          {:error, changeset} -> Repo.rollback({:odds_insert_failed, changeset})
        end
      end)

    next_suspended_markets =
      match.suspended_markets
      |> normalize_suspended_markets()
      |> update_fancy_family_suspension(
        fancy_family_suspended?(response["fancy_markets"] || [], response),
        response["fancy_suspension_reason"],
        response
      )

    {:ok, updated_match} =
      match
      |> Match.live_state_changeset(%{
        suspended_at: now,
        suspension_reason: "manual_admin_review",
        suspended_markets: next_suspended_markets,
        market_state:
          match.market_state
          |> normalize_market_state()
          |> Map.put("suspended", true)
          |> Map.put("suspension_reason", "manual_admin_review")
          |> Map.put("suspended_markets", next_suspended_markets)
          |> Map.put("manual_admin_review", true)
          |> Map.put("generated_draft_version", version_no)
          |> Map.put("engine_trace_id", response["engine_trace_id"])
          |> Map.put("config_provider", response["config_provider"])
          |> Map.put("llm_enabled", response["llm_enabled"])
          |> Map.put("fallback_used", response["fallback_used"])
          |> Map.put("reviewer_decision", response["reviewer_decision"] || "approve")
          |> Map.put("reviewer_feedback", response["reviewer_feedback"])
          |> Map.put("reviewer_flags", response["reviewer_flags"] || [])
          |> Map.put("fair_probability", response["fair_probability"])
          |> Map.put("display_probability", response["display_probability"])
          |> Map.put("shading_magnitude", response["shading_magnitude"])
          |> Map.put("volatility_mode_active", response["volatility_mode_active"] || false)
          |> Map.put("elasticity_applied", response["elasticity_applied"] || false)
          |> Map.put("elasticity_reason", response["elasticity_reason"])
          |> Map.put("active_playbooks", response["active_playbooks"] || [])
          |> Map.put("bookmaker_summary", response["bookmaker_summary"] || %{})
          |> Map.put("bookmaker_node_latency_ms", response["bookmaker_node_latency_ms"] || 0)
          |> Map.put("fancy_summary", response["fancy_summary"] || %{})
          |> Map.put("fancy_flags", response["fancy_flags"] || [])
          |> Map.put("fancy_suspension_reason", response["fancy_suspension_reason"])
          |> Map.put("live_ai_publish_mode", "review_required")
          |> Map.put("draft_ready_at", DateTime.to_iso8601(now))
      })
      |> Repo.update()

    MatchChannel.broadcast_market_suspended(updated_match, "manual_admin_review")

    {:error,
     %{
       reason: :manual_admin_review_required,
       match: updated_match,
       odds: inserted_odds,
       version_no: version_no
     }}
  end

  defp provider_heartbeat_healthy?(%Match{} = match) do
    if sportmonks_live_index_fresh?(match) do
      true
    else
      threshold = DateTime.utc_now() |> DateTime.add(-120, :second) |> DateTime.truncate(:second)

      latest_activity_at =
        [match.last_live_event_at, match.updated_at]
        |> Enum.filter(&match?(%DateTime{}, &1))
        |> Enum.max_by(&DateTime.to_unix/1, fn -> nil end)

      case latest_activity_at do
        %DateTime{} = activity_at -> DateTime.compare(activity_at, threshold) != :lt
        _ -> false
      end
    end
  end

  defp provider_heartbeat_healthy?(_), do: false

  defp sportmonks_live_index_fresh?(%Match{
         provider: "sportmonks",
         external_id: external_id,
         status: :live
       })
       when is_binary(external_id) do
    SportmonksLiveIndex.fresh_fixture?(external_id)
  end

  defp sportmonks_live_index_fresh?(_), do: false

  defp implied_probability(value) do
    decimal = normalize_decimal!(value)

    Decimal.div(Decimal.new("1"), decimal)
    |> Decimal.to_float()
  end

  defp normalize_reference_value(%Decimal{} = value), do: Decimal.to_string(value, :normal)
  defp normalize_reference_value(value) when is_binary(value), do: value
  defp normalize_reference_value(value) when is_integer(value) or is_float(value), do: value
  defp normalize_reference_value(_value), do: nil

  defp normalize_reference_decimal(nil), do: nil
  defp normalize_reference_decimal(%Decimal{} = value), do: value
  defp normalize_reference_decimal(value) when is_binary(value), do: normalize_decimal!(value)
  defp normalize_reference_decimal(value) when is_integer(value), do: Decimal.new(value)
  defp normalize_reference_decimal(value) when is_float(value), do: Decimal.from_float(value)
  defp normalize_reference_decimal(_value), do: nil

  defp merge_reviewer_flags(flags, false) when is_list(flags), do: flags

  defp merge_reviewer_flags(flags, true) when is_list(flags) do
    if "price_jump_review_recommended" in flags do
      flags
    else
      ["price_jump_review_recommended" | flags]
    end
  end

  defp merge_reviewer_flags(_flags, false), do: []
  defp merge_reviewer_flags(_flags, true), do: ["price_jump_review_recommended"]

  defp market_state_suspended?(market_state) do
    market_state["suspended"] == true or market_state[:suspended] == true
  end

  defp normalize_market_state(state) when is_map(state), do: state
  defp normalize_market_state(_), do: %{}

  defp normalize_suspended_markets(state) when is_map(state), do: state
  defp normalize_suspended_markets(_), do: %{}

  defp stringify_map(map) when is_map(map) do
    Map.new(map, fn {key, value} -> {to_string(key), value} end)
  end

  defp normalize_bet_type(%{"bet_type" => bet_type})
       when bet_type in ["match_winner", "over_under", "in_play"],
       do: String.to_existing_atom(bet_type)

  defp normalize_bet_type(%{bet_type: bet_type})
       when bet_type in [:match_winner, :over_under, :in_play],
       do: bet_type

  defp normalize_bet_type(%{"market_key" => "match_winner"}), do: :match_winner
  defp normalize_bet_type(%{"market_key" => "over_under"}), do: :over_under
  defp normalize_bet_type(%{"market_key" => "in_play"}), do: :in_play
  defp normalize_bet_type(%{"market_family" => "fancy_markets"}), do: :in_play
  defp normalize_bet_type(%{market_key: "match_winner"}), do: :match_winner
  defp normalize_bet_type(%{market_key: "over_under"}), do: :over_under
  defp normalize_bet_type(%{market_key: "in_play"}), do: :in_play
  defp normalize_bet_type(%{market_family: "fancy_markets"}), do: :in_play
  defp normalize_bet_type(_), do: :in_play

  defp normalize_reference_bet_type(%{"bet_type" => bet_type})
       when bet_type in ["match_winner", "over_under", "double_chance", "btts", "in_play"],
       do: String.to_existing_atom(bet_type)

  defp normalize_reference_bet_type(%{bet_type: bet_type})
       when bet_type in [:match_winner, :over_under, :double_chance, :btts, :in_play],
       do: bet_type

  defp normalize_reference_bet_type(%{"market_key" => "double_chance"}), do: :double_chance
  defp normalize_reference_bet_type(%{"market_key" => "btts"}), do: :btts
  defp normalize_reference_bet_type(%{"market_key" => "match_winner"}), do: :match_winner
  defp normalize_reference_bet_type(%{"market_key" => "over_under"}), do: :over_under
  defp normalize_reference_bet_type(%{"market_key" => "in_play"}), do: :in_play
  defp normalize_reference_bet_type(%{market_key: "double_chance"}), do: :double_chance
  defp normalize_reference_bet_type(%{market_key: "btts"}), do: :btts
  defp normalize_reference_bet_type(%{market_key: "match_winner"}), do: :match_winner
  defp normalize_reference_bet_type(%{market_key: "over_under"}), do: :over_under
  defp normalize_reference_bet_type(%{market_key: "in_play"}), do: :in_play
  defp normalize_reference_bet_type(_row), do: nil

  defp prepare_provider_reference_rows(rows) do
    rows
    |> Enum.map(fn row ->
      case {normalize_reference_bet_type(row), row["availability_status"] || "active"} do
        {nil, _status} ->
          nil

        {_bet_type, "closed"} ->
          nil

        {bet_type, _status} ->
          row
          |> Map.put("normalized_bet_type", bet_type)
          |> Map.put("normalized_selection_key", normalize_reference_selection_key(row))
          |> Map.put("normalized_line_key", normalize_reference_line_key(row))
      end
    end)
    |> Enum.reject(&is_nil/1)
    |> dedupe_provider_reference_rows()
  end

  defp dedupe_provider_reference_rows(rows) when is_list(rows) do
    rows
    |> Enum.reduce(%{}, fn row, acc ->
      key = provider_reference_row_key(row)

      Map.update(acc, key, row, fn existing ->
        choose_preferred_provider_reference_row(existing, row)
      end)
    end)
    |> Map.values()
  end

  defp provider_reference_row_key(row) do
    market_key = to_string(row["source_market_key"] || row["bet_type"] || "market")
    bet_type = to_string(row["normalized_bet_type"] || row["bet_type"] || "in_play")
    selection = row["normalized_selection_key"] || normalize_reference_selection_key(row)
    line = row["normalized_line_key"] || normalize_reference_line_key(row)
    "#{bet_type}::#{market_key}::#{line}::#{selection}"
  end

  defp choose_preferred_provider_reference_row(left, right) do
    left_rank = provider_reference_row_rank(left)
    right_rank = provider_reference_row_rank(right)

    cond do
      right_rank > left_rank ->
        right

      right_rank < left_rank ->
        left

      true ->
        if compare_decimal_values(right["odds_value"], left["odds_value"]) == :gt,
          do: right,
          else: left
    end
  end

  defp provider_reference_row_rank(row) do
    status_rank =
      case row["availability_status"] || "active" do
        "active" -> 30
        "suspended" -> 10
        _ -> 0
      end

    source_rank =
      if to_string(get_in(row, ["provider_snapshot", "market", "bookmaker"])) ==
           "api_sports_live" do
        20
      else
        0
      end

    main_rank =
      if truthy?(get_in(row, ["provider_snapshot", "selection", "main"])), do: 10, else: 0

    status_rank + source_rank + main_rank
  end

  defp compare_decimal_values(left, right) do
    with {:ok, l} <- parse_decimal(left),
         {:ok, r} <- parse_decimal(right) do
      Decimal.compare(l, r)
    else
      _ -> :eq
    end
  end

  defp parse_decimal(%Decimal{} = value), do: {:ok, value}
  defp parse_decimal(value) when is_integer(value), do: {:ok, Decimal.new(value)}
  defp parse_decimal(value) when is_float(value), do: {:ok, Decimal.from_float(value)}

  defp parse_decimal(value) when is_binary(value) do
    case Decimal.parse(String.trim(value)) do
      {decimal, ""} -> {:ok, decimal}
      _ -> :error
    end
  end

  defp parse_decimal(_), do: :error

  defp normalize_reference_selection_key(row) do
    selection =
      first_non_blank([
        row["selection_key"],
        get_in(row, ["provider_snapshot", "selection", "selection_key"]),
        get_in(row, ["provider_snapshot", "selection", "name"]),
        row["outcome"],
        row["label"]
      ])

    selection
    |> to_string()
    |> String.trim()
    |> String.downcase()
  end

  defp normalize_reference_line_key(row) do
    first_non_blank([
      row["line"],
      row["window_label"],
      row["projected_line"],
      get_in(row, ["provider_snapshot", "selection", "line"]),
      get_in(row, ["provider_snapshot", "selection", "handicap"]),
      get_in(row, ["provider_snapshot", "market", "line"]),
      get_in(row, ["provider_snapshot", "market", "handicap"])
    ]) || "__default__"
  end

  defp first_non_blank(values) when is_list(values) do
    Enum.find_value(values, fn value ->
      rendered =
        case value do
          nil -> ""
          v -> to_string(v)
        end
        |> String.trim()

      if rendered == "", do: nil, else: rendered
    end)
  end

  # Backward-compatible alias kept to avoid failures from older incremental
  # call-sites during code reloading.
  defp first_present_text(values), do: first_non_blank(values)

  defp carry_forward_suspended_markets(current_published, next_markets, _response, now)
       when is_list(current_published) and is_list(next_markets) do
    next_keys =
      next_markets
      |> Enum.map(&market_identity_from_map/1)
      |> Enum.reject(&is_nil/1)
      |> MapSet.new()

    Enum.reduce(current_published, [], fn odds, acc ->
      identity = market_identity_from_odds(odds)

      cond do
        is_nil(identity) ->
          acc

        MapSet.member?(next_keys, identity) ->
          acc

        true ->
          snapshot = odds.provider_snapshot || %{}

          carry_market = %{
            "market_key" => odds.source_market_key || Atom.to_string(odds.bet_type || :in_play),
            "bet_type" => Atom.to_string(odds.bet_type || :in_play),
            "selection_key" =>
              first_non_blank([snapshot["selection_key"], odds.outcome, odds.id]),
            "label" => odds.outcome,
            "price" => Decimal.to_string(odds.odds_value, :normal),
            "valid_for_ms" => normalize_integer(snapshot["valid_for_ms"]) || 8_000,
            "is_suspended" => true,
            "reason" => "repricing_refresh",
            "market_family" => snapshot["market_family"],
            "window_label" => snapshot["window_label"],
            "projected_line" => snapshot["projected_line"],
            "trace_meta" =>
              (snapshot["trace_meta"] || %{})
              |> Map.put("carry_forward_from_odds_id", odds.id)
              |> Map.put("carry_forward_at", DateTime.to_iso8601(now)),
            "is_carry_forward" => true
          }

          [carry_market | acc]
      end
    end)
  end

  defp carry_forward_suspended_markets(_, _, _, _), do: []

  defp public_cricket_quote_ttl(value) when is_integer(value) and value > 0 do
    max(value, Application.get_env(:back, :cricket_public_quote_min_ttl_ms, 60_000))
  end

  defp public_cricket_quote_ttl(_),
    do: Application.get_env(:back, :cricket_public_quote_min_ttl_ms, 60_000)

  defp market_identity_from_map(market) when is_map(market) do
    market_key = first_non_blank([market["market_key"], market[:market_key]])

    selection_key =
      first_non_blank([
        market["selection_key"],
        market[:selection_key],
        market["label"],
        market[:label]
      ])

    line_key =
      first_non_blank([
        market["projected_line"],
        market[:projected_line],
        market["window_label"],
        market[:window_label]
      ]) || "__default__"

    if market_key && selection_key do
      "#{market_key}::#{selection_key}::#{line_key}"
    else
      nil
    end
  end

  defp market_identity_from_map(_), do: nil

  defp market_identity_from_odds(%Odds{} = odds) do
    snapshot = odds.provider_snapshot || %{}
    market_key = odds.source_market_key || Atom.to_string(odds.bet_type || :in_play)
    selection_key = first_non_blank([snapshot["selection_key"], odds.outcome, odds.id])

    line_key =
      first_non_blank([snapshot["projected_line"], snapshot["window_label"]]) || "__default__"

    if market_key && selection_key do
      "#{market_key}::#{selection_key}::#{line_key}"
    else
      nil
    end
  end

  defp market_identity_from_odds(_), do: nil

  defp dedupe_markets_for_insert(markets) when is_list(markets) do
    {deduped, _seen} =
      Enum.reduce(markets, {[], MapSet.new()}, fn market, {acc, seen} ->
        identity = market_identity_from_map(market)

        cond do
          is_nil(identity) ->
            {[market | acc], seen}

          MapSet.member?(seen, identity) ->
            {acc, seen}

          true ->
            {[market | acc], MapSet.put(seen, identity)}
        end
      end)

    Enum.reverse(deduped)
  end

  defp dedupe_markets_for_insert(_), do: []

  defp normalize_integer(value) when is_integer(value), do: value
  defp normalize_integer(value) when is_float(value), do: trunc(value)

  defp normalize_integer(value) when is_binary(value) do
    case Integer.parse(String.trim(value)) do
      {parsed, _} -> parsed
      _ -> nil
    end
  end

  defp normalize_integer(_), do: nil

  defp truthy?(true), do: true
  defp truthy?("true"), do: true
  defp truthy?("1"), do: true
  defp truthy?(1), do: true
  defp truthy?(_), do: false

  defp normalize_decimal!(%Decimal{} = value), do: value
  defp normalize_decimal!(value) when is_integer(value), do: Decimal.new(value)
  defp normalize_decimal!(value) when is_float(value), do: Decimal.from_float(value)

  defp normalize_decimal!(value) when is_binary(value) do
    case Decimal.parse(String.trim(value)) do
      {decimal, ""} -> decimal
      _ -> raise ArgumentError, "invalid decimal value"
    end
  end

  defp odds_broadcast_json(odds, exposure_index) do
    exposure = Map.get(exposure_index, odds.id, %{})
    provider_snapshot = odds.provider_snapshot || %{}

    %{
      id: odds.id,
      match_id: odds.match_id,
      bet_type: odds.bet_type,
      outcome: odds.outcome,
      odds_value: Decimal.to_string(odds.odds_value, :normal),
      is_active: odds.is_active,
      visibility_status: odds.visibility_status,
      version_no: odds.version_no,
      source_market_key: odds.source_market_key,
      selection_key: provider_snapshot["selection_key"],
      market_family: provider_snapshot["market_family"],
      window_label: provider_snapshot["window_label"],
      projected_line: provider_snapshot["projected_line"],
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
      valid_for_ms: provider_snapshot["valid_for_ms"],
      fair_projected_line:
        get_in(provider_snapshot, ["trace_meta", "fair_projected_line"]) ||
          provider_snapshot["fair_projected_line"],
      is_suspended: odds.is_active != true,
      suspension_reason: provider_snapshot["availability_reason"],
      provider_snapshot: provider_snapshot,
      matched_volume: exposure[:matched_volume] || "0",
      liability: exposure[:liability] || "0",
      published_at: odds.published_at,
      inserted_at: odds.inserted_at,
      updated_at: odds.updated_at
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
         matched_volume: Decimal.to_string(row.matched_volume, :normal),
         liability: Decimal.to_string(liability, :normal)
       }}
    end)
  end

  defp maybe_merge_fancy_snapshot(
         provider_snapshot,
         %{"market_family" => "fancy_markets"} = market
       ) do
    Map.merge(provider_snapshot, %{
      "market_family" => "fancy_markets",
      "window_label" => market["window_label"],
      "projected_line" => market["projected_line"],
      "fair_projected_line" => get_in(market, ["trace_meta", "fair_projected_line"]),
      "trace_meta" => market["trace_meta"] || %{},
      "in_play_snapshot" => true
    })
  end

  defp maybe_merge_fancy_snapshot(provider_snapshot, _market), do: provider_snapshot

  defp fancy_market?(%{"market_family" => "fancy_markets"}), do: true
  defp fancy_market?(%{market_family: "fancy_markets"}), do: true
  defp fancy_market?(%{"market_key" => <<"fancy_", _::binary>>}), do: true
  defp fancy_market?(%{market_key: <<"fancy_", _::binary>>}), do: true
  defp fancy_market?(_), do: false

  defp fancy_market_suspended?(%{"is_suspended" => true}), do: true
  defp fancy_market_suspended?(%{is_suspended: true}), do: true
  defp fancy_market_suspended?(_), do: false

  defp fancy_family_suspended?([], response),
    do:
      is_binary(response["fancy_suspension_reason"]) and response["fancy_suspension_reason"] != ""

  defp fancy_family_suspended?(fancy_markets, _response) do
    Enum.all?(fancy_markets, &fancy_market_suspended?/1)
  end

  defp update_fancy_family_suspension(suspended_markets, true, reason, response) do
    Map.put(suspended_markets, "fancy_markets", %{
      "reason" => reason || "fancy_family_suspended",
      "suspended_at" => DateTime.utc_now() |> DateTime.truncate(:second) |> DateTime.to_iso8601(),
      "meta" =>
        stringify_map(%{
          "source" => "langgraph",
          "fancy_flags" => response["fancy_flags"] || []
        })
    })
  end

  defp update_fancy_family_suspension(suspended_markets, false, _reason, _response) do
    Map.delete(suspended_markets, "fancy_markets")
  end

  defp maybe_broadcast_fancy_family_transition(match, true) do
    MatchChannel.broadcast_market_suspended(match, "fancy_family_suspended", ["fancy_markets"])
  end

  defp maybe_broadcast_fancy_family_transition(match, false) do
    MatchChannel.broadcast_market_resumed(match, %{
      match_id: match.id,
      market_status: "active",
      state_version: match.live_state_version,
      resumed_at: DateTime.utc_now() |> DateTime.truncate(:second),
      market_keys: ["fancy_markets"]
    })
  end
end
