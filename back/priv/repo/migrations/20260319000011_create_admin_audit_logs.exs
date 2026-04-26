defmodule Back.Repo.Migrations.CreateAdminAuditLogs do
  use Ecto.Migration

  def change do
    create table(:admin_audit_logs, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :actor_id, references(:users, type: :binary_id), null: false
      add :action, :string, null: false
      add :target_type, :string
      add :target_id, :binary_id
      add :payload, :map
      add :ip_address, :string
      add :user_agent, :text

      timestamps(type: :utc_datetime, updated_at: false)
    end

    execute(
      "CREATE INDEX admin_audit_logs_actor_id_inserted_at_desc_index ON admin_audit_logs (actor_id, inserted_at DESC)",
      "DROP INDEX IF EXISTS admin_audit_logs_actor_id_inserted_at_desc_index"
    )

    create index(:admin_audit_logs, [:target_type, :target_id])
    create index(:admin_audit_logs, [:action])
  end
end
