defmodule Back.Repo.Migrations.CreateSportsEvents do
  use Ecto.Migration

  def change do
    create table(:sports_events, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :provider, :string, null: false
      add :provider_event_id, :string, null: false
      add :sport, :string, null: false
      add :competition_name, :string
      add :status, :string, null: false, default: "scheduled"
      add :start_time_utc, :utc_datetime
      add :participants, {:array, :map}, null: false, default: []
      add :result, :map
      add :raw, :map

      timestamps(type: :utc_datetime)
    end

    create unique_index(:sports_events, [:provider, :provider_event_id])
    create index(:sports_events, [:sport])
    create index(:sports_events, [:status])
    create index(:sports_events, [:start_time_utc])
  end
end
