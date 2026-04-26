defmodule Back.MultiSource.Schemas.CanonicalMarketState do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "canonical_market_states" do
    field :market_key, :string
    field :status, :string, default: "active"
    field :suspension_reason, :string
    field :suspension_sources, {:array, :string}, default: []
    field :last_consensus_source, :string
    field :consensus_version, :integer, default: 0
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
      :status,
      :suspension_reason,
      :suspension_sources,
      :last_consensus_source,
      :consensus_version,
      :payload,
      :source_snapshots,
      :last_consensus_at
    ])
    |> validate_required([:canonical_match_id, :market_key, :status, :consensus_version])
    |> foreign_key_constraint(:canonical_match_id)
    |> unique_constraint([:canonical_match_id, :market_key])
  end
end
