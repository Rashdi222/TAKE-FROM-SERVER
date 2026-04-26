defmodule Back.AI.OddsStrategies.Tennis do
  @behaviour Back.AI.OddsStrategy

  @impl true
  def sport, do: :tennis

  @impl true
  def profile do
    %{
      sport: :tennis,
      recommended_bet_types: [:match_winner, :over_under, :set_betting, :in_play],
      notes: "No draw outcome for tennis. Keep totals aligned to game-count expectations.",
      timing: %{pre_match: true, live: true, auto_expire_on_close: true}
    }
  end

  @impl true
  def match_winner_rule(match) do
    "For match_winner: outcomes must be \"#{match.team1}\", \"#{match.team2}\""
  end

  @impl true
  def bet_type_instruction(:match_winner, _match),
    do: "- match_winner: Generate odds for team1 win and team2 win only. Do not include draw."

  def bet_type_instruction(:over_under, _match) do
    "- over_under: Generate over/under odds for total games at thresholds: 20, 22, 24. Outcomes: \"over_20\", \"under_20\", \"over_22\", \"under_22\", \"over_24\", \"under_24\""
  end

  def bet_type_instruction(:set_betting, match) do
    "- set_betting: Generate correct set score odds. Allowed outcomes: \"#{normalize(match.team1)}_2_0\", \"#{normalize(match.team1)}_2_1\", \"#{normalize(match.team1)}_3_0\", \"#{normalize(match.team1)}_3_1\", \"#{normalize(match.team1)}_3_2\", \"#{normalize(match.team2)}_2_0\", \"#{normalize(match.team2)}_2_1\", \"#{normalize(match.team2)}_3_0\", \"#{normalize(match.team2)}_3_1\", \"#{normalize(match.team2)}_3_2\"."
  end

  def bet_type_instruction(:in_play, _match) do
    "- in_play: Generate exactly 2 structured live outcomes for whether there will be at least one more game completed before the match ends. Outcomes must be \"another_game_yes\" and \"another_game_no\" only."
  end

  def bet_type_instruction(_, _match), do: ""

  @impl true
  def follow_up_questions, do: []

  defp normalize(value) do
    value
    |> to_string()
    |> String.trim()
    |> String.downcase()
    |> String.replace(" ", "_")
  end
end
