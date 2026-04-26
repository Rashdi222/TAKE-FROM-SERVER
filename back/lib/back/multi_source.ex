defmodule Back.MultiSource do
  import Ecto.Query

  alias Back.Betting.Match
  alias Back.FeatureFlags
  alias Back.Live.CricketRuntimeConfig
  alias Back.Live.LangGraphClient
  alias Back.MultiSource.Envelope
  alias Back.Providers.CompetitionFeed
  alias Back.Providers.Provider
  alias Back.Settings

  alias Back.MultiSource.Schemas.{
    AutomationEvent,
    CanonicalMarketState,
    CanonicalMatch,
    CanonicalOddsState,
    EgressGateway,
    MatchSourceRefreshStatus,
    ScraperConfiguration,
    SourceMatchMapping,
    SourceMatchMappingSuggestion
  }

  alias Back.Repo

  @demo_source_name "matchmaker_demo"
  @openrouter_url "https://openrouter.ai/api/v1/chat/completions"
  @source_refresh_advisory_cache :multi_source_refresh_advisory_cache
  @source_refresh_advisory_ttl_ms 60_000
  @auto_match_min_confidence 0.92

  def build_source_reference_rows_for_match(%Match{} = match, source_name \\ "one_x_bet_worker")
      when is_binary(source_name) do
    with %CanonicalMatch{} = canonical_match <- resolve_canonical_match_for_match(match),
         rows when is_list(rows) <-
           Repo.all(
             from state in CanonicalOddsState,
               where: state.canonical_match_id == ^canonical_match.id,
               order_by: [asc: state.market_key, asc: state.selection_key]
           )
           |> Enum.map(&canonical_state_to_reference_row(&1, source_name))
           |> Enum.reject(&is_nil/1),
         true <- rows != [] do
      {:ok, rows}
    else
      nil -> {:error, :missing_canonical_match}
      false -> {:error, :no_source_reference_rows}
      [] -> {:error, :no_source_reference_rows}
    end
  end

  def resolve_source_match(source_name, source_match_id)
      when is_binary(source_name) and is_binary(source_match_id) do
    Repo.one(
      from mapping in SourceMatchMapping,
        where:
          mapping.source_name == ^source_name and mapping.source_match_id == ^source_match_id,
        preload: [:canonical_match]
    )
  end

  def get_market_state(canonical_match_id, market_key) do
    Repo.get_by(CanonicalMarketState,
      canonical_match_id: canonical_match_id,
      market_key: market_key
    )
  end

  def get_odds_state(canonical_match_id, market_key, selection_key) do
    Repo.get_by(CanonicalOddsState,
      canonical_match_id: canonical_match_id,
      market_key: market_key,
      selection_key: selection_key
    )
  end

  def upsert_market_state(%CanonicalMarketState{} = attrs) do
    serialized = Map.from_struct(attrs)

    case get_market_state(attrs.canonical_match_id, attrs.market_key) do
      nil ->
        %CanonicalMarketState{}
        |> CanonicalMarketState.changeset(serialized)
        |> Repo.insert()

      state ->
        state
        |> CanonicalMarketState.changeset(serialized)
        |> Repo.update()
    end
  end

  def upsert_odds_state(%CanonicalOddsState{} = attrs) do
    serialized = Map.from_struct(attrs)

    case get_odds_state(attrs.canonical_match_id, attrs.market_key, attrs.selection_key) do
      nil ->
        %CanonicalOddsState{}
        |> CanonicalOddsState.changeset(serialized)
        |> Repo.insert()

      state ->
        state
        |> CanonicalOddsState.changeset(serialized)
        |> Repo.update()
    end
  end

  def resolve_legacy_match(%CanonicalMatch{} = canonical_match) do
    candidates =
      [{canonical_match.anchor_source_name, canonical_match.anchor_source_match_id}]
      |> Enum.filter(fn {source_name, source_match_id} ->
        is_binary(source_name) and String.trim(source_name) != "" and is_binary(source_match_id) and
          String.trim(source_match_id) != ""
      end)

    Enum.find_value(candidates, fn {source_name, source_match_id} ->
      Repo.get_by(Match, provider: source_name, external_id: source_match_id)
    end)
  end

  defp resolve_canonical_match_for_match(%Match{} = match) do
    Repo.get_by(CanonicalMatch,
      anchor_source_name: match.provider,
      anchor_source_match_id: match.external_id
    )
  end

  defp canonical_state_to_reference_row(%CanonicalOddsState{} = state, source_name) do
    source_snapshot = get_in(state.source_snapshots || %{}, [source_name]) || %{}
    status = normalize_source_reference_status(source_snapshot["status"] || state.status)
    price = source_snapshot["price"] || state.payload["price"] || state.canonical_price

    cond do
      not is_binary(state.market_key) or state.market_key == "" ->
        nil

      not is_binary(state.selection_key) or state.selection_key == "" ->
        nil

      is_nil(price) ->
        nil

      status == "closed" ->
        nil

      true ->
        %{
          "market_key" => state.market_key,
          "selection_key" => state.selection_key,
          "label" => state.selection_key,
          "outcome" => state.selection_key,
          "odds_value" => normalize_reference_price(price),
          "availability_status" => status,
          "availability_reason" =>
            source_snapshot["reason"] || source_snapshot["suspension_reason"],
          "source_external_id" => "#{source_name}:#{state.market_key}:#{state.selection_key}",
          "provider_snapshot" => %{
            "selection_key" => state.selection_key,
            "market_key" => state.market_key,
            "source_name" => source_name,
            "source_snapshot" => source_snapshot,
            "canonical_payload" => state.payload || %{},
            "observed_at_ms" => source_snapshot["observed_at_ms"] || state.high_water_mark_ms
          }
        }
    end
  end

  defp normalize_source_reference_status(status) when status in ["active", "suspended", "closed"],
    do: status

  defp normalize_source_reference_status(status) when is_binary(status) do
    case String.downcase(String.trim(status)) do
      "active" -> "active"
      "suspended" -> "suspended"
      "closed" -> "closed"
      "paused" -> "suspended"
      "blocked" -> "suspended"
      _ -> "active"
    end
  end

  defp normalize_source_reference_status(_), do: "active"

  defp normalize_reference_price(%Decimal{} = value), do: value
  defp normalize_reference_price(value) when is_binary(value), do: value
  defp normalize_reference_price(value) when is_integer(value) or is_float(value), do: value
  defp normalize_reference_price(_), do: nil

  def canonical_market_changed?(nil, %CanonicalMarketState{}), do: true

  def canonical_market_changed?(
        %CanonicalMarketState{} = current,
        %CanonicalMarketState{} = incoming
      ) do
    current.status != incoming.status or
      current.suspension_reason != incoming.suspension_reason or
      (current.suspension_sources || []) != (incoming.suspension_sources || []) or
      current.last_consensus_source != incoming.last_consensus_source or
      current.consensus_version != incoming.consensus_version or
      current.last_consensus_at != incoming.last_consensus_at
  end

  def list_match_mapping_suggestions(params \\ %{}) do
    status = blank_to_nil(params["status"] || params[:status])
    source_name = blank_to_nil(params["source_name"] || params[:source_name])
    competition = blank_to_nil(params["competition"] || params[:competition])

    SourceMatchMappingSuggestion
    |> preload(candidate_canonical_match: [:home_team, :away_team])
    |> maybe_filter_suggestion_status(status)
    |> maybe_filter_suggestion_source(source_name)
    |> order_by([s], asc: s.mapping_status, desc: s.updated_at, desc: s.inserted_at)
    |> Repo.all()
    |> maybe_filter_suggestion_competition(competition)
  end

  def replay_scraper_configurations do
    list_scraper_configurations()
    |> Enum.each(fn configuration ->
      _ = publish_scraper_control(scraper_configuration_json(configuration))
    end)

    :ok
  end

  def replay_scraper_configuration(id) when is_binary(id) do
    case get_scraper_configuration(id) do
      %ScraperConfiguration{} = configuration ->
        payload = scraper_configuration_json(configuration)
        _ = publish_scraper_control(payload)
        {:ok, payload}

      nil ->
        {:error, :scraper_configuration_not_found}
    end
  end

  def list_scraper_configurations do
    Repo.all(
      from configuration in ScraperConfiguration,
        order_by: [asc: configuration.source_name],
        preload: [:gateway]
    )
  end

  def get_scraper_configuration(id) when is_binary(id) do
    ScraperConfiguration |> Repo.get(id) |> Repo.preload([:gateway])
  end

  def list_egress_gateways do
    Repo.all(
      from gateway in EgressGateway,
        order_by: [desc: gateway.is_default_direct, asc: gateway.name]
    )
  end

  def get_egress_gateway(id) when is_binary(id) do
    Repo.get(EgressGateway, id)
  end

  def create_egress_gateway(attrs) do
    %EgressGateway{}
    |> EgressGateway.changeset(attrs)
    |> Repo.insert()
  end

  def update_egress_gateway(%EgressGateway{} = gateway, attrs) do
    gateway
    |> EgressGateway.changeset(attrs)
    |> Repo.update()
  end

  def delete_egress_gateway(%EgressGateway{} = gateway) do
    Repo.delete(gateway)
  end

  def create_scraper_configuration(attrs) do
    %ScraperConfiguration{}
    |> ScraperConfiguration.changeset(attrs)
    |> Repo.insert()
    |> preload_scraper_gateway()
    |> maybe_publish_scraper_configuration()
  end

  def update_scraper_configuration(%ScraperConfiguration{} = configuration, attrs) do
    configuration
    |> ScraperConfiguration.changeset(attrs)
    |> Repo.update()
    |> preload_scraper_gateway()
    |> maybe_publish_scraper_configuration()
  end

  def delete_scraper_configuration(%ScraperConfiguration{} = configuration) do
    publish_scraper_control(
      scraper_configuration_json(configuration, deleted: true, is_active: false)
    )

    Repo.delete(configuration)
  end

  def matchmaker_health do
    latest_suggestion =
      Repo.one(
        from suggestion in SourceMatchMappingSuggestion,
          order_by: [desc: suggestion.updated_at, desc: suggestion.inserted_at],
          limit: 1
      )

    consumer_status = Back.MultiSource.RedisConsumer.status()

    %{
      arbiter_enabled: FeatureFlags.multi_source_arbiter_enabled?(),
      canonical_live_trading_enabled: FeatureFlags.canonical_live_trading_enabled?(),
      redis_pubsub_running: is_pid(Process.whereis(Back.MultiSource.RedisPubSub)),
      redis_consumer: consumer_status,
      suggestion_count: Repo.aggregate(SourceMatchMappingSuggestion, :count, :id),
      latest_suggestion_at:
        latest_suggestion &&
          (latest_suggestion.updated_at || latest_suggestion.inserted_at)
    }
  end

  def automation_status do
    now = DateTime.utc_now()
    runtime = CricketRuntimeConfig.resolve()

    %{
      generated_at: now,
      ai_enabled: runtime.llm_enabled,
      ai_model: runtime.model,
      pending_source_fetches:
        Repo.aggregate(
          from(status in MatchSourceRefreshStatus, where: status.last_status == "requested"),
          :count,
          :id
        ),
      completed_source_fetches_24h:
        Repo.aggregate(
          from(status in MatchSourceRefreshStatus,
            where:
              status.last_status == "completed" and
                not is_nil(status.last_completed_at) and
                status.last_completed_at >= ^DateTime.add(now, -24 * 3600, :second)
          ),
          :count,
          :id
        ),
      timed_out_source_fetches_24h:
        Repo.aggregate(
          from(status in MatchSourceRefreshStatus,
            where:
              status.last_status == "timed_out" and
                not is_nil(status.last_completed_at) and
                status.last_completed_at >= ^DateTime.add(now, -24 * 3600, :second)
          ),
          :count,
          :id
        ),
      auto_confirmed_mappings_24h:
        Repo.aggregate(
          from(suggestion in SourceMatchMappingSuggestion,
            where:
              suggestion.mapping_status == "manual_confirmed" and
                suggestion.matched_via == "ai_auto_match" and
                not is_nil(suggestion.reviewed_at) and
                suggestion.reviewed_at >= ^DateTime.add(now, -24 * 3600, :second)
          ),
          :count,
          :id
        ),
      open_live_cricket_suggestions:
        Repo.aggregate(
          from(suggestion in SourceMatchMappingSuggestion,
            join: candidate in CanonicalMatch,
            on: candidate.id == suggestion.candidate_canonical_match_id,
            join: imported in Match,
            on:
              imported.provider == candidate.anchor_source_name and
                imported.external_id == candidate.anchor_source_match_id,
            where:
              suggestion.source_name == "one_x_bet_worker" and
                suggestion.mapping_status in ["suggested", "needs_review"] and
                imported.sport == :cricket and imported.status in [:live, :upcoming]
          ),
          :count,
          :id
        ),
      workers: %{
        orchestrator: Settings.get("multi_source_cricket_orchestrator_status", %{}),
        refresh_timeout: Settings.get("multi_source_refresh_timeout_status", %{}),
        matchmaker_prune: Settings.get("multi_source_matchmaker_prune_status", %{})
      }
    }
  end

  def list_automation_events(opts \\ []) do
    limit =
      opts
      |> Keyword.get(:limit, 50)
      |> normalize_positive_integer(50)
      |> min(200)

    from(event in AutomationEvent,
      order_by: [desc: event.inserted_at],
      limit: ^limit
    )
    |> Repo.all()
  end

  def list_cricket_polling_profiles do
    runtime = CricketRuntimeConfig.resolve()
    now = DateTime.utc_now()

    matches =
      Match
      |> where([m], m.sport == :cricket)
      |> join(:inner, [m], feed in assoc(m, :competition_feed))
      |> join(:inner, [_m, feed], provider in Provider, on: provider.id == feed.provider_id)
      |> where(
        [_m, feed, provider],
        feed.enabled == true and feed.sport == "cricket" and provider.name == "sportmonks"
      )
      |> preload([_m, feed, _provider], competition_feed: feed)
      |> order_by([m, _feed], asc: m.start_time, asc: m.team1, asc: m.team2)
      |> Repo.all()

    source_mapping_index = load_one_x_bet_source_mapping_index(matches)
    source_refresh_status_index = load_source_refresh_status_index(matches)

    profiles =
      Enum.map(
        matches,
        &build_cricket_polling_profile(
          &1,
          now,
          runtime,
          source_mapping_index,
          source_refresh_status_index
        )
      )

    %{
      ai_enabled: runtime.llm_enabled,
      ai_model: runtime.model,
      generated_at: now,
      summary: summarize_polling_profiles(profiles),
      data: profiles
    }
  end

  def get_cricket_polling_profile(match_id) when is_binary(match_id) do
    runtime = CricketRuntimeConfig.resolve()
    now = DateTime.utc_now()

    Match
    |> where([m], m.id == ^match_id and m.sport == :cricket)
    |> join(:inner, [m], feed in assoc(m, :competition_feed))
    |> join(:inner, [_m, feed], provider in Provider, on: provider.id == feed.provider_id)
    |> where(
      [_m, feed, provider],
      feed.enabled == true and feed.sport == "cricket" and provider.name == "sportmonks"
    )
    |> preload([_m, feed, _provider], competition_feed: feed)
    |> Repo.one()
    |> case do
      %Match{} = match ->
        source_mapping_index = load_one_x_bet_source_mapping_index([match])
        source_refresh_status_index = load_source_refresh_status_index([match])

        {:ok,
         build_cricket_polling_profile(
           match,
           now,
           runtime,
           source_mapping_index,
           source_refresh_status_index
         )}

      nil ->
        {:error, :match_not_found}
    end
  end

  def get_cricket_source_refresh_advisory(match_id) when is_binary(match_id) do
    with :error <- cached_source_refresh_advisory(match_id),
         {:ok, profile} <- get_cricket_polling_profile(match_id),
         %Match{} = match <- Repo.get(Match, match_id),
         {:ok, advisory} <- LangGraphClient.source_refresh_policy(match, profile) do
      cache_source_refresh_advisory(match_id, advisory)
      {:ok, advisory}
    else
      {:ok, advisory} -> {:ok, advisory}
      nil -> {:error, :match_not_found}
      error -> error
    end
  end

  def automate_cricket_source_refreshes(opts \\ []) do
    limit =
      opts
      |> Keyword.get(:limit, 12)
      |> normalize_positive_integer(12)

    now = DateTime.utc_now()

    profiles =
      list_cricket_polling_profiles()
      |> Map.get(:data, [])
      |> Enum.filter(&eligible_for_automated_source_refresh?(&1, now))
      |> Enum.sort_by(&automation_priority_score/1, :desc)
      |> Enum.take(limit)

    Enum.reduce(
      profiles,
      %{evaluated: length(profiles), requested: 0, skipped: 0, failed: 0, matches: []},
      fn profile, acc ->
        case maybe_automate_profile_refresh(profile) do
          {:ok, :requested, details} ->
            _ =
              log_automation_event(%{
                event_type: "source_refresh_requested",
                status: "requested",
                match_id: details[:match_id],
                source_name: "one_x_bet_worker",
                source_match_id: details[:source_match_id],
                message: details[:reason],
                metadata: %{"confidence" => details[:confidence]}
              })

            %{
              acc
              | requested: acc.requested + 1,
                matches: [Map.put(details, :action, "requested") | acc.matches]
            }

          {:ok, :skipped, details} ->
            %{
              acc
              | skipped: acc.skipped + 1,
                matches: [Map.put(details, :action, "skipped") | acc.matches]
            }

          {:error, reason, details} ->
            _ =
              log_automation_event(%{
                event_type: "source_refresh_requested",
                status: "failed",
                match_id: details[:match_id],
                source_name: "one_x_bet_worker",
                source_match_id: details[:source_match_id],
                message: "automated source refresh failed",
                metadata: %{"error" => inspect(reason)}
              })

            %{
              acc
              | failed: acc.failed + 1,
                matches: [
                  details |> Map.put(:action, "failed") |> Map.put(:error, inspect(reason))
                  | acc.matches
                ]
            }
        end
      end
    )
    |> Map.update!(:matches, &Enum.reverse/1)
  end

  def automate_live_cricket_suggestion_mappings(opts \\ []) do
    limit =
      opts
      |> Keyword.get(:limit, 10)
      |> normalize_positive_integer(10)

    candidates =
      from(suggestion in SourceMatchMappingSuggestion,
        join: candidate in assoc(suggestion, :candidate_canonical_match),
        join: imported in Match,
        on:
          imported.provider == candidate.anchor_source_name and
            imported.external_id == candidate.anchor_source_match_id,
        join: feed in CompetitionFeed,
        on: feed.id == imported.competition_feed_id,
        join: provider in Provider,
        on: provider.id == feed.provider_id,
        where:
          suggestion.source_name == "one_x_bet_worker" and
            suggestion.mapping_status == "suggested" and
            not is_nil(suggestion.candidate_canonical_match_id) and
            suggestion.confidence >= ^@auto_match_min_confidence and
            imported.sport == :cricket and
            imported.status in [:live, :upcoming] and
            feed.enabled == true and
            feed.sport == "cricket" and
            provider.name == "sportmonks",
        preload: [candidate_canonical_match: [:home_team, :away_team]],
        order_by: [
          desc: suggestion.confidence,
          asc: suggestion.kickoff_delta_seconds,
          asc: suggestion.inserted_at
        ],
        limit: ^limit
      )
      |> Repo.all()

    Enum.reduce(
      candidates,
      %{evaluated: length(candidates), auto_confirmed: 0, skipped: 0, failed: 0, suggestions: []},
      fn suggestion, acc ->
        case auto_confirm_match_mapping_suggestion(suggestion) do
          {:ok, updated} ->
            %{
              acc
              | auto_confirmed: acc.auto_confirmed + 1,
                suggestions: [
                  %{
                    source_name: updated.source_name,
                    source_match_id: updated.source_match_id,
                    canonical_match_id: updated.candidate_canonical_match_id,
                    confidence: updated.confidence
                  }
                  | acc.suggestions
                ]
            }

          {:skip, reason} ->
            %{
              acc
              | skipped: acc.skipped + 1,
                suggestions: [
                  %{source_match_id: suggestion.source_match_id, skipped: reason}
                  | acc.suggestions
                ]
            }

          {:error, reason} ->
            %{
              acc
              | failed: acc.failed + 1,
                suggestions: [
                  %{source_match_id: suggestion.source_match_id, error: inspect(reason)}
                  | acc.suggestions
                ]
            }
        end
      end
    )
    |> Map.update!(:suggestions, &Enum.reverse/1)
  end

  def trigger_one_x_bet_match_fetch(match_id) when is_binary(match_id) do
    with {:ok, profile} <- get_cricket_polling_profile(match_id),
         source_match_id when is_binary(source_match_id) <-
           profile[:source_match_id] || profile["source_match_id"],
         source_name when is_binary(source_name) <-
           profile[:source_name] || profile["source_name"],
         {:ok, _status} <-
           upsert_source_refresh_status(%{
             match_id: match_id,
             source_name: source_name,
             source_match_id: source_match_id,
             last_status: "requested",
             last_requested_at: DateTime.utc_now(),
             last_message: "one-shot source refresh requested from Matchmaker",
             metadata: %{"requested_via" => "matchmaker"}
           }),
         {:ok, _} <-
           publish_scraper_action(%{
             source_name: source_name,
             action: "fetch_match_once",
             match_id: match_id,
             source_match_id: source_match_id
           }) do
      {:ok, %{source_name: source_name, source_match_id: source_match_id}}
    else
      nil -> {:error, :source_mapping_not_found}
      false -> {:error, :source_mapping_not_found}
      error -> error
    end
  end

  def record_source_refresh_result(%{"match_id" => match_id} = payload)
      when is_binary(match_id) do
    with {:ok, profile} <- get_cricket_polling_profile(match_id),
         source_name when is_binary(source_name) <-
           payload["source_name"] || profile["source_name"],
         source_match_id when is_binary(source_match_id) <-
           payload["source_match_id"] || profile["source_match_id"] do
      _ =
        log_automation_event(%{
          event_type: "source_refresh_result",
          status: payload["status"] || "unknown",
          match_id: match_id,
          source_name: source_name,
          source_match_id: source_match_id,
          message: payload["message"] || payload["error"] || "scraper action processed",
          metadata: %{"published_envelopes" => payload["published_envelopes"]}
        })

      upsert_source_refresh_status(%{
        match_id: match_id,
        source_name: source_name,
        source_match_id: source_match_id,
        last_status: payload["status"] || "unknown",
        last_completed_at: DateTime.utc_now(),
        last_message: payload["message"] || payload["error"] || "scraper action processed",
        metadata: %{
          "published_envelopes" => payload["published_envelopes"],
          "result_source" => "scraper_action_result"
        }
      })
    else
      _ -> {:error, :source_mapping_not_found}
    end
  end

  def expire_stuck_source_refresh_requests(opts \\ []) do
    timeout_seconds =
      opts
      |> Keyword.get(:timeout_seconds, 120)
      |> normalize_positive_integer(120)

    cutoff = DateTime.add(DateTime.utc_now(), -timeout_seconds, :second)

    stale_statuses =
      from(status in MatchSourceRefreshStatus,
        where:
          status.last_status == "requested" and
            not is_nil(status.last_requested_at) and
            status.last_requested_at < ^cutoff
      )
      |> Repo.all()

    Enum.reduce(stale_statuses, %{timed_out: 0, matches: []}, fn status, acc ->
      metadata =
        Map.merge(status.metadata || %{}, %{
          "timeout_seconds" => timeout_seconds,
          "timed_out_at" => DateTime.utc_now()
        })

      case upsert_source_refresh_status(%{
             match_id: status.match_id,
             source_name: status.source_name,
             source_match_id: status.source_match_id,
             last_status: "timed_out",
             last_completed_at: DateTime.utc_now(),
             last_message: "one-shot source refresh timed out waiting for scraper result",
             metadata: metadata
           }) do
        {:ok, _updated} ->
          _ =
            log_automation_event(%{
              event_type: "source_refresh_timeout",
              status: "timed_out",
              match_id: status.match_id,
              source_name: status.source_name,
              source_match_id: status.source_match_id,
              message: "one-shot source refresh timed out waiting for scraper result",
              metadata: metadata
            })

          %{
            acc
            | timed_out: acc.timed_out + 1,
              matches: [
                %{
                  match_id: status.match_id,
                  source_name: status.source_name,
                  source_match_id: status.source_match_id
                }
                | acc.matches
              ]
          }

        _ ->
          acc
      end
    end)
    |> Map.update!(:matches, &Enum.reverse/1)
  end

  def get_match_mapping_suggestion(source_name, source_match_id)
      when is_binary(source_name) and is_binary(source_match_id) do
    SourceMatchMappingSuggestion
    |> preload(candidate_canonical_match: [:home_team, :away_team])
    |> Repo.get_by(source_name: source_name, source_match_id: source_match_id)
  end

  def approve_match_mapping_suggestion(source_name, source_match_id, attrs, reviewer_id) do
    with %SourceMatchMappingSuggestion{} = suggestion <-
           get_match_mapping_suggestion(source_name, source_match_id),
         canonical_match_id when is_binary(canonical_match_id) <-
           resolve_target_canonical_match_id(suggestion, attrs),
         %CanonicalMatch{} = canonical_match <-
           Repo.get(CanonicalMatch, canonical_match_id) |> Repo.preload([:home_team, :away_team]),
         {:ok, _mapping} <- promote_suggestion_to_mapping(suggestion, canonical_match_id),
         {:ok, updated_suggestion} <-
           update_suggestion_review(suggestion, %{
             candidate_canonical_match_id: canonical_match_id,
             mapping_status: "manual_confirmed",
             matched_via: "manual_admin",
             reviewed_by_id: reviewer_id,
             reviewed_at: DateTime.utc_now(),
             review_note: blank_to_nil(attrs["note"] || attrs[:note]),
             confidence: 1.0,
             candidate_snapshot: build_candidate_snapshot(canonical_match)
           }) do
      {:ok, Repo.preload(updated_suggestion, candidate_canonical_match: [:home_team, :away_team])}
    else
      nil -> {:error, :match_mapping_suggestion_not_found}
      false -> {:error, :canonical_match_id_required}
      _ -> {:error, :canonical_match_not_found}
    end
  end

  def reject_match_mapping_suggestion(source_name, source_match_id, attrs, reviewer_id) do
    with %SourceMatchMappingSuggestion{} = suggestion <-
           get_match_mapping_suggestion(source_name, source_match_id),
         {:ok, updated_suggestion} <-
           update_suggestion_review(suggestion, %{
             mapping_status: "rejected",
             reviewed_by_id: reviewer_id,
             reviewed_at: DateTime.utc_now(),
             review_note:
               blank_to_nil(attrs["reason"] || attrs[:reason] || attrs["note"] || attrs[:note])
           }) do
      {:ok, Repo.preload(updated_suggestion, candidate_canonical_match: [:home_team, :away_team])}
    else
      nil -> {:error, :match_mapping_suggestion_not_found}
    end
  end

  def manual_link_match_mapping_suggestion(source_name, source_match_id, attrs, reviewer_id) do
    approve_match_mapping_suggestion(source_name, source_match_id, attrs, reviewer_id)
  end

  def list_canonical_matches(params \\ %{}) do
    sport = blank_to_nil(params["sport"] || params[:sport])
    query = blank_to_nil(params["query"] || params[:query])

    CanonicalMatch
    |> preload([:home_team, :away_team])
    |> maybe_filter_canonical_sport(sport)
    |> maybe_filter_canonical_query(query)
    |> order_by([m], asc: m.start_time)
    |> limit(25)
    |> Repo.all()
  end

  def create_match_mapping_suggestion(attrs) do
    %SourceMatchMappingSuggestion{}
    |> SourceMatchMappingSuggestion.changeset(attrs)
    |> Repo.insert(
      on_conflict: [
        set: [
          candidate_canonical_match_id: attrs[:candidate_canonical_match_id],
          confidence: attrs[:confidence] || attrs["confidence"] || 0.0,
          matched_via: attrs[:matched_via] || attrs["matched_via"] || "fuzzy_candidate",
          kickoff_delta_seconds:
            attrs[:kickoff_delta_seconds] || attrs["kickoff_delta_seconds"] || 0,
          mapping_status: attrs[:mapping_status] || attrs["mapping_status"] || "suggested",
          source_snapshot: attrs[:source_snapshot] || attrs["source_snapshot"] || %{},
          candidate_snapshot: attrs[:candidate_snapshot] || attrs["candidate_snapshot"] || %{},
          updated_at: DateTime.utc_now()
        ]
      ],
      conflict_target: [:source_name, :source_match_id]
    )
  end

  def inject_test_match_mapping_suggestion do
    timestamp = System.system_time(:second)

    attrs = %{
      source_name: @demo_source_name,
      source_match_id: "demo-match-#{timestamp}",
      confidence: 0.0,
      matched_via: "dev_injected",
      kickoff_delta_seconds: 0,
      mapping_status: "needs_review",
      source_snapshot: %{
        "id" => "demo-match-#{timestamp}",
        "competition" => %{"name" => "Local Matchmaker Check"},
        "start_time" =>
          DateTime.utc_now() |> DateTime.add(1800, :second) |> DateTime.to_iso8601(),
        "sport" => "football",
        "home_team" => %{"id" => "demo-home-#{timestamp}", "name" => "Operator XI"},
        "away_team" => %{"id" => "demo-away-#{timestamp}", "name" => "Review Queue FC"},
        "raw" => %{"kind" => "matchmaker_test_injection"}
      },
      candidate_snapshot: %{}
    }

    create_match_mapping_suggestion(attrs)
  end

  def prune_invalid_matchmaker_suggestions do
    {count, _} =
      from(s in SourceMatchMappingSuggestion,
        where:
          s.source_name == "one_x_bet_worker" and
            (like(s.source_match_id, "sports_short:%") or
               fragment(
                 "coalesce(?->'home_team'->>'name', '') = '' or coalesce(?->'away_team'->>'name', '') = ''",
                 s.source_snapshot,
                 s.source_snapshot
               ))
      )
      |> Repo.delete_all()

    {:ok, %{deleted_count: count}}
  end

  def store_automation_status(key, payload) when is_binary(key) and is_map(payload) do
    Settings.put(key, payload)
  end

  def automation_event_json(%AutomationEvent{} = event) do
    %{
      id: event.id,
      event_type: event.event_type,
      status: event.status,
      source_name: event.source_name,
      source_match_id: event.source_match_id,
      match_id: event.match_id,
      canonical_match_id: event.canonical_match_id,
      message: event.message,
      metadata: event.metadata || %{},
      inserted_at: event.inserted_at,
      updated_at: event.updated_at
    }
  end

  def ingest_unmapped_match_suggestion(%Envelope{} = envelope, source_match_id)
      when is_binary(source_match_id) do
    payload = envelope.payload || %{}

    if valid_matchmaker_payload?(source_match_id, payload) do
      source_snapshot = build_source_snapshot(source_match_id, payload)
      candidate_match = find_suggested_canonical_match(payload)

      attrs = %{
        source_name: envelope.source_name,
        source_match_id: source_match_id,
        candidate_canonical_match_id: candidate_match && candidate_match.id,
        confidence:
          if(candidate_match, do: suggestion_confidence(payload, candidate_match), else: 0.0),
        matched_via: if(candidate_match, do: "fuzzy_candidate", else: "needs_review"),
        kickoff_delta_seconds: kickoff_delta_seconds(payload, candidate_match),
        mapping_status: if(candidate_match, do: "suggested", else: "needs_review"),
        source_snapshot: source_snapshot,
        candidate_snapshot: build_candidate_snapshot(candidate_match)
      }

      create_match_mapping_suggestion(attrs)
    else
      {:error, :ignored_non_match_payload}
    end
  end

  def suggestion_json(%SourceMatchMappingSuggestion{} = suggestion) do
    %{
      id: suggestion.id,
      source_name: suggestion.source_name,
      source_match_id: suggestion.source_match_id,
      confidence: suggestion.confidence,
      matched_via: suggestion.matched_via,
      kickoff_delta_seconds: suggestion.kickoff_delta_seconds,
      mapping_status: suggestion.mapping_status,
      source_snapshot: suggestion.source_snapshot || %{},
      candidate_snapshot:
        if suggestion.candidate_snapshot in [%{}, nil] do
          build_candidate_snapshot(suggestion.candidate_canonical_match)
        else
          suggestion.candidate_snapshot || %{}
        end,
      candidate_canonical_match: canonical_match_json(suggestion.candidate_canonical_match),
      reviewed_by_id: suggestion.reviewed_by_id,
      reviewed_at: suggestion.reviewed_at,
      review_note: suggestion.review_note,
      inserted_at: suggestion.inserted_at,
      updated_at: suggestion.updated_at
    }
  end

  def scraper_configuration_json(%ScraperConfiguration{} = configuration, overrides \\ []) do
    gateway = configuration.gateway

    %{
      id: configuration.id,
      source_name: configuration.source_name,
      transport: configuration.transport,
      bootstrap_url: configuration.bootstrap_url,
      ws_url: configuration.ws_url,
      poll_url: configuration.poll_url,
      proxy_url: configuration.proxy_url || (gateway && gateway.url),
      gateway_id: configuration.gateway_id,
      gateway: egress_gateway_json(gateway),
      is_active: Keyword.get(overrides, :is_active, configuration.is_active),
      deleted: Keyword.get(overrides, :deleted, false),
      updated_at: configuration.updated_at,
      inserted_at: configuration.inserted_at
    }
  end

  def egress_gateway_json(%EgressGateway{} = gateway) do
    %{
      id: gateway.id,
      name: gateway.name,
      url: gateway.url,
      is_default_direct: gateway.is_default_direct,
      inserted_at: gateway.inserted_at,
      updated_at: gateway.updated_at
    }
  end

  def egress_gateway_json(_), do: nil

  def canonical_match_json(%CanonicalMatch{} = match) do
    %{
      id: match.id,
      sport: match.sport,
      competition_name: match.competition_name,
      start_time: match.start_time,
      anchor_source_name: match.anchor_source_name,
      anchor_source_match_id: match.anchor_source_match_id,
      status: match.status,
      home_team: team_json(match.home_team),
      away_team: team_json(match.away_team),
      metadata: match.metadata || %{}
    }
  end

  def canonical_match_json(_), do: nil

  def cricket_polling_profile_json(profile) when is_map(profile), do: profile

  defp preload_scraper_gateway({:ok, %ScraperConfiguration{} = configuration}) do
    {:ok, Repo.preload(configuration, [:gateway])}
  end

  defp preload_scraper_gateway(result), do: result

  defp build_cricket_polling_profile(
         %Match{} = match,
         now,
         runtime,
         source_mapping_index,
         source_refresh_status_index
       ) do
    status = match.status && to_string(match.status)
    seconds_to_start = seconds_to_start(match.start_time, now)
    live_context_age_seconds = seconds_since(match.last_live_event_at, now)
    stale_live_context? = live_context_stale?(match, live_context_age_seconds)
    suspended? = not is_nil(match.suspended_at)
    phase = polling_phase(match, seconds_to_start, stale_live_context?, suspended?)
    interval_seconds = recommended_interval_seconds(phase)

    risk_flags =
      polling_risk_flags(match, seconds_to_start, stale_live_context?, suspended?, runtime)

    source_refresh_required =
      Enum.any?(
        risk_flags,
        &(&1 in ["score_context_stale", "live_without_in_play", "suspended_markets"])
      )

    %{
      match_id: match.id,
      competition_feed_id: match.competition_feed_id,
      competition_name: competition_name(match),
      team1: match.team1,
      team2: match.team2,
      status: status,
      start_time: match.start_time,
      in_play_enabled: match.in_play_enabled,
      current_innings: match.current_innings,
      current_over: decimal_to_string(match.current_over),
      current_ball_in_over: match.current_ball_in_over,
      last_ball_event_type: match.last_ball_event_type,
      last_live_event_at: match.last_live_event_at,
      suspended_at: match.suspended_at,
      suspension_reason: match.suspension_reason,
      source_refresh_phase: phase,
      recommended_poll_interval_seconds: interval_seconds,
      source_refresh_required: source_refresh_required,
      source_name: get_in(source_mapping_index, [match.id, :source_name]),
      source_match_id: get_in(source_mapping_index, [match.id, :source_match_id]),
      source_fetch_enabled: is_binary(get_in(source_mapping_index, [match.id, :source_match_id])),
      source_refresh_status:
        source_refresh_status_json(Map.get(source_refresh_status_index, match.id)),
      ai_policy:
        if runtime.llm_enabled do
          if phase in ["hot_live", "cooldown"],
            do: "cadence_and_cleanup",
            else: "rerank_and_review"
        else
          "rules_only"
        end,
      ai_model: runtime.model,
      rationale: polling_rationale(phase, seconds_to_start, stale_live_context?, suspended?),
      risk_flags: risk_flags
    }
  end

  defp load_one_x_bet_source_mapping_index(matches) when is_list(matches) do
    imported_ids = Enum.map(matches, & &1.id)

    if imported_ids == [] do
      %{}
    else
      from(imported in Match,
        join: canonical in CanonicalMatch,
        on:
          canonical.anchor_source_name == imported.provider and
            canonical.anchor_source_match_id == imported.external_id,
        join: mapping in SourceMatchMapping,
        on:
          mapping.canonical_match_id == canonical.id and
            mapping.source_name == "one_x_bet_worker",
        where: imported.id in ^imported_ids,
        select: %{
          imported_match_id: imported.id,
          canonical_match_id: canonical.id,
          source_name: mapping.source_name,
          source_match_id: mapping.source_match_id
        }
      )
      |> Repo.all()
      |> Map.new(fn row ->
        {row.imported_match_id,
         %{
           canonical_match_id: row.canonical_match_id,
           source_name: row.source_name,
           source_match_id: row.source_match_id
         }}
      end)
    end
  end

  defp load_source_refresh_status_index(matches) when is_list(matches) do
    match_ids = Enum.map(matches, & &1.id)

    if match_ids == [] do
      %{}
    else
      from(status in MatchSourceRefreshStatus, where: status.match_id in ^match_ids)
      |> Repo.all()
      |> Map.new(fn status -> {status.match_id, status} end)
    end
  end

  defp source_refresh_status_json(%MatchSourceRefreshStatus{} = status) do
    %{
      last_status: status.last_status,
      last_requested_at: status.last_requested_at,
      last_completed_at: status.last_completed_at,
      last_message: status.last_message,
      metadata: status.metadata || %{}
    }
  end

  defp source_refresh_status_json(_), do: nil

  defp summarize_polling_profiles(profiles) do
    Enum.reduce(
      profiles,
      %{
        total: length(profiles),
        hot_live: 0,
        warmup: 0,
        scheduled: 0,
        cooldown: 0,
        archived: 0,
        needs_source_refresh: 0
      },
      fn profile, acc ->
        acc
        |> Map.update(profile.source_refresh_phase |> String.to_atom(), 1, &(&1 + 1))
        |> then(fn summary ->
          if profile.source_refresh_required do
            Map.update!(summary, :needs_source_refresh, &(&1 + 1))
          else
            summary
          end
        end)
      end
    )
  end

  defp polling_phase(%Match{status: status}, _seconds_to_start, _stale?, _suspended?)
       when status in [:closed, :settled, :cancelled],
       do: "archived"

  defp polling_phase(%Match{status: :live}, _seconds_to_start, _stale?, true), do: "cooldown"
  defp polling_phase(%Match{status: :live}, _seconds_to_start, true, _suspended?), do: "hot_live"

  defp polling_phase(
         %Match{status: :live, in_play_enabled: true},
         _seconds_to_start,
         _stale?,
         _suspended?
       ), do: "hot_live"

  defp polling_phase(%Match{status: :live}, _seconds_to_start, _stale?, _suspended?), do: "warmup"

  defp polling_phase(_match, seconds_to_start, _stale?, _suspended?)
       when is_integer(seconds_to_start) and seconds_to_start <= 900, do: "warmup"

  defp polling_phase(_match, seconds_to_start, _stale?, _suspended?)
       when is_integer(seconds_to_start) and seconds_to_start <= 7200, do: "scheduled"

  defp polling_phase(_match, _seconds_to_start, _stale?, _suspended?), do: "scheduled"

  defp recommended_interval_seconds("hot_live"), do: 5
  defp recommended_interval_seconds("cooldown"), do: 30
  defp recommended_interval_seconds("warmup"), do: 60
  defp recommended_interval_seconds("scheduled"), do: 600
  defp recommended_interval_seconds("archived"), do: 0
  defp recommended_interval_seconds(_), do: 600

  defp polling_rationale("archived", _seconds_to_start, _stale?, _suspended?),
    do: "Match is no longer active. Keep existing history, but stop source polling."

  defp polling_rationale("cooldown", _seconds_to_start, _stale?, _suspended?),
    do: "Markets are suspended. Slow the source and wait for the next valid state transition."

  defp polling_rationale("hot_live", _seconds_to_start, true, _suspended?),
    do:
      "Live context is stale or ambiguous. Re-fetch source odds aggressively until score and availability converge."

  defp polling_rationale("hot_live", _seconds_to_start, false, _suspended?),
    do:
      "Match is live and in-play. Keep fast source refresh while AI handles cleanup and escalation only."

  defp polling_rationale("warmup", seconds_to_start, _stale?, _suspended?)
       when is_integer(seconds_to_start) and seconds_to_start > 0,
       do:
         "Match is close to start. Warm the source at a moderate cadence so first in-play markets arrive cleanly."

  defp polling_rationale("warmup", _seconds_to_start, _stale?, _suspended?),
    do:
      "Match is active without full in-play confidence. Keep moderate refresh until live state stabilizes."

  defp polling_rationale("scheduled", _seconds_to_start, _stale?, _suspended?),
    do:
      "Match is scheduled but not live. Poll conservatively to reduce cost and avoid unnecessary source pressure."

  defp polling_risk_flags(match, seconds_to_start, stale_live_context?, suspended?, runtime) do
    []
    |> maybe_add_flag(suspended?, "suspended_markets")
    |> maybe_add_flag(match.status == :live and not match.in_play_enabled, "live_without_in_play")
    |> maybe_add_flag(stale_live_context?, "score_context_stale")
    |> maybe_add_flag(
      is_integer(seconds_to_start) and seconds_to_start < -1800 and match.status == :upcoming,
      "status_drift"
    )
    |> maybe_add_flag(not runtime.llm_enabled, "ai_disabled")
  end

  defp maybe_add_flag(flags, true, flag), do: flags ++ [flag]
  defp maybe_add_flag(flags, false, _flag), do: flags

  defp live_context_stale?(%Match{status: :live}, age_seconds) when is_integer(age_seconds),
    do: age_seconds > 90

  defp live_context_stale?(%Match{status: :live, last_live_event_at: nil}, _age_seconds), do: true
  defp live_context_stale?(_, _), do: false

  defp seconds_to_start(%DateTime{} = start_time, now),
    do: DateTime.diff(start_time, now, :second)

  defp seconds_to_start(_, _), do: nil

  defp seconds_since(%DateTime{} = timestamp, now),
    do: max(DateTime.diff(now, timestamp, :second), 0)

  defp seconds_since(_, _), do: nil

  defp decimal_to_string(nil), do: nil
  defp decimal_to_string(value), do: to_string(value)

  defp competition_name(%Match{} = match) do
    get_in(match.raw_data || %{}, ["_competition_feed", "name"]) ||
      (match.competition_feed && match.competition_feed.name) ||
      "Imported cricket feed"
  end

  defp promote_suggestion_to_mapping(
         %SourceMatchMappingSuggestion{} = suggestion,
         canonical_match_id
       ) do
    attrs = %{
      canonical_match_id: canonical_match_id,
      source_name: suggestion.source_name,
      source_match_id: suggestion.source_match_id,
      home_source_team_id: get_in(suggestion.source_snapshot || %{}, ["home_team", "id"]),
      away_source_team_id: get_in(suggestion.source_snapshot || %{}, ["away_team", "id"]),
      mapping_status: "manual_confirmed",
      matched_via: "manual_admin",
      confidence: 1.0,
      kickoff_delta_seconds: suggestion.kickoff_delta_seconds,
      metadata: %{
        "source_snapshot" => suggestion.source_snapshot || %{},
        "suggestion_id" => suggestion.id
      }
    }

    case Repo.get_by(SourceMatchMapping,
           source_name: suggestion.source_name,
           source_match_id: suggestion.source_match_id
         ) do
      nil ->
        %SourceMatchMapping{}
        |> SourceMatchMapping.changeset(attrs)
        |> Repo.insert()

      mapping ->
        mapping
        |> SourceMatchMapping.changeset(attrs)
        |> Repo.update()
    end
  end

  defp update_suggestion_review(%SourceMatchMappingSuggestion{} = suggestion, attrs) do
    suggestion
    |> SourceMatchMappingSuggestion.changeset(attrs)
    |> Repo.update()
  end

  defp auto_confirm_match_mapping_suggestion(%SourceMatchMappingSuggestion{} = suggestion) do
    with false <- suggestion.mapping_status == "manual_confirmed",
         canonical_match_id when is_binary(canonical_match_id) <-
           suggestion.candidate_canonical_match_id,
         %CanonicalMatch{} = canonical_match <-
           Repo.get(CanonicalMatch, canonical_match_id) |> Repo.preload([:home_team, :away_team]),
         {:ok, _mapping} <-
           promote_suggestion_to_mapping_with_attrs(suggestion, canonical_match_id, %{
             mapping_status: "manual_confirmed",
             matched_via: "ai_auto_match",
             confidence: max(suggestion.confidence || 0.0, 0.95),
             metadata: %{"auto_confirmed" => true}
           }),
         {:ok, updated_suggestion} <-
           update_suggestion_review(suggestion, %{
             candidate_canonical_match_id: canonical_match_id,
             mapping_status: "manual_confirmed",
             matched_via: "ai_auto_match",
             reviewed_at: DateTime.utc_now(),
             review_note: "Auto-confirmed by cricket matchmaker orchestrator",
             confidence: max(suggestion.confidence || 0.0, 0.95),
             candidate_snapshot: build_candidate_snapshot(canonical_match)
           }) do
      _ =
        log_automation_event(%{
          event_type: "auto_match_confirmed",
          status: "confirmed",
          source_name: updated_suggestion.source_name,
          source_match_id: updated_suggestion.source_match_id,
          match_id: nil,
          canonical_match_id: canonical_match_id,
          message: "Live cricket mapping auto-confirmed by orchestrator",
          metadata: %{"confidence" => updated_suggestion.confidence}
        })

      {:ok, Repo.preload(updated_suggestion, candidate_canonical_match: [:home_team, :away_team])}
    else
      true -> {:skip, :already_confirmed}
      nil -> {:error, :canonical_match_not_found}
      false -> {:skip, :candidate_missing}
      error -> {:error, error}
    end
  end

  defp resolve_target_canonical_match_id(%SourceMatchMappingSuggestion{} = suggestion, attrs) do
    blank_to_nil(attrs["canonical_match_id"] || attrs[:canonical_match_id]) ||
      suggestion.candidate_canonical_match_id
  end

  defp build_source_snapshot(source_match_id, payload) do
    %{
      "id" => source_match_id,
      "competition" => %{
        "name" => payload["competition_name"] || get_in(payload, ["competition", "name"])
      },
      "start_time" => payload["start_time"] || payload["start_time_ms"] || payload["kickoff_at"],
      "sport" => payload["sport"],
      "home_team" => %{
        "id" => payload["home_team_id"] || get_in(payload, ["home_team", "id"]),
        "name" => payload["home_team_name"] || get_in(payload, ["home_team", "name"])
      },
      "away_team" => %{
        "id" => payload["away_team_id"] || get_in(payload, ["away_team", "id"]),
        "name" => payload["away_team_name"] || get_in(payload, ["away_team", "name"])
      },
      "raw" => payload
    }
  end

  defp promote_suggestion_to_mapping_with_attrs(
         %SourceMatchMappingSuggestion{} = suggestion,
         canonical_match_id,
         overrides
       )
       when is_map(overrides) do
    attrs = %{
      canonical_match_id: canonical_match_id,
      source_name: suggestion.source_name,
      source_match_id: suggestion.source_match_id,
      home_source_team_id: get_in(suggestion.source_snapshot || %{}, ["home_team", "id"]),
      away_source_team_id: get_in(suggestion.source_snapshot || %{}, ["away_team", "id"]),
      mapping_status: Map.get(overrides, :mapping_status, "manual_confirmed"),
      matched_via: Map.get(overrides, :matched_via, "manual_admin"),
      confidence: Map.get(overrides, :confidence, 1.0),
      kickoff_delta_seconds: suggestion.kickoff_delta_seconds,
      metadata:
        Map.merge(
          %{
            "source_snapshot" => suggestion.source_snapshot || %{},
            "suggestion_id" => suggestion.id
          },
          Map.get(overrides, :metadata, %{})
        )
    }

    case Repo.get_by(SourceMatchMapping,
           source_name: suggestion.source_name,
           source_match_id: suggestion.source_match_id
         ) do
      nil ->
        %SourceMatchMapping{}
        |> SourceMatchMapping.changeset(attrs)
        |> Repo.insert()

      mapping ->
        mapping
        |> SourceMatchMapping.changeset(attrs)
        |> Repo.update()
    end
  end

  defp build_candidate_snapshot(%CanonicalMatch{} = match) do
    %{
      "id" => match.id,
      "competition_name" => match.competition_name,
      "start_time" => match.start_time,
      "status" => match.status,
      "home_team" => team_json(match.home_team),
      "away_team" => team_json(match.away_team),
      "anchor_source_name" => match.anchor_source_name,
      "anchor_source_match_id" => match.anchor_source_match_id
    }
  end

  defp build_candidate_snapshot(_), do: %{}

  defp find_suggested_canonical_match(payload) do
    sport = blank_to_nil(payload["sport"])

    competition_name =
      normalize_string(payload["competition_name"] || get_in(payload, ["competition", "name"]))

    home_team =
      normalize_string(payload["home_team_name"] || get_in(payload, ["home_team", "name"]))

    away_team =
      normalize_string(payload["away_team_name"] || get_in(payload, ["away_team", "name"]))

    start_time = parse_payload_datetime(payload)
    start_window = if(start_time, do: DateTime.add(start_time, -8 * 3600, :second), else: nil)
    end_window = if(start_time, do: DateTime.add(start_time, 8 * 3600, :second), else: nil)

    candidates =
      CanonicalMatch
      |> preload([:home_team, :away_team])
      |> maybe_filter_canonical_sport(sport)
      |> maybe_filter_enabled_imported_cricket_matches(sport)
      |> maybe_filter_by_start_window(start_window, end_window)
      |> Repo.all()
      |> Enum.map(fn match ->
        score = candidate_score(match, competition_name, home_team, away_team, start_time)
        {match, score}
      end)
      |> Enum.filter(fn {_match, score} -> score > 0 end)
      |> Enum.sort_by(fn {_match, score} -> -score end)

    case maybe_ai_rank_cricket_candidate(payload, candidates) do
      %CanonicalMatch{} = match ->
        match

      _ ->
        candidates
        |> List.first()
        |> case do
          {match, _score} -> match
          nil -> nil
        end
    end
  end

  defp suggestion_confidence(payload, %CanonicalMatch{} = candidate) do
    home_team =
      normalize_string(payload["home_team_name"] || get_in(payload, ["home_team", "name"]))

    away_team =
      normalize_string(payload["away_team_name"] || get_in(payload, ["away_team", "name"]))

    competition_name =
      normalize_string(payload["competition_name"] || get_in(payload, ["competition", "name"]))

    score =
      candidate_score(
        candidate,
        competition_name,
        home_team,
        away_team,
        parse_payload_datetime(payload)
      )

    min(Float.round(score / 100.0, 3), 0.99)
  end

  defp candidate_score(
         %CanonicalMatch{} = candidate,
         competition_name,
         home_team,
         away_team,
         start_time
       ) do
    candidate_home = normalize_string(candidate.home_team && candidate.home_team.name)
    candidate_away = normalize_string(candidate.away_team && candidate.away_team.name)
    candidate_competition = normalize_string(candidate.competition_name)

    home_score =
      if home_team != "" and
           (home_team == candidate_home or String.contains?(candidate_home, home_team) or
              String.contains?(home_team, candidate_home)),
         do: 35,
         else: 0

    away_score =
      if away_team != "" and
           (away_team == candidate_away or String.contains?(candidate_away, away_team) or
              String.contains?(away_team, candidate_away)),
         do: 35,
         else: 0

    competition_score =
      if competition_name != "" and
           (competition_name == candidate_competition or
              String.contains?(candidate_competition, competition_name) or
              String.contains?(competition_name, candidate_competition)),
         do: 20,
         else: 0

    kickoff_score =
      case {start_time, candidate.start_time} do
        {%DateTime{} = left, %DateTime{} = right} ->
          delta_seconds = abs(DateTime.diff(left, right, :second))

          cond do
            delta_seconds <= 300 -> 10
            delta_seconds <= 1800 -> 5
            true -> 0
          end

        _ ->
          0
      end

    home_score + away_score + competition_score + kickoff_score
  end

  defp kickoff_delta_seconds(payload, %CanonicalMatch{} = candidate) do
    case {parse_payload_datetime(payload), candidate.start_time} do
      {%DateTime{} = source_start, %DateTime{} = candidate_start} ->
        abs(DateTime.diff(source_start, candidate_start, :second))

      _ ->
        0
    end
  end

  defp kickoff_delta_seconds(_payload, _candidate), do: 0

  defp parse_payload_datetime(payload) do
    case payload["start_time"] do
      %DateTime{} = dt ->
        dt

      value when is_binary(value) ->
        DateTime.from_iso8601(value) |> elem_datetime()

      _ ->
        case payload["kickoff_at"] do
          %DateTime{} = dt ->
            dt

          value when is_binary(value) ->
            DateTime.from_iso8601(value) |> elem_datetime()

          _ ->
            cond do
              is_integer(payload["start_time_ms"]) ->
                DateTime.from_unix(payload["start_time_ms"], :millisecond) |> elem_datetime()

              is_integer(payload["kickoff_at_ms"]) ->
                DateTime.from_unix(payload["kickoff_at_ms"], :millisecond) |> elem_datetime()

              true ->
                nil
            end
        end
    end
  end

  defp elem_datetime({:ok, %DateTime{} = dt, _offset}), do: dt
  defp elem_datetime({:ok, %DateTime{} = dt}), do: dt
  defp elem_datetime(_), do: nil

  defp team_json(nil), do: nil
  defp team_json(team), do: %{"id" => team.id, "name" => team.name, "slug" => team.slug}

  defp maybe_filter_suggestion_status(query, nil), do: query

  defp maybe_filter_suggestion_status(query, status),
    do: where(query, [s], s.mapping_status == ^status)

  defp maybe_filter_suggestion_source(query, nil), do: query

  defp maybe_filter_suggestion_source(query, source_name),
    do: where(query, [s], s.source_name == ^source_name)

  defp maybe_filter_suggestion_competition(suggestions, nil), do: suggestions

  defp maybe_filter_suggestion_competition(suggestions, competition) do
    term = normalize_string(competition)

    Enum.filter(suggestions, fn suggestion ->
      source_competition =
        suggestion.source_snapshot
        |> get_in(["competition", "name"])
        |> normalize_string()

      candidate_competition =
        suggestion.candidate_snapshot
        |> get_in(["competition_name"])
        |> normalize_string()

      String.contains?(source_competition, term) or String.contains?(candidate_competition, term)
    end)
  end

  defp maybe_filter_canonical_sport(query, nil), do: query
  defp maybe_filter_canonical_sport(query, sport), do: where(query, [m], m.sport == ^sport)

  defp maybe_filter_enabled_imported_cricket_matches(query, "cricket") do
    query
    |> join(:inner, [m], imported in Match,
      on:
        imported.provider == m.anchor_source_name and
          imported.external_id == m.anchor_source_match_id and
          imported.sport == :cricket
    )
    |> join(:inner, [_m, imported], feed in CompetitionFeed,
      on: feed.id == imported.competition_feed_id
    )
    |> where([_m, _imported, feed], feed.enabled == true)
  end

  defp maybe_filter_enabled_imported_cricket_matches(query, _sport), do: query

  defp maybe_filter_by_start_window(query, nil, _), do: query

  defp maybe_filter_by_start_window(query, %DateTime{} = start_window, %DateTime{} = end_window) do
    where(query, [m], m.start_time >= ^start_window and m.start_time <= ^end_window)
  end

  defp maybe_filter_canonical_query(query, nil), do: query

  defp maybe_filter_canonical_query(query, term) do
    like = "%#{String.downcase(term)}%"

    query
    |> join(:left, [m], home in assoc(m, :home_team))
    |> join(:left, [m, home], away in assoc(m, :away_team))
    |> where(
      [m, home, away],
      ilike(m.competition_name, ^like) or
        ilike(m.anchor_source_match_id, ^like) or
        ilike(home.name, ^like) or
        ilike(away.name, ^like)
    )
  end

  defp blank_to_nil(value) when is_binary(value) do
    case String.trim(value) do
      "" -> nil
      trimmed -> trimmed
    end
  end

  defp blank_to_nil(value), do: value

  defp maybe_publish_scraper_configuration(
         {:ok, %ScraperConfiguration{} = configuration} = result
       ) do
    _ = publish_scraper_control(scraper_configuration_json(configuration))
    result
  end

  defp maybe_publish_scraper_configuration(result), do: result

  defp cached_source_refresh_advisory(match_id) do
    ensure_source_refresh_advisory_cache!()

    case :ets.lookup(@source_refresh_advisory_cache, match_id) do
      [{^match_id, advisory, cached_at_ms}] when is_integer(cached_at_ms) ->
        if System.system_time(:millisecond) - cached_at_ms <= @source_refresh_advisory_ttl_ms do
          {:ok, advisory}
        else
          :ets.delete(@source_refresh_advisory_cache, match_id)
          :error
        end

      _ ->
        :error
    end
  end

  defp maybe_automate_profile_refresh(profile) when is_map(profile) do
    match_id = profile[:match_id] || profile["match_id"]

    with {:ok, advisory} <- automation_advisory_for_profile(match_id, profile),
         true <- advisory_refresh_now?(advisory),
         {:ok, result} <- trigger_one_x_bet_match_fetch(match_id) do
      {:ok, :requested,
       %{
         match_id: match_id,
         source_match_id: result.source_match_id,
         reason: advisory_reason(advisory),
         confidence: advisory_confidence(advisory)
       }}
    else
      false ->
        {:ok, :skipped,
         %{
           match_id: match_id,
           reason: "advisory did not require immediate source refresh"
         }}

      {:error, reason} ->
        {:error, reason, %{match_id: match_id}}

      other ->
        {:error, other, %{match_id: match_id}}
    end
  end

  defp automation_advisory_for_profile(match_id, profile) do
    case get_cricket_source_refresh_advisory(match_id) do
      {:ok, advisory} ->
        {:ok, advisory}

      _ ->
        {:ok,
         %{
           "refresh_now" =>
             profile[:source_refresh_required] || profile["source_refresh_required"] || false,
           "recommended_interval_seconds" =>
             profile[:recommended_poll_interval_seconds] ||
               profile["recommended_poll_interval_seconds"] || 600,
           "confidence" => 0.45,
           "reason" => "rules fallback triggered because AI advisory was unavailable",
           "requires_manual_review" => false,
           "ai_used" => false,
           "model" => "rules_fallback"
         }}
    end
  end

  defp eligible_for_automated_source_refresh?(profile, now) when is_map(profile) do
    source_fetch_enabled =
      profile[:source_fetch_enabled] || profile["source_fetch_enabled"] || false

    source_refresh_required =
      profile[:source_refresh_required] || profile["source_refresh_required"] || false

    recommended_interval_seconds =
      profile[:recommended_poll_interval_seconds] || profile["recommended_poll_interval_seconds"] ||
        0

    last_status =
      get_in(profile, [:source_refresh_status, :last_status]) ||
        get_in(profile, ["source_refresh_status", "last_status"])

    recent_request? =
      case get_in(profile, [:source_refresh_status, :last_requested_at]) ||
             get_in(profile, ["source_refresh_status", "last_requested_at"]) do
        %DateTime{} = requested_at ->
          seconds_since(requested_at, now) < max(recommended_interval_seconds, 15)

        _ ->
          false
      end

    source_fetch_enabled and source_refresh_required and recommended_interval_seconds > 0 and
      last_status != "requested" and not recent_request?
  end

  defp automation_priority_score(profile) do
    phase_score =
      case profile[:source_refresh_phase] || profile["source_refresh_phase"] do
        "hot_live" -> 5
        "warmup" -> 4
        "cooldown" -> 3
        "scheduled" -> 2
        _ -> 1
      end

    risk_score = profile |> Map.get(:risk_flags, profile["risk_flags"] || []) |> length()

    refresh_score =
      if(profile[:source_refresh_required] || profile["source_refresh_required"], do: 10, else: 0)

    phase_score * 100 + risk_score * 10 + refresh_score
  end

  defp advisory_refresh_now?(advisory) when is_map(advisory) do
    advisory["refresh_now"] || advisory[:refresh_now] || false
  end

  defp advisory_reason(advisory) when is_map(advisory),
    do: advisory["reason"] || advisory[:reason] || "automated source refresh"

  defp advisory_confidence(advisory) when is_map(advisory),
    do: advisory["confidence"] || advisory[:confidence] || 0.0

  defp normalize_positive_integer(value, _default) when is_integer(value) and value > 0, do: value

  defp normalize_positive_integer(value, default) when is_binary(value) do
    case Integer.parse(value) do
      {int, ""} when int > 0 -> int
      _ -> default
    end
  end

  defp normalize_positive_integer(_, default), do: default

  defp log_automation_event(attrs) when is_map(attrs) do
    %AutomationEvent{}
    |> AutomationEvent.changeset(%{
      event_type: attrs[:event_type] || attrs["event_type"],
      status: attrs[:status] || attrs["status"] || "info",
      source_name: attrs[:source_name] || attrs["source_name"],
      source_match_id: attrs[:source_match_id] || attrs["source_match_id"],
      match_id: attrs[:match_id] || attrs["match_id"],
      canonical_match_id: attrs[:canonical_match_id] || attrs["canonical_match_id"],
      message: attrs[:message] || attrs["message"],
      metadata: attrs[:metadata] || attrs["metadata"] || %{}
    })
    |> Repo.insert()
  end

  defp cache_source_refresh_advisory(match_id, advisory)
       when is_binary(match_id) and is_map(advisory) do
    ensure_source_refresh_advisory_cache!()

    :ets.insert(
      @source_refresh_advisory_cache,
      {match_id, advisory, System.system_time(:millisecond)}
    )

    :ok
  end

  defp upsert_source_refresh_status(attrs) when is_map(attrs) do
    match_id = attrs[:match_id] || attrs["match_id"]
    existing = Repo.get_by(MatchSourceRefreshStatus, match_id: match_id)

    merged_attrs =
      case existing do
        %MatchSourceRefreshStatus{} = status ->
          %{
            match_id: status.match_id,
            source_name: attrs[:source_name] || attrs["source_name"] || status.source_name,
            source_match_id:
              attrs[:source_match_id] || attrs["source_match_id"] || status.source_match_id,
            last_status: attrs[:last_status] || attrs["last_status"] || status.last_status,
            last_requested_at:
              attrs[:last_requested_at] || attrs["last_requested_at"] || status.last_requested_at,
            last_completed_at:
              attrs[:last_completed_at] || attrs["last_completed_at"] || status.last_completed_at,
            last_message: attrs[:last_message] || attrs["last_message"] || status.last_message,
            metadata:
              Map.merge(status.metadata || %{}, attrs[:metadata] || attrs["metadata"] || %{})
          }

        nil ->
          %{
            match_id: match_id,
            source_name: attrs[:source_name] || attrs["source_name"],
            source_match_id: attrs[:source_match_id] || attrs["source_match_id"],
            last_status: attrs[:last_status] || attrs["last_status"] || "idle",
            last_requested_at: attrs[:last_requested_at] || attrs["last_requested_at"],
            last_completed_at: attrs[:last_completed_at] || attrs["last_completed_at"],
            last_message: attrs[:last_message] || attrs["last_message"],
            metadata: attrs[:metadata] || attrs["metadata"] || %{}
          }
      end

    case existing do
      %MatchSourceRefreshStatus{} = status ->
        status
        |> MatchSourceRefreshStatus.changeset(merged_attrs)
        |> Repo.update()

      nil ->
        %MatchSourceRefreshStatus{}
        |> MatchSourceRefreshStatus.changeset(merged_attrs)
        |> Repo.insert()
    end
  end

  defp ensure_source_refresh_advisory_cache! do
    case :ets.whereis(@source_refresh_advisory_cache) do
      :undefined ->
        :ets.new(@source_refresh_advisory_cache, [
          :named_table,
          :public,
          :set,
          read_concurrency: true,
          write_concurrency: true
        ])

      _ ->
        :ok
    end
  rescue
    ArgumentError -> :ok
  end

  defp publish_scraper_control(payload) when is_map(payload) do
    encoded_payload = Jason.encode!(payload)

    cache_key =
      "control:scrapers:last:" <>
        to_string(payload[:source_name] || payload["source_name"] || "unknown")

    publish_redis_command_sequence(encoded_payload, [
      ["SET", cache_key, encoded_payload],
      ["PUBLISH", "control:scrapers", encoded_payload]
    ])
  end

  defp publish_scraper_action(payload) when is_map(payload) do
    encoded_payload = Jason.encode!(payload)

    publish_redis_command_sequence(encoded_payload, [
      ["PUBLISH", "control:scraper-actions", encoded_payload]
    ])
  end

  defp publish_redis_command_sequence(_encoded_payload, commands) when is_list(commands) do
    redis_url = Application.get_env(:back, :multi_source_redis_url, "redis://127.0.0.1:6379")

    case Redix.start_link(redis_url) do
      {:ok, connection} ->
        try do
          Enum.reduce_while(commands, :ok, fn command, _acc ->
            case Redix.command(connection, command) do
              {:ok, _} -> {:cont, :ok}
              error -> {:halt, error}
            end
          end)
        after
          GenServer.stop(connection, :normal)
        end

      error ->
        error
    end
  end

  defp normalize_string(nil), do: ""
  defp normalize_string(value), do: value |> to_string() |> String.trim() |> String.downcase()

  defp valid_matchmaker_payload?(source_match_id, payload) do
    sport = normalize_string(payload["sport"])

    home_team =
      normalize_string(payload["home_team_name"] || get_in(payload, ["home_team", "name"]))

    away_team =
      normalize_string(payload["away_team_name"] || get_in(payload, ["away_team", "name"]))

    sport == "cricket" and
      home_team != "" and away_team != "" and
      not String.starts_with?(source_match_id, "sports_short:")
  end

  defp maybe_ai_rank_cricket_candidate(_payload, []), do: nil
  defp maybe_ai_rank_cricket_candidate(_payload, [{match, _score}]), do: match

  defp maybe_ai_rank_cricket_candidate(payload, candidates) do
    with "cricket" <- normalize_string(payload["sport"]),
         {:ok, api_key} <- openrouter_api_key(),
         model when is_binary(model) <- active_openrouter_model(),
         top_candidates <- Enum.take(candidates, 5),
         {:ok, canonical_match_id} <-
           ai_select_candidate_id(payload, top_candidates, api_key, model) do
      Enum.find_value(top_candidates, fn {match, _score} ->
        if match.id == canonical_match_id, do: match, else: nil
      end)
    else
      _ -> nil
    end
  end

  defp ai_select_candidate_id(payload, candidates, api_key, model) do
    prompt_payload =
      Enum.map(candidates, fn {match, score} ->
        %{
          id: match.id,
          competition_name: match.competition_name,
          start_time: match.start_time,
          home_team: match.home_team && match.home_team.name,
          away_team: match.away_team && match.away_team.name,
          heuristic_score: score
        }
      end)

    request_body = %{
      model: model,
      temperature: 0,
      max_tokens: 120,
      messages: [
        %{
          role: "system",
          content:
            "You are a sportsbook match-linking assistant. Choose the single best canonical cricket match candidate. Return ONLY compact JSON like {\"canonical_match_id\":\"...\"} or {\"canonical_match_id\":null}."
        },
        %{
          role: "user",
          content: """
          Source cricket match JSON:
          #{Jason.encode!(%{competition_name: payload["competition_name"] || get_in(payload, ["competition", "name"]), home_team_name: payload["home_team_name"] || get_in(payload, ["home_team", "name"]), away_team_name: payload["away_team_name"] || get_in(payload, ["away_team", "name"]), start_time: payload["start_time"] || payload["kickoff_at"] || payload["start_time_ms"]})}

          Candidate matches JSON:
          #{Jason.encode!(prompt_payload)}
          """
        }
      ]
    }

    with {:ok,
          %{status: 200, body: %{"choices" => [%{"message" => %{"content" => content}} | _]}}} <-
           Req.post(@openrouter_url,
             json: request_body,
             headers: [
               {"Authorization", "Bearer #{api_key}"},
               {"HTTP-Referer", "https://sixerbat.com"},
               {"X-Title", "Sixerbat Matchmaker"}
             ],
             receive_timeout: 8_000
           ),
         {:ok, %{"canonical_match_id" => canonical_match_id}} <- decode_ai_json(content),
         true <- is_binary(canonical_match_id) and canonical_match_id != "" do
      {:ok, canonical_match_id}
    else
      _ -> {:error, :ai_candidate_selection_failed}
    end
  end

  defp decode_ai_json(content) when is_binary(content) do
    cleaned =
      content
      |> String.trim()
      |> String.replace(~r/^```(?:json)?\n?/, "")
      |> String.replace(~r/\n?```$/, "")
      |> String.trim()

    Jason.decode(cleaned)
  end

  defp openrouter_api_key do
    key =
      Settings.get("openrouter_api_key", nil) ||
        Application.get_env(:back, :openrouter_api_key, nil)

    if is_binary(key) and String.trim(key) != "" do
      {:ok, String.trim(key)}
    else
      {:error, :openrouter_api_key_not_configured}
    end
  end

  defp active_openrouter_model do
    Settings.get(
      "openrouter_active_model",
      Application.get_env(:back, :openrouter_default_model, "openai/gpt-4o-mini")
    )
  end
end
