defmodule Back.MultiSource.Schemas.CanonicalOddsState do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "canonical_odds_states" do
    field :market_key, :string
    field :selection_key, :string
    field :status, :string, default: "active"
    field :canonical_price, :decimal
    field :last_consensus_source, :string
    field :consensus_version, :integer, default: 0
    field :high_water_mark_ms, :integer, default: 0
    field :payload, :map, default: %{}
    field :source_snapshots, :map, default: %{}
    field :last_consensus_at, :utc_datetime

    belongs_to :canonical_match, Back.MultiSource.Schemas.CanonicalMatch

    timestamps(type: :utc_datetime)
  end

  def changeset(state, attrs) do
    state
    |> cast(attrs, [
      :canonical_match_id,
      :market_key,
      :selection_key,
      :status,
      :canonical_price,
      :last_consensus_source,
      :consensus_version,
      :high_water_mark_ms,
      :payload,
      :source_snapshots,
      :last_consensus_at
    ])
    |> validate_required([
      :canonical_match_id,
      :market_key,
      :selection_key,
      :status,
      :consensus_version,
      :high_water_mark_ms
    ])
    |> foreign_key_constraint(:canonical_match_id)
    |> unique_constraint([:canonical_match_id, :market_key, :selection_key])
  end
end
