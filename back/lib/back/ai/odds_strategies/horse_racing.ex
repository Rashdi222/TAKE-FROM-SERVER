defmodule Back.AI.OddsStrategies.HorseRacing do
  @behaviour Back.AI.OddsStrategy

  alias Back.AI.OddsStrategies.Shared

  @impl true
  def sport, do: :horse_racing

  @impl true
  def profile do
    %{
      sport: :horse_racing,
      recommended_bet_types: [:match_winner, :place, :in_play],
      notes:
        "Use runner-based outcomes sourced from imported race participants. Avoid team-style totals.",
      timing: %{pre_match: true, live: true, auto_expire_on_close: true}
    }
  end

  @impl true
  def match_winner_rule(match) do
    runners = Shared.racing_runner_names(match)

    case runners do
      [] ->
        "For match_winner: outcomes must use real runner names from the race card when available. Never use team or draw style outcomes."

      values ->
        "For match_winner: outcomes must be selected only from these runner names: #{Enum.map_join(values, ", ", &"\"#{&1}\"")}"
    end
  end

  @impl true
  def bet_type_instruction(:match_winner, match) do
    runners = Shared.racing_runner_names(match)

    if runners == [] do
      "- match_winner: Generate winner odds for race runners using clear runner-name outcomes only."
    else
      "- match_winner: Generate winner odds only for these runners: #{Enum.join(runners, ", ")}."
    end
  end

  def bet_type_instruction(:place, match) do
    runners = Shared.racing_runner_names(match)

    if runners == [] do
      "- place: Generate place odds for race runners where the outcome is the runner name and settlement means finishing in the top 3."
    else
      "- place: Generate place odds only for these runners: #{Enum.join(runners, ", ")}. Settlement means the selected runner finishes in the top 3."
    end
  end

  def bet_type_instruction(:in_play, _match) do
    "- in_play: Generate 3 live race-event odds using descriptive outcome text such as pace position, head-to-head runner edge, or likely finishing move."
  end

  def bet_type_instruction(_, _match), do: ""

  @impl true
  def follow_up_questions do
    [
      %{
        key: "admin_note",
        question: "Any runner spread preference for this horse race?",
        hint: "Example: stronger favorite edge, longer prices for outsiders."
      }
    ]
  end
end
