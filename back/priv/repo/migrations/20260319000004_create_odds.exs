defmodule Back.Repo.Migrations.CreateOdds do
  use Ecto.Migration

  def change do
    execute(
      "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'bet_type') THEN CREATE TYPE bet_type AS ENUM ('match_winner','over_under','in_play'); END IF; END $$;",
      "DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'bet_type') THEN DROP TYPE bet_type; END IF; END $$;"
    )

    create table(:odds, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :match_id, references(:matches, type: :binary_id, on_delete: :delete_all), null: false
      add :bet_type, :bet_type, null: false
      add :outcome, :string, null: false
      add :odds_value, :decimal, precision: 8, scale: 2, null: false
      add :is_active, :boolean, null: false, default: true
      add :ai_generated, :boolean, null: false, default: false
      add :ai_model, :string

      timestamps(type: :utc_datetime)
    end

    create index(:odds, [:match_id])
    create index(:odds, [:bet_type])
    create index(:odds, [:is_active])
  end
end
