defmodule Back.Repo.Migrations.CreateSportsDataSyncLogs do
  use Ecto.Migration

  def change do
    create table(:sports_data_sync_logs, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :provider, :string, null: false
      add :source, :string, null: false
      add :status, :string, null: false
      add :fetched_count, :integer, null: false, default: 0
      add :upserted_count, :integer, null: false, default: 0
      add :failed_count, :integer, null: false, default: 0
      add :error, :text
      add :metadata, :map, null: false, default: %{}

      timestamps(type: :utc_datetime, updated_at: false)
    end

    create index(:sports_data_sync_logs, [:provider, :inserted_at])
    create index(:sports_data_sync_logs, [:source, :inserted_at])
    create index(:sports_data_sync_logs, [:status, :inserted_at])
  end
end
