defmodule Back.Repo.Migrations.CreateCanonicalOddsStates do
  use Ecto.Migration

  def change do
    create table(:canonical_odds_states, primary_key: false) do
      add :id, :binary_id, primary_key: true

      add :canonical_match_id,
          references(:canonical_matches, type: :binary_id, on_delete: :delete_all),
          null: false

      add :market_key, :string, null: false
      add :selection_key, :string, null: false
      add :status, :string, null: false, default: "active"
      add :canonical_price, :decimal
      add :last_consensus_source, :string
      add :consensus_version, :integer, null: false, default: 0
      add :high_water_mark_ms, :bigint, null: false, default: 0
      add :payload, :map, null: false, default: %{}
      add :source_snapshots, :map, null: false, default: %{}
      add :last_consensus_at, :utc_datetime

      timestamps(type: :utc_datetime)
    end

    create unique_index(:canonical_odds_states, [:canonical_match_id, :market_key, :selection_key])

    create index(:canonical_odds_states, [:canonical_match_id, :market_key])
    create index(:canonical_odds_states, [:status])
  end
end
