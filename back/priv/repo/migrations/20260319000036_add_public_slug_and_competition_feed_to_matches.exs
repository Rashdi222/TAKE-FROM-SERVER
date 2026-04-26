defmodule Back.Repo.Migrations.AddPublicSlugAndCompetitionFeedToMatches do
  use Ecto.Migration

  def up do
    alter table(:matches) do
      add :slug, :string

      add :competition_feed_id,
          references(:competition_feeds, type: :binary_id, on_delete: :nilify_all)
    end

    create index(:matches, [:slug])
    create index(:matches, [:competition_feed_id])

    execute("""
    UPDATE matches
    SET slug = trim(both '-' from regexp_replace(
      lower(
        coalesce(team1, 'match') || '-' ||
        coalesce(team2, 'event') || '-' ||
        to_char(start_time, 'YYYY-MM-DD')
      ),
      '[^a-z0-9]+',
      '-',
      'g'
    ))
    WHERE slug IS NULL;
    """)

    execute("""
    UPDATE matches
    SET competition_feed_id = NULLIF(raw_data->'_competition_feed'->>'id', '')::uuid
    WHERE competition_feed_id IS NULL
      AND raw_data ? '_competition_feed'
      AND NULLIF(raw_data->'_competition_feed'->>'id', '') IS NOT NULL;
    """)
  end

  def down do
    drop index(:matches, [:competition_feed_id])
    drop index(:matches, [:slug])

    alter table(:matches) do
      remove :competition_feed_id
      remove :slug
    end
  end
end
