defmodule Back.MultiSource.Schemas.CanonicalTeam do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "canonical_teams" do
    field :sport, :string
    field :name, :string
    field :slug, :string
    field :metadata, :map, default: %{}

    has_many :source_mappings, Back.MultiSource.Schemas.SourceTeamMapping
    timestamps(type: :utc_datetime)
  end

  def changeset(team, attrs) do
    team
    |> cast(attrs, [:sport, :name, :slug, :metadata])
    |> validate_required([:sport, :name])
    |> unique_constraint([:sport, :name])
    |> unique_constraint(:slug)
  end
end
