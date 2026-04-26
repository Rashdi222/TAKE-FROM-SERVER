defmodule Back.MultiSource.Schemas.CanonicalMatch do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "canonical_matches" do
    field :sport, :string
    field :competition_name, :string
    field :start_time, :utc_datetime
    field :anchor_source_name, :string
    field :anchor_source_match_id, :string
    field :status, :string, default: "scheduled"
    field :metadata, :map, default: %{}

    belongs_to :home_team, Back.MultiSource.Schemas.CanonicalTeam
    belongs_to :away_team, Back.MultiSource.Schemas.CanonicalTeam
    has_many :source_mappings, Back.MultiSource.Schemas.SourceMatchMapping
    has_many :market_states, Back.MultiSource.Schemas.CanonicalMarketState
    has_many :odds_states, Back.MultiSource.Schemas.CanonicalOddsState

    timestamps(type: :utc_datetime)
  end

  def changeset(match, attrs) do
    match
    |> cast(attrs, [
      :sport,
      :competition_name,
      :start_time,
      :home_team_id,
      :away_team_id,
      :anchor_source_name,
      :anchor_source_match_id,
      :status,
      :metadata
    ])
    |> validate_required([:sport, :start_time, :home_team_id, :away_team_id, :status])
    |> foreign_key_constraint(:home_team_id)
    |> foreign_key_constraint(:away_team_id)
    |> unique_constraint([:anchor_source_name, :anchor_source_match_id])
  end
end
