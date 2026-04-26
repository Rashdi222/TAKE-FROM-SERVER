defmodule Back.Repo.Migrations.CreateBets do
  use Ecto.Migration

  def change do
    execute(
      "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'bet_status') THEN CREATE TYPE bet_status AS ENUM ('pending','won','lost','cancelled'); END IF; END $$;",
      "DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'bet_status') THEN DROP TYPE bet_status; END IF; END $$;"
    )

    create table(:bets, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :user_id, references(:users, type: :binary_id, on_delete: :restrict), null: false
      add :match_id, references(:matches, type: :binary_id, on_delete: :restrict), null: false
      add :odds_id, references(:odds, type: :binary_id, on_delete: :restrict), null: false
      add :stake, :decimal, precision: 15, scale: 2, null: false
      add :potential_win, :decimal, precision: 15, scale: 2, null: false
      add :status, :bet_status, null: false, default: "pending"
      add :is_in_play, :boolean, null: false, default: false
      add :result, :string
      add :settled_at, :utc_datetime

      timestamps(type: :utc_datetime)
    end

    create index(:bets, [:user_id])
    create index(:bets, [:match_id])
    create index(:bets, [:odds_id])
    create index(:bets, [:status])
  end
end
