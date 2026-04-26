defmodule Back.MarketSettlementParsingTest do
  use Back.DataCase, async: true

  alias Back.Betting.Match
  alias Back.Betting.MarketSettlement.InPlay.Cricket, as: CricketInPlaySettlement
  alias Back.Betting.MarketSettlement.InPlay.Football, as: FootballInPlaySettlement
  alias Back.Betting.MarketSettlement.InPlay.Tennis, as: TennisInPlaySettlement

  test "cricket in-play total extraction reads runs and ignores wickets/overs digits" do
    match = %Match{
      sport: :cricket,
      score: %{"score" => "120/3 (15.2)"},
      raw_data: %{}
    }

    assert {:ok, 120} = CricketInPlaySettlement.extract_total_runs(match)
  end

  test "football in-play goal extraction prefers explicit score pair over time digits" do
    match = %Match{
      sport: :football,
      score: %{"score" => "45+2 1-0"},
      raw_data: %{}
    }

    assert {:ok, 1, 0} = FootballInPlaySettlement.extract_goal_pair(match)
  end

  test "tennis in-play total extraction uses first valid score source without duplicate overcount" do
    match = %Match{
      sport: :tennis,
      score: %{},
      raw_data: %{
        "result" => %{"scores" => "6-4, 3-6, 7-5"},
        "event_game_result" => "16-15"
      }
    }

    assert {:ok, 31} = TennisInPlaySettlement.extract_total_games(match)
  end
end
