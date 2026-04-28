defmodule Back.Tennis do
  import Ecto.Query

  alias Back.Tennis.ApiClient
  alias Back.Tennis.ApiTennis.ContextLoader
  alias Back.Tennis.ApiTennis.Normalizers
  alias Back.Tennis.FixtureCache
  alias Back.Tennis.MarginControl
  alias Back.Tennis.MarginState
  alias Back.Tennis.Normalizer
  alias Back.Tennis.SimulationAdapter
  alias Back.Tennis.SimulationState
  alias Back.Tennis.StateCache
  alias Back.Tennis.TrackedMatches
  alias Back.Tennis.Workers.LiveSyncWorker
  alias Back.Betting.Bet
  alias Back.Betting
  alias Back.Betting.Match
  alias Back.Repo
  alias Back.State.MarketManager
  alias BackWeb.TennisChannel
  alias BackWeb.JsonHelpers

  def list_fixtures(opts \\ []) do
    cache_key =
      {
        Keyword.get(opts, :date_start, Date.utc_today()),
        Keyword.get(opts, :date_stop, Date.add(Date.utc_today(), 1)),
        Keyword.get(opts, :timezone, "Asia/Karachi")
      }

    case safe_cache_get(cache_key) do
      {:ok, fixtures} ->
        {:ok, fixtures}

      :miss ->
        with {:ok, fixtures} <- ApiClient.fetch_fixtures(opts) do
          safe_cache_put(cache_key, fixtures)
          persist_fixtures(fixtures)
          {:ok, fixtures}
        end
    end
  end

  def get_live_state(event_key) when is_binary(event_key) do
    case safe_state_get(event_key) do
      nil ->
        cached_or_bootstrap_live_states()
        safe_state_get(event_key)

      state ->
        state
    end
  end

  def get_public_match(event_key, opts \\ []) when is_binary(event_key) do
    tracked = tracked_map()

    case {get_live_state(event_key), Map.get(tracked, event_key)} do
      {%_{} = state, %{} = metadata} ->
        if metadata["published"] == true or public_live_visible?(state) do
          {:ok, public_merge_tracking_metadata(state, metadata)}
        else
          with {:ok, fixtures} <- list_fixtures(opts) do
            {:ok, Enum.find(fixtures, &(&1.event_key == event_key))}
          end
        end

      {%_{} = state, _} ->
        if public_live_visible?(state) do
          {:ok, public_merge_tracking_metadata(state, %{})}
        else
          with {:ok, fixtures} <- list_fixtures(opts) do
            {:ok, Enum.find(fixtures, &(&1.event_key == event_key))}
          end
        end

      _ ->
        with {:ok, fixtures} <- list_fixtures(opts) do
          {:ok, Enum.find(fixtures, &(&1.event_key == event_key))}
        end
    end
  end

  def list_live_states do
    states = safe_state_list()
    tracked = tracked_map()

    states
    |> Enum.filter(fn state -> Map.has_key?(tracked, state.event_key) end)
    |> Enum.map(&merge_tracking_metadata(&1, Map.get(tracked, &1.event_key, %{})))
    |> attach_betting_stats()
  end

  def list_provider_live_matches(opts \\ []) do
    tracked = tracked_map()

    with {:ok, states} <- ApiClient.fetch_livescore(opts) do
      {:ok,
       Enum.map(states, fn state ->
         case Map.get(tracked, state.event_key) do
           %{} = metadata -> merge_tracking_metadata(state, metadata)
           _ -> auto_live_meta(state)
         end
       end)}
    end
  end

  def list_desk_states do
    tracked = tracked_map()
    live_states = safe_state_list() |> Map.new(&{&1.event_key, &1})

    live_rows =
      live_states
      |> Enum.map(fn {event_key, state} ->
        case Map.get(tracked, event_key) do
          %{} = metadata -> merge_tracking_metadata(state, metadata)
          _ -> auto_live_meta(state)
        end
      end)

    queued_rows =
      tracked
      |> Enum.reject(fn {event_key, _metadata} -> Map.has_key?(live_states, event_key) end)
      |> Enum.map(fn {event_key, metadata} ->
        metadata
        |> Map.put("event_key", event_key)
        |> Map.merge(tracking_workflow_meta(nil, metadata))
      end)

    (live_rows ++ queued_rows)
    |> attach_betting_stats()
  end

  def list_public_live_states do
    tracked = tracked_map()

    cached_or_bootstrap_live_states()
    |> Enum.filter(fn state ->
      case Map.get(tracked, state.event_key) do
        %{} = metadata -> metadata["published"] == true or public_live_visible?(state)
        _ -> public_live_visible?(state)
      end
    end)
    |> Enum.map(&public_merge_tracking_metadata(&1, Map.get(tracked, &1.event_key, %{})))
  end

  def get_margin do
    try do
      MarginState.get_margin()
    catch
      :exit, _ -> "0.04"
    end
  end

  def set_margin(margin) do
    with {:ok, normalized} <- safe_margin_set(margin) do
      recalculate_published_odds(normalized)
      {:ok, normalized}
    end
  end

  def simulation_state do
    safe_simulation_get()
  end

  def set_simulation_enabled(enabled) when is_boolean(enabled) do
    state = safe_simulation_set_enabled(enabled)
    LiveSyncWorker.refresh()
    {:ok, state}
  end

  def inject_simulation_scenario(scenario) when is_binary(scenario) do
    with {:ok, fixtures} <- SimulationAdapter.load_fixture_metadata(scenario),
         state <- safe_simulation_set_scenario(scenario) do
      Enum.each(fixtures, fn fixture ->
        metadata = %{
          "tournament_name" => fixture.tournament_name,
          "player_1_name" => fixture.player_1_name,
          "player_2_name" => fixture.player_2_name,
          "start_time" => fixture.start_time
        }

        _ = safe_track(fixture.event_key, metadata)
      end)

      LiveSyncWorker.refresh()
      {:ok, state}
    end
  end

  def track_match(event_key, metadata \\ %{}) when is_binary(event_key) do
    with :ok <- safe_track(event_key, metadata) do
      LiveSyncWorker.refresh()
      :ok
    end
  end

  def untrack_match(event_key) when is_binary(event_key) do
    with :ok <- safe_untrack(event_key) do
      LiveSyncWorker.refresh()
      :ok
    end
  end

  def publish_match(event_key) when is_binary(event_key) do
    with :ok <- ensure_tracked_for_publish(event_key),
         :ok <- safe_publish(event_key) do
      rebroadcast_match(event_key)
      :ok
    end
  end

  def unpublish_match(event_key) when is_binary(event_key) do
    with :ok <- safe_unpublish(event_key) do
      rebroadcast_match(event_key)
      :ok
    end
  end

  def recalculate_published_odds(margin \\ nil) do
    effective_margin = margin || get_margin()

    updated_states =
      safe_state_list()
      |> Enum.map(fn state ->
        published_odds =
          (state.raw_live_odds || [])
          |> Enum.map(&MarginControl.apply_to_odds(&1, effective_margin))

        %{state | published_odds: published_odds}
      end)

    safe_state_put_states(updated_states)
    Enum.each(updated_states, &TennisChannel.broadcast_state_updated/1)
    :ok
  end

  def list_tracked_matches do
    tracked = tracked_map()
    states = safe_state_list() |> Map.new(&{&1.event_key, &1})

    tracked
    |> Enum.map(fn {event_key, metadata} ->
      case Map.get(states, event_key) do
        nil ->
          metadata
          |> Map.put("event_key", event_key)
          |> Map.merge(tracking_workflow_meta(nil, metadata))

        state ->
          merge_tracking_metadata(state, metadata)
      end
    end)
    |> attach_betting_stats()
  end

  def list_simulation_scenarios do
    SimulationAdapter.list_scenarios()
  end

  def sync_live_market_persistence(states) when is_list(states) do
    persist_live_states(states)
  end

  def ingest_websocket_update(payload) when is_map(payload) do
    event_key =
      case Map.get(payload, "event_key") || Map.get(payload, :event_key) do
        nil -> nil
        value -> to_string(value)
      end

    if is_binary(event_key) do
      existing_state = safe_state_get(event_key)
      normalized = Normalizers.normalize_point_payload(payload, existing_state)

      tennis_context =
        existing(existing_state, :tennis_context) || ContextLoader.fetch_context(payload)

      incoming_odds = ApiClient.extract_embedded_live_odds(payload)

      next_state =
        build_websocket_state(existing_state, normalized, tennis_context, payload, incoming_odds)
        |> Normalizer.normalize_match_state()

      safe_state_put(next_state)
      sync_live_market_persistence([next_state])
      TennisChannel.broadcast_state_updated(next_state)
      {:ok, next_state}
    else
      {:error, :invalid_event_key}
    end
  end

  defp cached_or_bootstrap_live_states do
    if not state_cache_available?() do
      with {:ok, states} <- ApiClient.fetch_live_snapshot() do
        margin = get_margin()

        Enum.map(states, fn raw_state ->
          published_odds =
            (raw_state.raw_live_odds || [])
            |> Enum.map(&MarginControl.apply_to_odds(&1, margin))

          raw_state
          |> Map.put(:published_odds, published_odds)
          |> Normalizer.normalize_match_state()
        end)
      else
        _ -> []
      end
    else
      case safe_state_list() do
        [] ->
          with {:ok, states} <- ApiClient.fetch_live_snapshot() do
            margin = get_margin()

            normalized_states =
              Enum.map(states, fn raw_state ->
                published_odds =
                  (raw_state.raw_live_odds || [])
                  |> Enum.map(&MarginControl.apply_to_odds(&1, margin))

                raw_state
                |> Map.put(:published_odds, published_odds)
                |> Normalizer.normalize_match_state()
              end)

            safe_state_replace(normalized_states)
            persist_live_states(normalized_states)
            normalized_states
          else
            _ -> []
          end

        states ->
          states
      end
    end
  end

  defp tracked_map do
    safe_tracked_list()
    |> Map.new(fn row ->
      event_key = row[:event_key] || row["event_key"]
      {event_key, Map.delete(row, :event_key) |> Map.delete("event_key")}
    end)
  end

  defp safe_cache_put(key, fixtures) do
    try do
      FixtureCache.put(key, fixtures)
    catch
      :exit, _ -> :ok
    end
  end

  defp safe_cache_get(key) do
    try do
      FixtureCache.get(key)
    catch
      :exit, _ -> :miss
    end
  end

  defp safe_state_list do
    if Process.whereis(StateCache) do
      try do
        StateCache.list_states()
      catch
        :exit, _ -> []
      end
    else
      []
    end
  end

  defp state_cache_available? do
    is_pid(Process.whereis(StateCache))
  end

  defp safe_state_get(event_key) when is_binary(event_key) do
    if Process.whereis(StateCache) do
      try do
        StateCache.get_state(event_key)
      catch
        :exit, _ -> nil
      end
    else
      nil
    end
  end

  defp safe_state_put(%Back.Tennis.MatchState{} = state) do
    if Process.whereis(StateCache) do
      try do
        StateCache.put_state(state)
      catch
        :exit, _ -> :ok
      end
    else
      :ok
    end
  end

  defp safe_state_put_states(states) when is_list(states) do
    if Process.whereis(StateCache) do
      try do
        StateCache.put_states(states)
      catch
        :exit, _ -> :ok
      end
    else
      :ok
    end
  end

  defp safe_state_replace(states) when is_list(states) do
    if Process.whereis(StateCache) do
      try do
        StateCache.replace_states(states)
      catch
        :exit, _ -> :ok
      end
    else
      :ok
    end
  end

  defp safe_tracked_list do
    if Process.whereis(TrackedMatches) do
      try do
        TrackedMatches.list()
      catch
        :exit, _ -> []
      end
    else
      []
    end
  end

  defp safe_tracked?(event_key) when is_binary(event_key) do
    if Process.whereis(TrackedMatches) do
      try do
        TrackedMatches.tracked?(event_key)
      catch
        :exit, _ -> false
      end
    else
      false
    end
  end

  defp safe_track(event_key, metadata) when is_binary(event_key) and is_map(metadata) do
    if Process.whereis(TrackedMatches) do
      try do
        TrackedMatches.track(event_key, metadata)
      catch
        :exit, _ -> {:error, :tracking_unavailable}
      end
    else
      {:error, :tracking_unavailable}
    end
  end

  defp safe_untrack(event_key) when is_binary(event_key) do
    if Process.whereis(TrackedMatches) do
      try do
        TrackedMatches.untrack(event_key)
      catch
        :exit, _ -> {:error, :tracking_unavailable}
      end
    else
      {:error, :tracking_unavailable}
    end
  end

  defp safe_publish(event_key) when is_binary(event_key) do
    if Process.whereis(TrackedMatches) do
      try do
        TrackedMatches.publish(event_key)
      catch
        :exit, _ -> {:error, :tracking_unavailable}
      end
    else
      {:error, :tracking_unavailable}
    end
  end

  defp safe_unpublish(event_key) when is_binary(event_key) do
    if Process.whereis(TrackedMatches) do
      try do
        TrackedMatches.unpublish(event_key)
      catch
        :exit, _ -> {:error, :tracking_unavailable}
      end
    else
      {:error, :tracking_unavailable}
    end
  end

  defp safe_margin_set(margin) do
    if Process.whereis(MarginState) do
      try do
        MarginState.set_margin(margin)
      catch
        :exit, _ -> {:error, :invalid_margin}
      end
    else
      {:error, :invalid_margin}
    end
  end

  defp safe_simulation_get do
    if Process.whereis(SimulationState) do
      try do
        SimulationState.get()
      catch
        :exit, _ -> %{enabled: false, scenario: nil}
      end
    else
      %{enabled: false, scenario: nil}
    end
  end

  defp safe_simulation_set_enabled(enabled) when is_boolean(enabled) do
    if Process.whereis(SimulationState) do
      try do
        SimulationState.set_enabled(enabled)
      catch
        :exit, _ -> %{enabled: false, scenario: nil}
      end
    else
      %{enabled: false, scenario: nil}
    end
  end

  defp safe_simulation_set_scenario(scenario) when is_binary(scenario) do
    if Process.whereis(SimulationState) do
      try do
        SimulationState.set_scenario(scenario)
      catch
        :exit, _ -> %{enabled: true, scenario: scenario}
      end
    else
      %{enabled: true, scenario: scenario}
    end
  end

  defp tennis_live_quote_ttl_ms do
    Application.get_env(:back, :tennis_provider_quote_ttl_ms, 15_000)
  end

  defp persist_fixtures(fixtures) when is_list(fixtures) do
    Enum.each(fixtures, &persist_fixture/1)
  end

  defp persist_fixture(
         %{event_key: event_key, player_1_name: player_1_name, player_2_name: player_2_name} =
           fixture
       )
       when is_binary(event_key) do
    attrs = %{
      sport: :tennis,
      team1: player_1_name || "Player 1",
      team2: player_2_name || "Player 2",
      start_time: parse_fixture_datetime(fixture.start_time),
      status: normalize_match_status(fixture.status),
      in_play_enabled: false,
      provider: "api_tennis",
      external_id: event_key,
      score: %{},
      raw_data: %{
        "_competition_feed" => %{
          "name" => fixture.tournament_name,
          "competition_key" => normalize_competition_key(fixture.tournament_name)
        },
        "tennis_fixture" => %{
          "event_key" => event_key,
          "tournament_name" => fixture.tournament_name,
          "round_name" => fixture.round_name,
          "court_name" => fixture.court_name,
          "player_1_key" => fixture.player_1_key,
          "player_2_key" => fixture.player_2_key,
          "season" => fixture.season
        },
        "provider_payload" => JsonHelpers.json_safe(fixture.raw || %{})
      }
    }

    _ = Betting.upsert_external_match(attrs)
    :ok
  end

  defp persist_fixture(_), do: :ok

  defp persist_live_states(states) when is_list(states) do
    Enum.each(states, fn state ->
      with {:ok, match} <- upsert_live_match(state) do
        sync_live_odds_to_platform(match, state)
      end
    end)
  end

  defp upsert_live_match(
         %{event_key: event_key, player_1_name: player_1_name, player_2_name: player_2_name} =
           state
       )
       when is_binary(event_key) do
    attrs = %{
      sport: :tennis,
      team1: player_1_name || "Player 1",
      team2: player_2_name || "Player 2",
      start_time: parse_fixture_datetime(extract_start_time(state)),
      status: normalize_live_status(state.status),
      in_play_enabled: true,
      provider: "api_tennis",
      external_id: event_key,
      score: %{
        "current_game_score" => state.current_game_score,
        "current_point_score" => state.current_point_score,
        "score" => JsonHelpers.json_safe(state.score),
        "sets" => JsonHelpers.json_safe(state.sets)
      },
      raw_data: %{
        "_competition_feed" => %{
          "name" => extract_tournament_name(state),
          "competition_key" => normalize_competition_key(extract_tournament_name(state))
        },
        "tennis_live_state" => %{
          "event_key" => event_key,
          "event_status" => state.event_status,
          "server" => state.server,
          "current_set" => state.current_set,
          "break_point" => state.break_point?,
          "set_point" => state.set_point?,
          "match_point" => state.match_point?,
          "tiebreak" => state.tiebreak?
        },
        "tennis_context" => JsonHelpers.json_safe(state.tennis_context || %{}),
        "provider_payload" =>
          JsonHelpers.json_safe(state.raw_livescore || state.raw_fixture || %{})
      }
    }

    Betting.upsert_external_match(attrs)
  end

  defp upsert_live_match(_), do: {:error, :invalid_live_state}

  defp sync_live_odds_to_platform(%Match{id: match_id}, %{published_odds: odds})
       when is_list(odds) and odds != [] do
    rows =
      odds
      |> Enum.map(&to_provider_reference_row/1)
      |> Enum.reject(&is_nil/1)

    if rows == [] do
      :ok
    else
      _ =
        MarketManager.apply_provider_reference_board(
          match_id,
          "api_tennis",
          rows,
          %{strategy_mode: "provider_passthrough"}
        )
    end

    :ok
  end

  defp sync_live_odds_to_platform(_match, _state), do: :ok

  defp to_provider_reference_row(odd) do
    market_name = Map.get(odd, :market_name) || Map.get(odd, "market_name")
    market_key = Map.get(odd, :market_key) || Map.get(odd, "market_key")
    selection_name = Map.get(odd, :selection_name) || Map.get(odd, "selection_name")
    selection_key = Map.get(odd, :selection_key) || Map.get(odd, "selection_key")
    line = Map.get(odd, :line) || Map.get(odd, "line")
    odds_value = Map.get(odd, :odds_value) || Map.get(odd, "odds_value")
    event_key = Map.get(odd, :event_key) || Map.get(odd, "event_key")

    if usable_odds_value?(odds_value) and present?(market_key) and present?(event_key) do
      %{
        "bet_type" => infer_bet_type(market_name, market_key),
        "outcome" => selection_name || selection_key || "Selection",
        "label" => selection_name || selection_key || "Selection",
        "selection_key" =>
          selection_key || normalize_competition_key(selection_name || "selection"),
        "odds_value" => odds_value,
        "source_external_id" => event_key,
        "source_market_key" => if(present?(line), do: "#{market_key}:#{line}", else: market_key),
        "valid_for_ms" => tennis_live_quote_ttl_ms(),
        "provider_snapshot" => %{
          "market_name" => market_name,
          "market_key" => market_key,
          "line" => line,
          "selection_name" => selection_name,
          "selection_key" => selection_key
        }
      }
    end
  end

  defp usable_odds_value?(%Decimal{} = value), do: Decimal.gt?(value, Decimal.new("1.0"))
  defp usable_odds_value?(value) when is_integer(value), do: value > 1
  defp usable_odds_value?(value) when is_float(value), do: value > 1.0

  defp usable_odds_value?(value) when is_binary(value) do
    trimmed = String.trim(value)

    case Decimal.parse(trimmed) do
      {decimal, ""} -> Decimal.gt?(decimal, Decimal.new("1.0"))
      _ -> false
    end
  end

  defp usable_odds_value?(_), do: false

  defp present?(value) when is_binary(value), do: String.trim(value) != ""
  defp present?(nil), do: false
  defp present?(value), do: value != ""

  defp infer_bet_type(market_name, market_key) do
    key = "#{market_name} #{market_key}" |> String.downcase()

    cond do
      String.contains?(key, "match winner") -> "match_winner"
      String.contains?(key, "set winner") -> "set_betting"
      String.contains?(key, "total") or String.contains?(key, "over_under") -> "over_under"
      true -> "in_play"
    end
  end

  defp parse_fixture_datetime(nil), do: DateTime.utc_now() |> DateTime.truncate(:second)

  defp parse_fixture_datetime(value) when is_binary(value) do
    with [date, time] <- String.split(value, " ", parts: 2),
         {:ok, naive} <-
           NaiveDateTime.from_iso8601("#{date} #{String.pad_trailing(time, 5, "0")}:00") do
      naive
      |> NaiveDateTime.add(-5 * 3600, :second)
      |> DateTime.from_naive!("Etc/UTC")
    else
      _ -> DateTime.utc_now() |> DateTime.truncate(:second)
    end
  end

  defp normalize_match_status(status) do
    value = to_string(status || "") |> String.downcase()

    cond do
      value in ["scheduled", "upcoming", "not started", "to be played", ""] -> :upcoming
      String.contains?(value, "finish") or String.contains?(value, "retired") -> :closed
      String.contains?(value, "set") or String.contains?(value, "live") -> :live
      true -> :upcoming
    end
  end

  defp normalize_live_status(:finished), do: :closed
  defp normalize_live_status(:scheduled), do: :upcoming
  defp normalize_live_status(_), do: :live

  defp normalize_competition_key(nil), do: "tennis"

  defp normalize_competition_key(value) do
    value
    |> to_string()
    |> String.downcase()
    |> String.replace(~r/[^a-z0-9]+/u, "-")
    |> String.trim("-")
    |> case do
      "" -> "tennis"
      key -> key
    end
  end

  defp merge_tracking_metadata(state, metadata) do
    auto_live? = auto_public_live?(state)
    manually_published? = metadata["published"] == true
    effective_published? = manually_published? or auto_live?

    tracking_meta =
      %{
        "tracked_at" => metadata["inserted_at"],
        "fixture_snapshot" => metadata,
        "published" => effective_published?,
        "publish_status" =>
          cond do
            manually_published? -> "published"
            auto_live? -> "auto_live"
            true -> "unpublished"
          end
      }
      |> Map.merge(tracking_workflow_meta(state, metadata))

    Map.merge(Map.from_struct(state), tracking_meta)
  end

  defp public_merge_tracking_metadata(state, metadata) do
    state
    |> merge_tracking_metadata(metadata)
    |> Map.drop(["raw_live_odds"])
  end

  defp rebroadcast_match(event_key) do
    tracked = tracked_map()

    case {safe_state_get(event_key), Map.get(tracked, event_key)} do
      {%_{} = state, %{} = metadata} ->
        TennisChannel.broadcast_state_updated(merge_tracking_metadata(state, metadata))

      _ ->
        :ok
    end
  end

  defp tracking_workflow_meta(state, metadata) do
    published? = metadata["published"] == true
    has_live_state? = not is_nil(state)

    published_odds_count =
      case state do
        %{published_odds: odds} when is_list(odds) -> length(odds)
        _ -> 0
      end

    cond do
      not has_live_state? ->
        %{
          "tracking_status" => "waiting_live_state",
          "workflow_label" => "Waiting for live score",
          "workflow_hint" =>
            "Tracked successfully. Awaiting the first live payload from API Tennis."
        }

      published_odds_count > 0 and published? ->
        %{
          "tracking_status" => "managed_live",
          "workflow_label" => "Managed live",
          "workflow_hint" =>
            "This live match is in your managed list and is visible publicly with provider-backed live odds."
        }

      published_odds_count > 0 ->
        %{
          "tracking_status" => "auto_live",
          "workflow_label" => "Auto live",
          "workflow_hint" =>
            "This live match is visible publicly automatically because provider live odds are available."
        }

      true ->
        %{
          "tracking_status" => "waiting_provider_odds",
          "workflow_label" => "Waiting for provider odds",
          "workflow_hint" =>
            "Live score is present but API Tennis has not supplied usable live odds yet."
        }
    end
  end

  defp auto_live_meta(state) do
    Map.merge(Map.from_struct(state), %{
      "tracked_at" => nil,
      "fixture_snapshot" => %{},
      "published" => auto_public_live?(state),
      "publish_status" =>
        if(auto_public_live?(state), do: "auto_live", else: "waiting_provider_odds"),
      "tracking_status" =>
        if(auto_public_live?(state), do: "auto_live", else: "waiting_provider_odds"),
      "workflow_label" =>
        if(auto_public_live?(state), do: "Auto live", else: "Waiting for provider odds"),
      "workflow_hint" =>
        if(auto_public_live?(state),
          do:
            "This live match is managed automatically from API Tennis and is visible on the public tennis side.",
          else:
            "API Tennis reports this match as live, but usable live odds are not available yet."
        )
    })
  end

  defp auto_public_live?(state) do
    case state do
      %{published_odds: odds} when is_list(odds) and length(odds) > 0 -> true
      %{raw_live_odds: odds} when is_list(odds) and length(odds) > 0 -> true
      _ -> false
    end
  end

  defp public_live_visible?(state) do
    live_status?(state)
  end

  defp live_status?(state) do
    status =
      (Map.get(state, :status) || Map.get(state, "status") || "")
      |> to_string()
      |> String.downcase()
      |> String.trim()

    event_status =
      (Map.get(state, :event_status) || Map.get(state, "event_status") || "")
      |> to_string()
      |> String.downcase()
      |> String.trim()

    terminal? =
      Enum.any?(
        ["finished", "ended", "closed", "cancel", "abandon", "retired", "walkover", "wo"],
        fn token -> String.contains?(status, token) or String.contains?(event_status, token) end
      )

    if terminal? do
      false
    else
      status in ["live", "in_play", "set", "set 1", "set 2", "set 3", "set 4", "set 5"] or
        String.match?(event_status, ~r/^set(\s+\d+)?$/) or
        String.contains?(event_status, "in play") or
        String.contains?(event_status, "live")
    end
  end

  defp ensure_tracked_for_publish(event_key) do
    case safe_tracked?(event_key) do
      true ->
        :ok

      false ->
        case safe_state_get(event_key) do
          %{player_1_name: player_1_name, player_2_name: player_2_name} = state ->
            metadata = %{
              "player_1_name" => player_1_name,
              "player_2_name" => player_2_name,
              "tournament_name" => extract_tournament_name(state),
              "start_time" => extract_start_time(state)
            }

            safe_track(event_key, metadata)

          _ ->
            {:error, :not_tracked}
        end
    end
  end

  defp extract_tournament_name(state) do
    fixture_snapshot =
      Map.get(state, :fixture_snapshot) || Map.get(state, "fixture_snapshot") || %{}

    raw_fixture = Map.get(state, :raw_fixture) || Map.get(state, "raw_fixture") || %{}
    fixture_snapshot["tournament_name"] || raw_fixture["tournament_name"]
  end

  defp extract_start_time(state) do
    fixture_snapshot =
      Map.get(state, :fixture_snapshot) || Map.get(state, "fixture_snapshot") || %{}

    fixture_snapshot["start_time"]
  end

  defp attach_betting_stats(rows) when is_list(rows) do
    event_keys =
      rows
      |> Enum.map(fn row -> row[:event_key] || row["event_key"] end)
      |> Enum.filter(&is_binary/1)
      |> Enum.uniq()

    stats_by_event = betting_stats_by_event(event_keys)

    Enum.map(rows, fn row ->
      event_key = row[:event_key] || row["event_key"]
      stats = Map.get(stats_by_event, event_key, default_betting_stats())
      Map.merge(row, stats)
    end)
  end

  defp betting_stats_by_event([]), do: %{}

  defp betting_stats_by_event(event_keys) do
    from(m in Match,
      join: b in Bet,
      on: b.match_id == m.id,
      where: m.sport == :tennis and m.external_id in ^event_keys and b.status == :pending,
      group_by: m.external_id,
      select: %{
        event_key: m.external_id,
        bettor_count: count(fragment("distinct ?", b.user_id)),
        bet_count: count(b.id),
        matched_volume: coalesce(sum(b.stake), 0),
        house_position:
          coalesce(sum(type(b.stake, :decimal) - type(b.potential_win, :decimal)), 0)
      }
    )
    |> Repo.all()
    |> Map.new(fn row ->
      {row.event_key,
       %{
         "bettor_count" => row.bettor_count,
         "bet_count" => row.bet_count,
         "matched_volume" => row.matched_volume,
         "house_position" => row.house_position
       }}
    end)
  end

  defp default_betting_stats do
    %{
      "bettor_count" => 0,
      "bet_count" => 0,
      "matched_volume" => Decimal.new(0),
      "house_position" => Decimal.new(0)
    }
  end

  defp build_websocket_state(existing_state, normalized, tennis_context, payload, incoming_odds) do
    raw_live_odds =
      case incoming_odds do
        [] -> existing(existing_state, :raw_live_odds) || []
        rows -> rows
      end

    published_odds = existing(existing_state, :published_odds) || []

    %Back.Tennis.MatchState{
      event_key: normalized.event_key,
      status: normalized.status || existing(existing_state, :status),
      server: normalized.server || existing(existing_state, :server),
      event_status: normalized.event_status || existing(existing_state, :event_status),
      current_set: normalized.current_set || existing(existing_state, :current_set),
      current_game_score:
        normalized.current_game_score || existing(existing_state, :current_game_score),
      current_point_score:
        normalized.current_point_score || existing(existing_state, :current_point_score),
      game_result: normalized.game_result || existing(existing_state, :game_result),
      final_result: normalized.final_result || existing(existing_state, :final_result),
      deuce?: normalized.deuce?,
      advantage_player:
        normalized.advantage_player || existing(existing_state, :advantage_player),
      tiebreak?: normalized.tiebreak?,
      set_point?: normalized.set_point?,
      match_point?: normalized.match_point?,
      break_point?: normalized.break_point?,
      player_1_name: normalized.player_1_name || existing(existing_state, :player_1_name),
      player_2_name: normalized.player_2_name || existing(existing_state, :player_2_name),
      player_1_key: normalized.player_1_key || existing(existing_state, :player_1_key),
      player_2_key: normalized.player_2_key || existing(existing_state, :player_2_key),
      sets: normalized.sets || existing(existing_state, :sets) || [],
      score: existing(existing_state, :score),
      point_by_point:
        normalized.point_by_point || existing(existing_state, :point_by_point) || [],
      tennis_context: tennis_context,
      raw_live_odds: raw_live_odds,
      published_odds: published_odds,
      raw_fixture: existing(existing_state, :raw_fixture) || payload,
      raw_livescore: payload,
      updated_at: DateTime.utc_now()
    }
  end

  defp existing(nil, _key), do: nil
  defp existing(%{} = state, key), do: Map.get(state, key)
end
