defmodule Back.Repo.Migrations.CreateSourceMatchMappingSuggestions do
  use Ecto.Migration

  def change do
    create table(:source_match_mapping_suggestions, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :source_name, :string, null: false
      add :source_match_id, :string, null: false

      add :candidate_canonical_match_id,
          references(:canonical_matches, type: :binary_id, on_delete: :nilify_all)

      add :confidence, :float, null: false, default: 0.0
      add :matched_via, :string, null: false, default: "fuzzy_candidate"
      add :kickoff_delta_seconds, :integer, null: false, default: 0
      add :mapping_status, :string, null: false, default: "suggested"
      add :source_snapshot, :map, null: false, default: %{}
      add :candidate_snapshot, :map, null: false, default: %{}
      add :reviewed_by_id, references(:users, type: :binary_id, on_delete: :nilify_all)
      add :reviewed_at, :utc_datetime
      add :review_note, :text

      timestamps(type: :utc_datetime)
    end

    create unique_index(:source_match_mapping_suggestions, [:source_name, :source_match_id])
    create index(:source_match_mapping_suggestions, [:mapping_status])
    create index(:source_match_mapping_suggestions, [:candidate_canonical_match_id])
    create index(:source_match_mapping_suggestions, [:reviewed_by_id])
  end
end
