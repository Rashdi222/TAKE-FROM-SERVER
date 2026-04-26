defmodule Back.AI.OddsStrategies.Football do
  @behaviour Back.AI.OddsStrategy

  @impl true
  def sport, do: :football

  @impl true
  def profile do
    %{
      sport: :football,
      recommended_bet_types: [:match_winner, :over_under, :double_chance, :btts, :in_play],
      notes:
        "Use goal-line aware pricing and draw-aware match winner. Keep live markets responsive to score state.",
      timing: %{pre_match: true, live: true, auto_expire_on_close: true}
    }
  end

  @impl true
  def match_winner_rule(match) do
    "For match_winner: outcomes must be \"#{match.team1}\", \"#{match.team2}\", \"draw\""
  end

  @impl true
  def bet_type_instruction(:match_winner, _match),
    do: "- match_winner: Generate odds for home/team1 win, away/team2 win, and draw."

  def bet_type_instruction(:over_under, _match) do
    "- over_under: Generate over/under odds for total goals at thresholds: 1.5, 2.5, 3.5. Outcomes: \"over_1_5\", \"under_1_5\", \"over_2_5\", \"under_2_5\", \"over_3_5\", \"under_3_5\""
  end

  def bet_type_instruction(:double_chance, match) do
    "- double_chance: Generate exactly 3 outcomes: \"#{normalize(match.team1)}_or_draw\", \"#{normalize(match.team2)}_or_draw\", \"#{normalize(match.team1)}_or_#{normalize(match.team2)}\"."
  end

  def bet_type_instruction(:btts, _match) do
    "- btts: Generate both-teams-to-score odds with outcomes \"yes\" and \"no\" only."
  end

  def bet_type_instruction(:in_play, _match) do
    "- in_play: Generate exactly 2 structured live outcomes for whether there will be another goal before full time. Outcomes must be \"another_goal_yes\" and \"another_goal_no\" only."
  end

  def bet_type_instruction(_, _match), do: ""

  @impl true
  def follow_up_questions do
    [
      %{
        key: "admin_note",
        question: "Should the goal lines be aggressive or conservative for this football match?",
        hint: "Example: tighten over 2.5 and keep draw odds balanced."
      }
    ]
  end

  defp normalize(value) do
    value
    |> to_string()
    |> String.trim()
    |> String.downcase()
    |> String.replace(" ", "_")
  end
end
