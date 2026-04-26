defmodule Back.AI.OddsRuntime do
  @moduledoc false

  alias Back.AI.OddsRules
  alias Back.Betting
  alias Back.Betting.Match

  alias Back.AI.OddsStrategies.{
    Cricket,
    DogRacing,
    Football,
    HorseRacing,
    Tennis
  }

  @strategies %{
    cricket: Cricket,
    football: Football,
    tennis: Tennis,
    horse_racing: HorseRacing,
    dog_racing: DogRacing
  }

  @stale_upcoming_grace_seconds 900

  def strategy_for(%{sport: sport}), do: strategy_for(sport)
  def strategy_for(sport) when is_binary(sport), do: strategy_for(to_sport_atom(sport))
  def strategy_for(sport) when is_atom(sport), do: Map.get(@strategies, sport, Cricket)
  def strategy_for(_), do: Cricket

  def sport_profile(sport), do: strategy_for(sport).profile()
  def sport_questions(sport), do: strategy_for(sport).follow_up_questions()

  def build_generation_context(%Match{} = match, requested_bet_types, opts \\ []) do
    with :ok <- ensure_generation_allowed(match) do
      strategy = strategy_for(match)
      allowed = OddsRules.allowed_bet_types(match.sport)

      effective_bet_types =
        requested_bet_types
        |> List.wrap()
        |> Enum.filter(&(&1 in allowed))
        |> case do
          [] -> allowed
          values -> values
        end

      market_configs =
        Enum.reduce(effective_bet_types, %{}, fn bet_type, acc ->
          Map.put(acc, bet_type, Betting.get_sport_market_config(match.sport, bet_type))
        end)

      {:ok,
       %{
         strategy: strategy,
         sport_profile: strategy.profile(),
         phase: generation_phase(match),
         effective_bet_types: effective_bet_types,
         market_configs: market_configs,
         live?: match.status == :live,
         hard_expired?: generation_phase(match) == :expired
       }
       |> Map.merge(Enum.into(opts, %{}))}
    end
  end

  def ensure_generation_allowed(%Match{status: status})
      when status in [:closed, :settled, :cancelled],
      do: {:error, :match_not_accepting_odds}

  def ensure_generation_allowed(%Match{} = match) do
    if generation_phase(match) == :expired do
      {:error, :match_generation_window_expired}
    else
      :ok
    end
  end

  def generation_phase(%Match{status: :live}), do: :live

  def generation_phase(%Match{status: status}) when status in [:closed, :settled, :cancelled],
    do: status

  def generation_phase(%Match{start_time: %DateTime{} = start_time}) do
    now = DateTime.utc_now() |> DateTime.truncate(:second)

    if DateTime.diff(now, start_time, :second) > @stale_upcoming_grace_seconds do
      :expired
    else
      :upcoming
    end
  end

  def generation_phase(_), do: :upcoming

  defp to_sport_atom(value)
       when value in [:cricket, :football, :tennis, :horse_racing, :dog_racing],
       do: value

  defp to_sport_atom("cricket"), do: :cricket
  defp to_sport_atom("football"), do: :football
  defp to_sport_atom("tennis"), do: :tennis
  defp to_sport_atom("horse_racing"), do: :horse_racing
  defp to_sport_atom("dog_racing"), do: :dog_racing
  defp to_sport_atom(_), do: :cricket
end
