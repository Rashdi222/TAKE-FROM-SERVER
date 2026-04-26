defmodule Back.AI.OddsRules do
  @moduledoc """
  Sport-specific market and odds validation for generated and manual odds.
  """

  @odds_bounds %{
    cricket: %{
      match_winner: {1.01, 20.0},
      over_under: {1.01, 20.0},
      in_play: {1.01, 20.0},
      fancy: {1.01, 50.0},
      batsman: {1.01, 50.0},
      partnership: {1.01, 50.0},
      fow: {1.01, 50.0}
    },
    tennis: %{
      match_winner: {1.01, 20.0},
      over_under: {1.01, 20.0},
      in_play: {1.01, 20.0},
      set_betting: {1.01, 20.0}
    },
    football: %{
      match_winner: {1.01, 20.0},
      over_under: {1.01, 20.0},
      in_play: {1.01, 20.0},
      double_chance: {1.01, 20.0},
      btts: {1.01, 20.0}
    },
    horse_racing: %{match_winner: {1.01, 30.0}, place: {1.01, 30.0}, in_play: {1.01, 30.0}},
    dog_racing: %{match_winner: {1.01, 30.0}, in_play: {1.01, 30.0}}
  }

  @cricket_over_under MapSet.new(
                        ~w(over_150 under_150 over_200 under_200 over_250 under_250 over_300 under_300)
                      )
  @tennis_over_under MapSet.new(
                       ~w(over_18 under_18 over_20 under_20 over_22 under_22 over_24 under_24 over_26 under_26 over_28 under_28 over_30 under_30)
                     )
  @football_over_under MapSet.new(~w(over_1_5 under_1_5 over_2_5 under_2_5 over_3_5 under_3_5))

  def allowed_bet_types(sport) do
    sport
    |> to_sport_atom()
    |> case do
      :cricket -> [:match_winner, :over_under, :in_play, :fancy, :batsman, :partnership, :fow]
      :tennis -> [:match_winner, :over_under, :set_betting, :in_play]
      :football -> [:match_winner, :over_under, :in_play, :double_chance, :btts]
      :horse_racing -> [:match_winner, :place, :in_play]
      :dog_racing -> [:match_winner, :in_play]
      _ -> []
    end
  end

  def validate(match_or_sport, bet_type, outcome, odds_value) do
    sport =
      case match_or_sport do
        %{sport: s} -> to_sport_atom(s)
        s -> to_sport_atom(s)
      end

    bet_type = to_bet_type_atom(bet_type)

    with true <- sport in Map.keys(@odds_bounds),
         true <- bet_type in allowed_bet_types(sport),
         :ok <- validate_outcome(sport, bet_type, outcome, match_or_sport),
         :ok <- validate_odds_range(sport, bet_type, odds_value) do
      :ok
    else
      false -> {:error, :sport_market_not_supported}
      {:error, _} = err -> err
    end
  end

  defp validate_outcome(:cricket, :in_play, outcome, _match),
    do: validate_cricket_in_play_outcome(outcome)

  # Fancy/batsman/partnership/FOW markets accept any non-empty outcome string
  defp validate_outcome(:cricket, market_type, outcome, _match)
       when market_type in [:fancy, :batsman, :partnership, :fow] do
    if valid_text?(to_string(outcome)), do: :ok, else: {:error, :invalid_market_outcome}
  end

  defp validate_outcome(:tennis, :in_play, outcome, _match),
    do: validate_tennis_in_play_outcome(outcome)

  defp validate_outcome(:cricket, :over_under, outcome, _match) do
    if MapSet.member?(@cricket_over_under, normalize(outcome)),
      do: :ok,
      else: {:error, :invalid_market_outcome}
  end

  defp validate_outcome(:tennis, :over_under, outcome, _match) do
    if MapSet.member?(@tennis_over_under, normalize(outcome)),
      do: :ok,
      else: {:error, :invalid_market_outcome}
  end

  defp validate_outcome(:tennis, :set_betting, outcome, match),
    do: validate_tennis_set_betting_outcome(match, outcome)

  defp validate_outcome(:football, :over_under, outcome, _match) do
    if MapSet.member?(@football_over_under, normalize(outcome)),
      do: :ok,
      else: {:error, :invalid_market_outcome}
  end

  defp validate_outcome(:football, :double_chance, outcome, match),
    do: validate_double_chance_outcome(match, outcome)

  defp validate_outcome(:football, :btts, outcome, _match),
    do: validate_btts_outcome(outcome)

  defp validate_outcome(:football, :in_play, outcome, _match),
    do: validate_football_in_play_outcome(outcome)

  defp validate_outcome(_sport, :in_play, outcome, _match) do
    if valid_text?(outcome), do: :ok, else: {:error, :invalid_market_outcome}
  end

  defp validate_outcome(:cricket, :match_winner, outcome, match),
    do: validate_team_outcome(match, outcome, true)

  defp validate_outcome(:football, :match_winner, outcome, match),
    do: validate_team_outcome(match, outcome, true)

  defp validate_outcome(:tennis, :match_winner, outcome, match),
    do: validate_team_outcome(match, outcome, false)

  defp validate_outcome(:horse_racing, :match_winner, outcome, _match),
    do: validate_racing_outcome(outcome)

  defp validate_outcome(:dog_racing, :match_winner, outcome, _match),
    do: validate_racing_outcome(outcome)

  defp validate_outcome(:horse_racing, :place, outcome, _match),
    do: validate_racing_outcome(outcome)

  defp validate_outcome(_, _, _, _), do: {:error, :invalid_market_outcome}

  defp validate_team_outcome(%{team1: t1, team2: t2}, outcome, allow_draw) do
    outcome_n = normalize(outcome)
    allowed = [normalize(t1), normalize(t2)] ++ if(allow_draw, do: ["draw"], else: [])

    if outcome_n in allowed, do: :ok, else: {:error, :invalid_market_outcome}
  end

  defp validate_team_outcome(_, outcome, allow_draw) do
    if valid_text?(outcome) and (allow_draw or normalize(outcome) != "draw"),
      do: :ok,
      else: {:error, :invalid_market_outcome}
  end

  defp validate_racing_outcome(outcome) do
    value = normalize(outcome)
    if valid_text?(value), do: :ok, else: {:error, :invalid_market_outcome}
  end

  defp validate_double_chance_outcome(%{team1: t1, team2: t2}, outcome) do
    allowed = [
      "#{normalize(t1)}_or_draw",
      "#{normalize(t2)}_or_draw",
      "#{normalize(t1)}_or_#{normalize(t2)}"
    ]

    if normalize(outcome) in allowed, do: :ok, else: {:error, :invalid_market_outcome}
  end

  defp validate_double_chance_outcome(_, outcome) do
    if normalize(outcome) in ["team1_or_draw", "team2_or_draw", "team1_or_team2"],
      do: :ok,
      else: {:error, :invalid_market_outcome}
  end

  defp validate_btts_outcome(outcome) do
    if normalize(outcome) in ["yes", "no"], do: :ok, else: {:error, :invalid_market_outcome}
  end

  defp validate_football_in_play_outcome(outcome) do
    if normalize(outcome) in ["another_goal_yes", "another_goal_no"],
      do: :ok,
      else: {:error, :invalid_market_outcome}
  end

  defp validate_cricket_in_play_outcome(outcome) do
    if normalize(outcome) in ["another_run_yes", "another_run_no"],
      do: :ok,
      else: {:error, :invalid_market_outcome}
  end

  defp validate_tennis_in_play_outcome(outcome) do
    if normalize(outcome) in ["another_game_yes", "another_game_no"],
      do: :ok,
      else: {:error, :invalid_market_outcome}
  end

  defp validate_tennis_set_betting_outcome(match, outcome) do
    case Back.Betting.MarketSettlement.Tennis.normalize_outcome(match, to_string(outcome)) do
      {:ok, _} -> :ok
      {:error, _} -> {:error, :invalid_market_outcome}
    end
  end

  defp validate_odds_range(sport, bet_type, odds_value) do
    with %{} = by_market <- @odds_bounds[sport],
         {min_v, max_v} <- by_market[bet_type],
         %Decimal{} = odds <- to_decimal(odds_value),
         min_d <- Decimal.from_float(min_v),
         max_d <- Decimal.from_float(max_v),
         true <- Decimal.compare(odds, min_d) in [:eq, :gt],
         true <- Decimal.compare(odds, max_d) in [:eq, :lt] do
      :ok
    else
      nil -> {:error, :sport_market_not_supported}
      false -> {:error, :odds_out_of_allowed_range}
      _ -> {:error, :invalid_odds_value}
    end
  end

  defp to_sport_atom(s) when s in [:cricket, :tennis, :football, :horse_racing, :dog_racing],
    do: s

  defp to_sport_atom("cricket"), do: :cricket
  defp to_sport_atom("tennis"), do: :tennis
  defp to_sport_atom("football"), do: :football
  defp to_sport_atom("horse_racing"), do: :horse_racing
  defp to_sport_atom("dog_racing"), do: :dog_racing
  defp to_sport_atom(_), do: nil

  defp to_bet_type_atom(bt)
       when bt in [
              :match_winner,
              :over_under,
              :in_play,
              :fancy,
              :batsman,
              :partnership,
              :fow,
              :double_chance,
              :btts,
              :set_betting,
              :place
            ],
       do: bt

  defp to_bet_type_atom("match_winner"), do: :match_winner
  defp to_bet_type_atom("over_under"), do: :over_under
  defp to_bet_type_atom("in_play"), do: :in_play
  defp to_bet_type_atom("fancy"), do: :fancy
  defp to_bet_type_atom("batsman"), do: :batsman
  defp to_bet_type_atom("partnership"), do: :partnership
  defp to_bet_type_atom("fow"), do: :fow
  defp to_bet_type_atom("double_chance"), do: :double_chance
  defp to_bet_type_atom("btts"), do: :btts
  defp to_bet_type_atom("set_betting"), do: :set_betting
  defp to_bet_type_atom("place"), do: :place
  defp to_bet_type_atom(_), do: nil

  defp to_decimal(%Decimal{} = d), do: d
  defp to_decimal(v) when is_float(v), do: Decimal.from_float(v)
  defp to_decimal(v) when is_integer(v), do: Decimal.new(v)

  defp to_decimal(v) when is_binary(v) do
    case Decimal.parse(v) do
      {d, ""} -> d
      _ -> nil
    end
  end

  defp to_decimal(_), do: nil

  defp normalize(v) when is_binary(v),
    do: v |> String.trim() |> String.downcase() |> String.replace(" ", "_")

  defp normalize(v), do: v |> to_string() |> normalize()

  defp valid_text?(value) when is_binary(value), do: String.trim(value) != ""
  defp valid_text?(_), do: false
end
