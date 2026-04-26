defmodule Back.MultiSource.Schemas.SourceMatchMappingSuggestion do
  use Ecto.Schema
  import Ecto.Changeset

  @statuses ~w(suggested manual_confirmed rejected needs_review)

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "source_match_mapping_suggestions" do
    field :source_name, :string
    field :source_match_id, :string
    field :confidence, :float, default: 0.0
    field :matched_via, :string, default: "fuzzy_candidate"
    field :kickoff_delta_seconds, :integer, default: 0
    field :mapping_status, :string, default: "suggested"
    field :source_snapshot, :map, default: %{}
    field :candidate_snapshot, :map, default: %{}
    field :reviewed_at, :utc_datetime
    field :review_note, :string

    belongs_to :candidate_canonical_match, Back.MultiSource.Schemas.CanonicalMatch
    belongs_to :reviewed_by, Back.Accounts.User

    timestamps(type: :utc_datetime)
  end

  def changeset(suggestion, attrs) do
    suggestion
    |> cast(attrs, [
      :source_name,
      :source_match_id,
      :candidate_canonical_match_id,
      :confidence,
      :matched_via,
      :kickoff_delta_seconds,
      :mapping_status,
      :source_snapshot,
      :candidate_snapshot,
      :reviewed_by_id,
      :reviewed_at,
      :review_note
    ])
    |> validate_required([:source_name, :source_match_id, :matched_via, :mapping_status])
    |> validate_inclusion(:mapping_status, @statuses)
    |> foreign_key_constraint(:candidate_canonical_match_id)
    |> foreign_key_constraint(:reviewed_by_id)
    |> unique_constraint([:source_name, :source_match_id])
  end
end
