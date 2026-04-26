defmodule Back.Live.HeartbeatMonitor do
  @moduledoc false

  use GenServer
  require Logger

  import Ecto.Query

  alias Back.Betting.Match
  alias Back.Providers.SportmonksLiveIndex
  alias Back.Repo
  alias Back.State.MarketManager
  alias BackWeb.MatchChannel

  @check_interval_ms 5_000
  @stale_after_seconds 120

  @type state :: %{check_interval_ms: pos_integer(), stale_after_seconds: pos_integer()}

  @spec start_link(keyword()) :: GenServer.on_start()
  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, Keyword.put_new(opts, :name, __MODULE__))
  end

  @impl true
  def init(opts) do
    state = %{
      check_interval_ms: Keyword.get(opts, :check_interval_ms, @check_interval_ms),
      stale_after_seconds: Keyword.get(opts, :stale_after_seconds, @stale_after_seconds)
    }

    Process.send_after(self(), :check_heartbeats, 0)
    {:ok, state}
  end

  @impl true
  def handle_info(:check_heartbeats, state) do
    try do
      suspend_stale_live_matches(state)
    rescue
      exception ->
        Logger.error("""
        Heartbeat monitor check failed: #{Exception.message(exception)}
        """)
    end

    Process.send_after(self(), :check_heartbeats, state.check_interval_ms)
    {:noreply, state}
  end

  @spec suspend_stale_live_matches(state()) :: :ok
  def suspend_stale_live_matches(state) do
    threshold =
      DateTime.utc_now()
      |> DateTime.add(-state.stale_after_seconds, :second)
      |> DateTime.truncate(:second)

    Repo.all(
      from m in Match,
        where: m.sport == :cricket and m.status == :live
    )
    |> Enum.each(fn match ->
      latest_activity_at =
        [match.last_live_event_at, match.updated_at]
        |> Enum.filter(&match?(%DateTime{}, &1))
        |> Enum.max_by(&DateTime.to_unix/1, fn -> nil end)

      stale? =
        case latest_activity_at do
          %DateTime{} = activity_at -> DateTime.compare(activity_at, threshold) == :lt
          _ -> true
        end

      cond do
        sportmonks_live_index_fresh?(match) ->
          :ok

        not stale? ->
          :ok

        MarketManager.published_platform_odds_exist?(match.id) ->
          MatchChannel.broadcast_health_degraded(match, ["provider_stale"])
          :ok

        true ->
          _ =
            MarketManager.suspend_match(match.id, "provider_disconnect", %{
              source: "heartbeat_monitor",
              threshold: threshold,
              last_live_event_at: match.last_live_event_at,
              updated_at: match.updated_at
            })

          :ok
      end
    end)

    :ok
  end

  defp sportmonks_live_index_fresh?(%Match{
         provider: "sportmonks",
         external_id: external_id,
         status: :live
       })
       when is_binary(external_id) do
    SportmonksLiveIndex.fresh_fixture?(external_id)
  end

  defp sportmonks_live_index_fresh?(_), do: false
end
