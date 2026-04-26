defmodule Back.Providers.PublicCompetitions do
  import Ecto.Query

  alias Back.Repo
  alias Back.Betting.Match
  alias Back.Betting.MatchSlug
  alias Back.Providers.CompetitionFeed

  def list_public_tournaments do
    CompetitionFeed
    |> join(:inner, [f], m in Match, on: m.competition_feed_id == f.id)
    |> where([f, _m], f.enabled == true)
    |> group_by([f, _m], [
      f.id,
      f.name,
      f.sport,
      f.competition_key,
      f.season_id,
      f.inserted_at,
      f.updated_at
    ])
    |> select([f, m], %{
      id: f.id,
      name: f.name,
      sport: f.sport,
      competition_key: f.competition_key,
      season_id: f.season_id,
      match_count: count(m.id),
      next_match_time: min(m.start_time),
      inserted_at: f.inserted_at,
      updated_at: f.updated_at
    })
    |> order_by([f, _m], asc: f.sport, asc: f.name)
    |> Repo.all()
    |> Enum.map(&Map.put(&1, :slug, tournament_slug(&1)))
  end

  def get_public_tournament(id) do
    tournament =
      CompetitionFeed
      |> where([f], f.id == ^id and f.enabled == true)
      |> select([f], %{
        id: f.id,
        name: f.name,
        sport: f.sport,
        competition_key: f.competition_key,
        season_id: f.season_id,
        inserted_at: f.inserted_at,
        updated_at: f.updated_at
      })
      |> Repo.one()

    case tournament do
      nil ->
        nil

      tournament ->
        matches =
          Match
          |> where([m], m.competition_feed_id == ^id)
          |> order_by([m], asc: m.start_time)
          |> Repo.all()

        tournament
        |> Map.put(:slug, tournament_slug(tournament))
        |> Map.put(:match_count, length(matches))
        |> Map.put(:next_match_time, matches |> List.first() |> then(&(&1 && &1.start_time)))
        |> Map.put(:matches, matches)
    end
  end

  def tournament_slug(%{name: name, season_id: season_id}) do
    [name, season_id]
    |> Enum.reject(&(is_nil(&1) or to_string(&1) == ""))
    |> Enum.join(" ")
    |> MatchSlug.slugify()
  end
end
