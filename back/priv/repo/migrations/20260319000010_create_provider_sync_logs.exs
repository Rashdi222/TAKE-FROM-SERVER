defmodule Back.Repo.Migrations.CreateProviderSyncLogs do
  use Ecto.Migration

  def up do
    execute("""
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'provider_sync_status') THEN
        CREATE TYPE provider_sync_status AS ENUM ('success', 'failure', 'partial');
      END IF;
    END$$;
    """)

    create table(:provider_sync_logs, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :provider_id, :binary_id, null: false
      add :sync_type, :string, null: false
      add :status, :provider_sync_status, null: false
      add :error, :text
      add :duration_ms, :integer
      add :metadata, :map

      timestamps(type: :utc_datetime, updated_at: false)
    end

    execute(
      "CREATE INDEX provider_sync_logs_provider_id_inserted_at_desc_index ON provider_sync_logs (provider_id, inserted_at DESC)",
      "DROP INDEX IF EXISTS provider_sync_logs_provider_id_inserted_at_desc_index"
    )

    create index(:provider_sync_logs, [:status])
  end

  def down do
    drop_if_exists index(:provider_sync_logs, [:status])
    execute("DROP INDEX IF EXISTS provider_sync_logs_provider_id_inserted_at_desc_index")
    drop_if_exists table(:provider_sync_logs)

    execute("""
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'provider_sync_status') THEN
        DROP TYPE provider_sync_status;
      END IF;
    END$$;
    """)
  end
end
