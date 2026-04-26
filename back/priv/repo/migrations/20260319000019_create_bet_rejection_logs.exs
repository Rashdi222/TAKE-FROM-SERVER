defmodule Back.Repo.Migrations.CreateBetRejectionLogs do
  use Ecto.Migration

  def change do
    create table(:bet_rejection_logs, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :user_id, references(:users, type: :binary_id, on_delete: :delete_all), null: false
      add :match_id, references(:matches, type: :binary_id, on_delete: :nilify_all)
      add :odds_id, references(:odds, type: :binary_id, on_delete: :nilify_all)
      add :stake, :decimal, precision: 18, scale: 2, null: false
      add :reason, :string, null: false
      add :metadata, :map, null: false, default: %{}

      timestamps(type: :utc_datetime, updated_at: false)
    end

    create index(:bet_rejection_logs, [:user_id, :inserted_at])
    create index(:bet_rejection_logs, [:match_id, :inserted_at])
    create index(:bet_rejection_logs, [:reason, :inserted_at])
  end
end
