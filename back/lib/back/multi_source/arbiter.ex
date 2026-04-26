defmodule Back.MultiSource.Arbiter do
  require Logger

  alias Back.MultiSource
  alias Back.MultiSource.Schemas.CanonicalMarketState
  alias Back.MultiSource.Schemas.CanonicalOddsState
  alias Back.MultiSource.OddsEngine
  alias Back.MultiSource.SuspensionEngine
  alias BackWeb.MatchChannel

  def ingest_raw_payload(raw_payload) when is_binary(raw_payload) do
    with {:ok, envelope} <- Back.MultiSource.Envelope.decode(raw_payload),
         {:ok, source_match_id} <- fetch_source_match_id(envelope.payload || %{}) do
      case MultiSource.resolve_source_match(envelope.source_name, source_match_id) do
        %{canonical_match: canonical_match} ->
          with {:ok, {:market_observation, incoming_state}} <-
                 SuspensionEngine.apply_observation(canonical_match, envelope),
               current_state <-
                 MultiSource.get_market_state(canonical_match.id, incoming_state.market_key),
               persisted <- merge_market_state(current_state, incoming_state),
               {:ok, saved_state} <- MultiSource.upsert_market_state(persisted) do
            maybe_broadcast_canonical_state(canonical_match, current_state, saved_state)
            maybe_process_canonical_odds(canonical_match, envelope)
            {:ok, saved_state}
          else
            {:error, reason} = error ->
              Logger.warning("multi-source arbiter failed to ingest event: #{inspect(reason)}")
              error

            error ->
              Logger.warning("multi-source arbiter dropped unexpected event: #{inspect(error)}")
              {:error, :unexpected_envelope}
          end

        nil ->
          _ = MultiSource.ingest_unmapped_match_suggestion(envelope, source_match_id)
          Logger.debug("multi-source arbiter dropped event without deterministic match mapping")
          {:error, :no_match_mapping}
      end
    else
      {:error, :missing_source_match_id} = error ->
        error

      {:error, reason} = error ->
        Logger.warning("multi-source arbiter failed to ingest event: #{inspect(reason)}")
        error
    end
  end

  defp maybe_broadcast_canonical_state(
         canonical_match,
         current_state,
         %CanonicalMarketState{} = saved_state
       ) do
    if MultiSource.canonical_market_changed?(current_state, saved_state) do
      case MultiSource.resolve_legacy_match(canonical_match) do
        nil -> :ok
        legacy_match -> MatchChannel.broadcast_canonical_market_updated(legacy_match, saved_state)
      end
    else
      :ok
    end
  end

  defp maybe_process_canonical_odds(canonical_match, envelope) do
    canonical_match
    |> OddsEngine.apply_observations(envelope)
    |> Enum.reduce([], fn incoming_state, changed_states ->
      current_state =
        MultiSource.get_odds_state(
          canonical_match.id,
          incoming_state.market_key,
          incoming_state.selection_key
        )

      if OddsEngine.stale_snapshot?(
           current_state,
           incoming_state.high_water_mark_ms,
           incoming_state.last_consensus_source
         ) do
        changed_states
      else
        persisted = OddsEngine.merge_state(current_state, incoming_state, canonical_match)

        case MultiSource.upsert_odds_state(persisted) do
          {:ok, %CanonicalOddsState{} = saved_state} ->
            if OddsEngine.changed?(current_state, saved_state) do
              [saved_state | changed_states]
            else
              changed_states
            end

          _ ->
            changed_states
        end
      end
    end)
    |> Enum.reverse()
    |> maybe_broadcast_canonical_odds(canonical_match)
  end

  defp maybe_broadcast_canonical_odds([], _canonical_match), do: :ok

  defp maybe_broadcast_canonical_odds(changed_states, canonical_match) do
    case MultiSource.resolve_legacy_match(canonical_match) do
      nil ->
        :ok

      legacy_match ->
        now_ms = System.system_time(:millisecond)

        active_sources =
          changed_states
          |> Enum.flat_map(fn state ->
            OddsEngine.active_sources(state.source_snapshots || %{}, now_ms)
          end)
          |> Enum.uniq()

        degraded_sources =
          changed_states
          |> Enum.flat_map(fn state ->
            OddsEngine.all_sources(state.source_snapshots || %{})
          end)
          |> Enum.uniq()
          |> Kernel.--(active_sources)

        MatchChannel.broadcast_canonical_odds_updated(
          legacy_match,
          changed_states,
          length(active_sources),
          degraded_sources
        )
    end
  end

  defp merge_market_state(nil, incoming_state), do: incoming_state

  defp merge_market_state(current_state, incoming_state),
    do: SuspensionEngine.merge_state(current_state, incoming_state)

  defp fetch_source_match_id(payload) when is_map(payload) do
    case payload["source_match_id"] || payload["match_id"] || payload["fixture_id"] ||
           payload["event_id"] do
      value when is_binary(value) -> {:ok, value}
      value when is_integer(value) -> {:ok, Integer.to_string(value)}
      _ -> {:error, :missing_source_match_id}
    end
  end
end
