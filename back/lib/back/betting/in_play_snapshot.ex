defmodule Back.Betting.InPlaySnapshot do
  @moduledoc false

  alias Back.Betting.Match
  alias Back.Betting.MarketSettlement.InPlay.Cricket, as: CricketInPlay
  alias Back.Betting.MarketSettlement.InPlay.Football, as: FootballInPlay
  alias Back.Betting.MarketSettlement.InPlay.Tennis, as: TennisInPlay

  def build(%Match{sport: :football} = match, :in_play), do: FootballInPlay.snapshot(match)
  def build(%Match{sport: "football"} = match, :in_play), do: FootballInPlay.snapshot(match)
  def build(%Match{sport: :cricket} = match, :in_play), do: CricketInPlay.snapshot(match)
  def build(%Match{sport: "cricket"} = match, :in_play), do: CricketInPlay.snapshot(match)
  def build(%Match{sport: :tennis} = match, :in_play), do: TennisInPlay.snapshot(match)
  def build(%Match{sport: "tennis"} = match, :in_play), do: TennisInPlay.snapshot(match)
  def build(_match, _bet_type), do: nil
end
