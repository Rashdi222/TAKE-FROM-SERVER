defmodule Back.MultiSource.ScraperConfigReplayer do
  use GenServer

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @impl true
  def init(state) do
    send(self(), :replay)
    {:ok, state}
  end

  @impl true
  def handle_info(:replay, state) do
    _ = Back.MultiSource.replay_scraper_configurations()
    {:noreply, state}
  end
end
