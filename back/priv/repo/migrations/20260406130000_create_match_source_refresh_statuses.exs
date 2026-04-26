defmodule Back.Repo.Migrations.CreateMatchSourceRefreshStatuses do
  use Ecto.Migration

  def change do
    create table(:match_source_refresh_statuses, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :match_id, references(:matches, type: :binary_id, on_delete: :delete_all), null: false
      add :source_name, :string, null: false
      add :source_match_id, :string, null: false
      add :last_status, :string, null: false, default: "idle"
      add :last_requested_at, :utc_datetime
      add :last_completed_at, :utc_datetime
      add :last_message, :text
      add :metadata, :map, null: false, default: %{}

      timestamps(type: :utc_datetime)
    end

    create unique_index(:match_source_refresh_statuses, [:match_id])
    create index(:match_source_refresh_statuses, [:source_name, :source_match_id])
  end
end
