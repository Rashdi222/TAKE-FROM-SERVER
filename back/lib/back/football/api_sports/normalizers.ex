defmodule Back.Football.ApiSports.Normalizers do
  @moduledoc false

  alias Back.Football.ApiSports.Normalizers.EventsNormalizer
  alias Back.Football.ApiSports.Normalizers.LineupNormalizer
  alias Back.Football.ApiSports.Normalizers.StatisticsNormalizer
  alias Back.Football.ApiSports.Normalizers.StandingsNormalizer

  def normalize(payload, match) when is_map(payload) do
    lineups = LineupNormalizer.normalize(Map.get(payload, :lineups))
    statistics = StatisticsNormalizer.normalize(Map.get(payload, :statistics))
    events = EventsNormalizer.normalize(Map.get(payload, :events))

    standings =
      StandingsNormalizer.normalize(Map.get(payload, :standings), [match.team1, match.team2])

    %{
      venue: normalize_venue(match.raw_data || %{}),
      officials: normalize_officials(match.raw_data || %{}),
      lineups: lineups,
      formations: extract_formations(lineups),
      coaches: extract_coaches(lineups),
      statistics: statistics,
      events: events,
      standings_snapshot: standings,
      event_highlights: Enum.take(Enum.reverse(events), 5),
      meta: normalize_meta(Map.get(payload, :meta))
    }
  end

  def normalize(_, _), do: %{}

  defp normalize_venue(raw) when is_map(raw) do
    fixture = raw["fixture"] || %{}
    venue = fixture["venue"] || %{}

    %{
      id: venue["id"],
      name: present_string(venue["name"]) || present_string(raw["venue_name"]),
      city: present_string(venue["city"])
    }
  end

  defp normalize_venue(_), do: %{}

  defp normalize_officials(raw) when is_map(raw) do
    fixture = raw["fixture"] || %{}

    %{
      referee: present_string(fixture["referee"])
    }
  end

  defp normalize_officials(_), do: %{}

  defp extract_formations(lineups) do
    Enum.map(lineups, fn lineup ->
      %{
        team_name: lineup.team_name,
        formation: lineup.formation
      }
    end)
  end

  defp extract_coaches(lineups) do
    Enum.map(lineups, fn lineup ->
      %{
        team_name: lineup.team_name,
        coach: lineup.coach
      }
    end)
  end

  defp normalize_meta(meta) when is_map(meta) do
    %{
      events: normalize_lane_meta(meta[:events] || meta["events"]),
      lineups: normalize_lane_meta(meta[:lineups] || meta["lineups"]),
      statistics: normalize_lane_meta(meta[:statistics] || meta["statistics"]),
      standings: normalize_lane_meta(meta[:standings] || meta["standings"])
    }
  end

  defp normalize_meta(_), do: %{}

  defp normalize_lane_meta(nil), do: %{status: "unavailable", message: nil, updated_at: nil}

  defp normalize_lane_meta(meta) when is_map(meta) do
    %{
      status: present_string(meta[:status] || meta["status"]) || "unavailable",
      message: present_string(meta[:message] || meta["message"]),
      updated_at: present_string(meta[:updated_at] || meta["updated_at"])
    }
  end

  defp normalize_lane_meta(_), do: %{status: "unavailable", message: nil, updated_at: nil}

  defp present_string(value) when is_binary(value) do
    case String.trim(value) do
      "" -> nil
      trimmed -> trimmed
    end
  end

  defp present_string(_), do: nil
end
