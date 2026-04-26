defmodule Back.Repo.Migrations.CreateMultiSourceArbiterFoundation do
  use Ecto.Migration

  def change do
    create table(:canonical_teams, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :sport, :string, null: false
      add :name, :string, null: false
      add :slug, :string
      add :metadata, :map, null: false, default: %{}

      timestamps(type: :utc_datetime)
    end

    create unique_index(:canonical_teams, [:sport, :name])
    create unique_index(:canonical_teams, [:slug])

    create table(:source_team_mappings, primary_key: false) do
      add :id, :binary_id, primary_key: true

      add :canonical_team_id,
          references(:canonical_teams, type: :binary_id, on_delete: :delete_all), null: false

      add :source_name, :string, null: false
      add :source_team_id, :string, null: false
      add :source_team_name, :string
      add :mapping_status, :string, null: false, default: "manual_confirmed"
      add :matched_via, :string, null: false, default: "manual_admin"
      add :metadata, :map, null: false, default: %{}

      timestamps(type: :utc_datetime)
    end

    create unique_index(:source_team_mappings, [:source_name, :source_team_id])
    create index(:source_team_mappings, [:canonical_team_id])

    create table(:canonical_matches, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :sport, :string, null: false
      add :competition_name, :string
      add :start_time, :utc_datetime, null: false

      add :home_team_id, references(:canonical_teams, type: :binary_id, on_delete: :restrict),
        null: false

      add :away_team_id, references(:canonical_teams, type: :binary_id, on_delete: :restrict),
        null: false

      add :anchor_source_name, :string
      add :anchor_source_match_id, :string
      add :status, :string, null: false, default: "scheduled"
      add :metadata, :map, null: false, default: %{}

      timestamps(type: :utc_datetime)
    end

    create index(:canonical_matches, [:sport, :start_time])

    create unique_index(:canonical_matches, [:anchor_source_name, :anchor_source_match_id],
             where: "anchor_source_name IS NOT NULL AND anchor_source_match_id IS NOT NULL"
           )

    create table(:source_match_mappings, primary_key: false) do
      add :id, :binary_id, primary_key: true

      add :canonical_match_id,
          references(:canonical_matches, type: :binary_id, on_delete: :delete_all), null: false

      add :source_name, :string, null: false
      add :source_match_id, :string, null: false
      add :home_source_team_id, :string
      add :away_source_team_id, :string
      add :mapping_status, :string, null: false, default: "manual_confirmed"
      add :matched_via, :string, null: false, default: "manual_admin"
      add :confidence, :float, null: false, default: 1.0
      add :kickoff_delta_seconds, :integer, null: false, default: 0
      add :metadata, :map, null: false, default: %{}

      timestamps(type: :utc_datetime)
    end

    create unique_index(:source_match_mappings, [:source_name, :source_match_id])
    create index(:source_match_mappings, [:canonical_match_id])

    create table(:canonical_market_states, primary_key: false) do
      add :id, :binary_id, primary_key: true

      add :canonical_match_id,
          references(:canonical_matches, type: :binary_id, on_delete: :delete_all), null: false

      add :market_key, :string, null: false
      add :status, :string, null: false, default: "active"
      add :suspension_reason, :string
      add :suspension_sources, {:array, :string}, null: false, default: []
      add :last_consensus_source, :string
      add :consensus_version, :integer, null: false, default: 0
      add :payload, :map, null: false, default: %{}
      add :source_snapshots, :map, null: false, default: %{}
      add :last_consensus_at, :utc_datetime

      timestamps(type: :utc_datetime)
    end

    create unique_index(:canonical_market_states, [:canonical_match_id, :market_key])
    create index(:canonical_market_states, [:status])
  end
end
