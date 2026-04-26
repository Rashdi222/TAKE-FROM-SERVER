defmodule Back.Cricket.Sportsmonks.Normalizers do
  @moduledoc false

  alias Back.Cricket.Sportsmonks.Normalizers.LineupNormalizer
  alias Back.Cricket.Sportsmonks.Normalizers.ScoreboardNormalizer
  alias Back.Cricket.Sportsmonks.Normalizers.VenueNormalizer

  @spec normalize(map()) :: map()
  def normalize(raw) when is_map(raw) do
    %{
      "venue" => VenueNormalizer.normalize(raw),
      "lineup" => LineupNormalizer.normalize(raw),
      "scoreboard" => ScoreboardNormalizer.normalize(raw)
    }
  end

  def normalize(_), do: normalize(%{})
end
