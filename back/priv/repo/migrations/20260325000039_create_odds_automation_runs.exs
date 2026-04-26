defmodule Back.Repo.Migrations.CreateOddsAutomationRuns do
  use Ecto.Migration

  def change do
    create table(:odds_automation_runs, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :match_id, references(:matches, type: :binary_id, on_delete: :delete_all), null: false

      add :competition_feed_id,
          references(:competition_feeds, type: :binary_id, on_delete: :delete_all), null: false

      add :phase, :string, null: false
      add :status, :string, null: false
      add :trigger, :string, null: false
      add :model, :string
      add :generated_count, :integer, null: false, default: 0
      add :state_hash, :string
      add :reason, :text
      add :metadata, :map, null: false, default: %{}

      timestamps(type: :utc_datetime)
    end

    create index(:odds_automation_runs, [:competition_feed_id, :phase, :inserted_at])
    create index(:odds_automation_runs, [:match_id, :phase, :inserted_at])
    create index(:odds_automation_runs, [:status, :inserted_at])
  end
end
