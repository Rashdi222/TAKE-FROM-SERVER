defmodule Back.MultiSource.Schemas.SourceTeamMapping do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "source_team_mappings" do
    field :source_name, :string
    field :source_team_id, :string
    field :source_team_name, :string
    field :mapping_status, :string, default: "manual_confirmed"
    field :matched_via, :string, default: "manual_admin"
    field :metadata, :map, default: %{}

    belongs_to :canonical_team, Back.MultiSource.Schemas.CanonicalTeam
    timestamps(type: :utc_datetime)
  end

  def changeset(mapping, attrs) do
    mapping
    |> cast(attrs, [
      :canonical_team_id,
      :source_name,
      :source_team_id,
      :source_team_name,
      :mapping_status,
      :matched_via,
      :metadata
    ])
    |> validate_required([
      :canonical_team_id,
      :source_name,
      :source_team_id,
      :mapping_status,
      :matched_via
    ])
    |> foreign_key_constraint(:canonical_team_id)
    |> unique_constraint([:source_name, :source_team_id])
  end
end
