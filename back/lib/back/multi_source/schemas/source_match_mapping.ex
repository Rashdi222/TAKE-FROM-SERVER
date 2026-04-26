defmodule Back.MultiSource.Schemas.SourceMatchMapping do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "source_match_mappings" do
    field :source_name, :string
    field :source_match_id, :string
    field :home_source_team_id, :string
    field :away_source_team_id, :string
    field :mapping_status, :string, default: "manual_confirmed"
    field :matched_via, :string, default: "manual_admin"
    field :confidence, :float, default: 1.0
    field :kickoff_delta_seconds, :integer, default: 0
    field :metadata, :map, default: %{}

    belongs_to :canonical_match, Back.MultiSource.Schemas.CanonicalMatch
    timestamps(type: :utc_datetime)
  end

  def changeset(mapping, attrs) do
    mapping
    |> cast(attrs, [
      :canonical_match_id,
      :source_name,
      :source_match_id,
      :home_source_team_id,
      :away_source_team_id,
      :mapping_status,
      :matched_via,
      :confidence,
      :kickoff_delta_seconds,
      :metadata
    ])
    |> validate_required([
      :canonical_match_id,
      :source_name,
      :source_match_id,
      :mapping_status,
      :matched_via
    ])
    |> foreign_key_constraint(:canonical_match_id)
    |> unique_constraint([:source_name, :source_match_id])
  end
end
