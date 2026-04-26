defmodule BackWeb.PublicCompetitionController do
  use BackWeb, :controller

  alias Back.Providers

  def index(conn, _params) do
    tournaments = Providers.list_public_tournaments()
    json(conn, %{data: Enum.map(tournaments, &tournament_json/1)})
  end

  def show(conn, %{"id" => id}) do
    case Providers.get_public_tournament(id) do
      nil ->
        conn
        |> put_status(:not_found)
        |> json(%{error: "tournament not found"})

      tournament ->
        json(conn, %{data: tournament_json(tournament, true)})
    end
  end

  defp tournament_json(tournament, include_matches \\ false) do
    base = %{
      id: tournament.id,
      name: tournament.name,
      slug: tournament.slug,
      sport: tournament.sport,
      competition_key: tournament.competition_key,
      season_id: tournament.season_id,
      match_count: tournament.match_count,
      next_match_time: tournament.next_match_time,
      inserted_at: tournament.inserted_at,
      updated_at: tournament.updated_at
    }

    if include_matches do
      Map.put(base, :matches, Enum.map(tournament.matches, &match_json/1))
    else
      base
    end
  end

  defp match_json(match) do
    %{
      id: match.id,
      slug: match.slug,
      sport: match.sport,
      team1: match.team1,
      team2: match.team2,
      start_time: match.start_time,
      status: match.status,
      winner: match.winner,
      in_play_enabled: match.in_play_enabled,
      competition_feed_id: match.competition_feed_id,
      inserted_at: match.inserted_at
    }
  end
end
