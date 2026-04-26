defmodule Back.Tennis.MarginState do
  use GenServer

  @default_margin "0.04"
  @minimum_margin Decimal.new("0.00")
  @maximum_margin Decimal.new("0.25")

  def start_link(opts \\ []) do
    GenServer.start_link(
      __MODULE__,
      %{margin: @default_margin},
      Keyword.put_new(opts, :name, __MODULE__)
    )
  end

  def get_margin do
    GenServer.call(__MODULE__, :get_margin)
  end

  def set_margin(margin) when is_binary(margin) or is_number(margin) do
    GenServer.call(__MODULE__, {:set_margin, to_string(margin)})
  end

  @impl true
  def init(state), do: {:ok, state}

  @impl true
  def handle_call(:get_margin, _from, state) do
    {:reply, state.margin, state}
  end

  @impl true
  def handle_call({:set_margin, margin}, _from, state) do
    case normalize_margin(margin) do
      {:ok, normalized_margin} ->
        {:reply, {:ok, normalized_margin}, %{state | margin: normalized_margin}}

      error ->
        {:reply, error, state}
    end
  end

  defp normalize_margin(margin) when is_binary(margin) do
    case Decimal.parse(String.trim(margin)) do
      {value, ""} ->
        cond do
          Decimal.compare(value, @minimum_margin) == :lt -> {:error, :invalid_margin}
          Decimal.compare(value, @maximum_margin) == :gt -> {:error, :invalid_margin}
          true -> {:ok, value |> Decimal.round(2) |> Decimal.to_string(:normal)}
        end

      _ ->
        {:error, :invalid_margin}
    end
  end
end
