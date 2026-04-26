defmodule Back.AI.OddsStrategies.Cricket do
  @behaviour Back.AI.OddsStrategy

  @impl true
  def sport, do: :cricket

  @impl true
  def profile do
    %{
      sport: :cricket,
      recommended_bet_types: [:match_winner, :over_under, :in_play],
      notes:
        "Cricket over/under uses run thresholds. Draw-aware match winner is allowed where applicable.",
      timing: %{pre_match: true, live: true, auto_expire_on_close: true}
    }
  end

  @impl true
  def match_winner_rule(match) do
    "For match_winner: outcomes must be \"#{match.team1}\", \"#{match.team2}\", \"draw\""
  end

  @impl true
  def bet_type_instruction(:match_winner, _match),
    do: "- match_winner: Generate odds for team1 win, team2 win, and draw."

  def bet_type_instruction(:over_under, _match) do
    "- over_under: Generate over/under odds for total runs at thresholds: 150, 200, 250, 300. Outcomes: \"over_150\", \"under_150\", \"over_200\", \"under_200\", \"over_250\", \"under_250\", \"over_300\", \"under_300\""
  end

  def bet_type_instruction(:in_play, _match) do
    "- in_play: Generate exactly 2 structured live outcomes for whether there will be at least one more run scored before the match ends. Outcomes must be \"another_run_yes\" and \"another_run_no\" only."
  end

  def bet_type_instruction(_, _match), do: ""

  @impl true
  def follow_up_questions do
    [
      %{
        key: "admin_note",
        question: "Any innings or scoring-tempo preference for this cricket match?",
        hint: "Example: keep totals a little conservative if the pitch looks slow."
      }
    ]
  end
end
