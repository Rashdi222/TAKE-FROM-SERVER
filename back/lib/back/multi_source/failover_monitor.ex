defmodule Back.MultiSource.FailoverMonitor do
  use GenServer

  require Logger

  import Ecto.Query

  alias Back.MultiSource
  alias Back.MultiSource.OddsEngine
  alias Back.MultiSource.Schemas.CanonicalMatch
  alias Back.Repo
  alias BackWeb.MatchChannel

  @check_interval_ms 1_000

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @impl true
  def init(opts) do
    state = %{
      check_interval_ms: Keyword.get(opts, :check_interval_ms, @check_interval_ms),
      last_health: %{}
    }

    Process.send_after(self(), :check_sources, state.check_interval_ms)
    {:ok, state}
  end

  @impl true
  def handle_info(:check_sources, state) do
    next_state = run_expiration_pass(state)
    Process.send_after(self(), :check_sources, next_state.check_interval_ms)
    {:noreply, next_state}
  end

  defp run_expiration_pass(state) do
    now_ms = System.system_time(:millisecond)

    matches =
      Repo.all(
        from canonical_match in CanonicalMatch,
          preload: [:odds_states],
          where: canonical_match.status in ["live", "scheduled", "in_progress", "active"]
      )

    Enum.reduce(matches, state, fn canonical_match, acc ->
      process_canonical_match(canonical_match, now_ms, acc)
    end)
  end

  defp process_canonical_match(%CanonicalMatch{} = canonical_match, now_ms, state) do
    odds_states = canonical_match.odds_states || []

    if odds_states == [] do
      state
    else
      active_sources =
        odds_states
        |> Enum.flat_map(fn odds_state ->
          OddsEngine.active_sources(odds_state.source_snapshots || %{}, now_ms)
        end)
        |> Enum.uniq()

      known_sources =
        odds_states
        |> Enum.flat_map(fn odds_state ->
          OddsEngine.all_sources(odds_state.source_snapshots || %{})
        end)
        |> Enum.uniq()

      degraded_sources = known_sources -- active_sources

      changed_states =
        Enum.reduce(odds_states, [], fn odds_state, acc ->
          recalculated =
            OddsEngine.recompute_with_fresh_sources(
              odds_state,
              canonical_match.anchor_source_name,
              now_ms
            )

          if OddsEngine.changed?(odds_state, recalculated) do
            case MultiSource.upsert_odds_state(recalculated) do
              {:ok, saved_state} ->
                [saved_state | acc]

              {:error, reason} ->
                Logger.warning(
                  "multi-source failover monitor could not persist canonical odds: #{inspect(reason)}"
                )

                acc
            end
          else
            acc
          end
        end)
        |> Enum.reverse()

      case MultiSource.resolve_legacy_match(canonical_match) do
        nil ->
          state

        legacy_match ->
          if changed_states != [] do
            MatchChannel.broadcast_canonical_odds_updated(
              legacy_match,
              changed_states,
              length(active_sources),
              degraded_sources
            )
          end

          next_health_signature = %{
            degraded: active_sources == [],
            active_sources: Enum.sort(active_sources),
            degraded_sources: Enum.sort(degraded_sources)
          }

          previous_signature = Map.get(state.last_health, canonical_match.id)

          updated_state =
            if previous_signature != next_health_signature do
              if active_sources == [] do
                MatchChannel.broadcast_health_degraded(legacy_match, degraded_sources)
              end

              %{
                state
                | last_health:
                    Map.put(state.last_health, canonical_match.id, next_health_signature)
              }
            else
              state
            end

          updated_state
      end
    end
  end
end
