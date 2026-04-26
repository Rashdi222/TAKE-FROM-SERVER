defmodule Back.Repo.Migrations.CreateMultiSourceAutomationEvents do
  use Ecto.Migration

  def change do
    create table(:multi_source_automation_events, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :event_type, :string, null: false
      add :status, :string, null: false
      add :source_name, :string
      add :source_match_id, :string
      add :match_id, references(:matches, type: :binary_id, on_delete: :nilify_all)

      add :canonical_match_id,
          references(:canonical_matches, type: :binary_id, on_delete: :nilify_all)

      add :message, :text
      add :metadata, :map, null: false, default: %{}

      timestamps(type: :utc_datetime)
    end

    create index(:multi_source_automation_events, [:event_type, :inserted_at])
    create index(:multi_source_automation_events, [:source_name, :source_match_id])
    create index(:multi_source_automation_events, [:match_id, :inserted_at])
  end
end
