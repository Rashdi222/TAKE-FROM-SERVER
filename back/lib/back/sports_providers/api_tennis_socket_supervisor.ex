defmodule Back.SportsProviders.ApiTennisSocketSupervisor do
  use Supervisor

  def start_link(arg), do: Supervisor.start_link(__MODULE__, arg, name: __MODULE__)

  @impl true
  def init(_arg) do
    children = [Back.SportsProviders.ApiTennisSocket]
    Supervisor.init(children, strategy: :one_for_one)
  end
end
