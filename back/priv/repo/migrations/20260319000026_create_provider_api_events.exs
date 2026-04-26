defmodule Back.Repo.Migrations.CreateProviderApiEvents do
  use Ecto.Migration

  def change do
    create table(:provider_api_events, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :provider_key, :string, null: false
      add :event_type, :string, null: false
      add :payload, :map, null: false, default: %{}
      add :actor_id, references(:users, type: :binary_id, on_delete: :nilify_all)

      timestamps(type: :utc_datetime, updated_at: false)
    end

    create index(:provider_api_events, [:provider_key, :inserted_at])
    create index(:provider_api_events, [:event_type, :inserted_at])

    create constraint(:provider_api_events, :provider_api_events_event_type_allowed,
             check:
               "event_type IN ('request_ok', 'request_failed', 'request_blocked', 'auto_paused', 'manual_paused', 'resumed', 'settings_changed')"
           )
  end
end
