defmodule Back.Tennis.SimulationState do
  use GenServer

  @default_state %{enabled: false, scenario: nil}

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, @default_state, Keyword.put_new(opts, :name, __MODULE__))
  end

  def get do
    GenServer.call(__MODULE__, :get)
  end

  def set_enabled(enabled) when is_boolean(enabled) do
    GenServer.call(__MODULE__, {:set_enabled, enabled})
  end

  def set_scenario(scenario) when is_binary(scenario) do
    GenServer.call(__MODULE__, {:set_scenario, scenario})
  end

  @impl true
  def init(state), do: {:ok, state}

  @impl true
  def handle_call(:get, _from, state), do: {:reply, state, state}

  @impl true
  def handle_call({:set_enabled, enabled}, _from, state) do
    next_state = if enabled, do: state, else: %{enabled: false, scenario: nil}
    reply_state = if enabled, do: %{state | enabled: true}, else: next_state
    {:reply, reply_state, reply_state}
  end

  @impl true
  def handle_call({:set_scenario, scenario}, _from, _state) do
    next_state = %{enabled: true, scenario: scenario}
    {:reply, next_state, next_state}
  end
end
