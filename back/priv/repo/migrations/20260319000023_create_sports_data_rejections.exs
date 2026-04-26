defmodule Back.Repo.Migrations.CreateSportsDataRejections do
  use Ecto.Migration

  def change do
    create table(:sports_data_rejections, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :provider, :string
      add :provider_event_id, :string
      add :source, :string, null: false
      add :reason, :text, null: false
      add :payload, :map, null: false, default: %{}
      add :diagnostics, :map, null: false, default: %{}
      add :replay_status, :string, null: false, default: "pending"
      add :replayed_at, :utc_datetime

      timestamps(type: :utc_datetime, updated_at: false)
    end

    create index(:sports_data_rejections, [:provider, :inserted_at])
    create index(:sports_data_rejections, [:replay_status, :inserted_at])
    create index(:sports_data_rejections, [:source, :inserted_at])
  end
end
