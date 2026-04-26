defmodule Back.Repo.Migrations.CreateMatches do
  use Ecto.Migration

  def change do
    execute(
      "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sport_type') THEN CREATE TYPE sport_type AS ENUM ('cricket','tennis'); END IF; END $$;",
      "DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sport_type') THEN DROP TYPE sport_type; END IF; END $$;"
    )

    execute(
      "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'match_status') THEN CREATE TYPE match_status AS ENUM ('upcoming','live','closed','settled','cancelled'); END IF; END $$;",
      "DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'match_status') THEN DROP TYPE match_status; END IF; END $$;"
    )

    create table(:matches, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :sport, :sport_type, null: false
      add :team1, :string, null: false
      add :team2, :string, null: false
      add :start_time, :utc_datetime, null: false
      add :status, :match_status, null: false, default: "upcoming"
      add :winner, :string
      add :in_play_enabled, :boolean, null: false, default: false
      add :created_by_id, references(:users, type: :binary_id, on_delete: :nilify_all)

      timestamps(type: :utc_datetime)
    end

    create index(:matches, [:sport])
    create index(:matches, [:status])
    create index(:matches, [:start_time])
    create index(:matches, [:created_by_id])
  end
end
