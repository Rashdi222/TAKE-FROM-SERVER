defmodule Back.Auth.TokenBlacklist do
  @moduledoc """
  ETS-based GenServer for blacklisting revoked JWT tokens.
  Stores {jti, exp} pairs and periodically purges expired entries.
  """
  use GenServer

  @table :token_blacklist
  @purge_interval :timer.minutes(30)

  def start_link(_opts), do: GenServer.start_link(__MODULE__, [], name: __MODULE__)

  @doc "Adds a token JTI to the blacklist until its expiry."
  def blacklist(jti, exp), do: GenServer.cast(__MODULE__, {:blacklist, jti, exp})

  @doc "Returns true if the JTI is blacklisted."
  def blacklisted?(jti), do: :ets.member(@table, jti)

  # ── GenServer Callbacks ───────────────────────────────────────────────────────

  @impl true
  def init(_) do
    :ets.new(@table, [:named_table, :set, :public, read_concurrency: true])
    schedule_purge()
    {:ok, %{}}
  end

  @impl true
  def handle_cast({:blacklist, jti, exp}, state) do
    :ets.insert(@table, {jti, exp})
    {:noreply, state}
  end

  @impl true
  def handle_info(:purge, state) do
    now = System.system_time(:second)
    :ets.select_delete(@table, [{{:"$1", :"$2"}, [{:<, :"$2", now}], [true]}])
    schedule_purge()
    {:noreply, state}
  end

  defp schedule_purge, do: Process.send_after(self(), :purge, @purge_interval)
end
