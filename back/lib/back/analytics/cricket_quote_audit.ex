defmodule Back.Analytics.CricketQuoteAudit do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "cricket_quote_audits" do
    field :state_version, :integer
    field :event_seq, :integer
    field :market_key, :string
    field :selection_key, :string
    field :published_price, :decimal
    field :confidence_score, :float
    field :valid_for_ms, :integer
    field :reviewer_decision, :string
    field :reviewer_flags, {:array, :string}, default: []
    field :active_playbooks, {:array, :string}, default: []
    field :lifecycle_analytics, :map, default: %{}
    field :fair_probability, :float
    field :display_probability, :float
    field :approved_probability, :float
    field :reference_source, :string
    field :reference_price, :decimal
    field :reference_probability, :float
    field :reference_probability_delta, :float
    field :eventual_match_status, :string
    field :eventual_winner, :string
    field :resolved_at, :utc_datetime

    belongs_to :match, Back.Betting.Match
    belongs_to :odds, Back.Betting.Odds

    timestamps(type: :utc_datetime, updated_at: false)
  end

  def changeset(audit, attrs) do
    audit
    |> cast(attrs, [
      :match_id,
      :odds_id,
      :state_version,
      :event_seq,
      :market_key,
      :selection_key,
      :published_price,
      :confidence_score,
      :valid_for_ms,
      :reviewer_decision,
      :reviewer_flags,
      :active_playbooks,
      :lifecycle_analytics,
      :fair_probability,
      :display_probability,
      :approved_probability,
      :reference_source,
      :reference_price,
      :reference_probability,
      :reference_probability_delta,
      :eventual_match_status,
      :eventual_winner,
      :resolved_at
    ])
    |> validate_required([
      :match_id,
      :state_version,
      :event_seq,
      :market_key,
      :selection_key,
      :published_price
    ])
    |> foreign_key_constraint(:match_id)
    |> foreign_key_constraint(:odds_id)
  end
end
