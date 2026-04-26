defmodule Back.Tennis.Supervisor do
  use Supervisor

  def start_link(opts \\ []) do
    Supervisor.start_link(__MODULE__, opts, Keyword.put_new(opts, :name, __MODULE__))
  end

  @impl true
  def init(_opts) do
    children = [
      Back.Tennis.FixtureCache,
      Back.Tennis.StateCache,
      Back.Tennis.ContextCache,
      Back.Tennis.TrackedMatches,
      Back.Tennis.MarginState,
      Back.Tennis.SimulationState,
      Back.Tennis.Workers.LiveSyncWorker
    ]

    Supervisor.init(children, strategy: :one_for_one)
  end
end
