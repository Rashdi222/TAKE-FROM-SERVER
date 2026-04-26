defmodule Back.Betting.Odds do
  use Ecto.Schema
  import Ecto.Changeset

  @bet_types [:match_winner, :over_under, :in_play, :double_chance, :btts, :set_betting, :place]
  @visibility_statuses [:draft, :published, :archived]
  @limit_scopes [:global, :market, :selection]
  @source_types ~w(platform provider_import)

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "odds" do
    field :bet_type, Ecto.Enum, values: @bet_types
    field :outcome, :string
    field :odds_value, :decimal
    field :is_active, :boolean, default: true
    field :ai_generated, :boolean, default: false
    field :ai_model, :string
    field :visibility_status, Ecto.Enum, values: @visibility_statuses, default: :draft
    field :version_no, :integer, default: 1
    field :admin_note, :string
    field :published_at, :utc_datetime
    field :max_stake_amount, :decimal
    field :max_payout_amount, :decimal
    field :limit_scope, Ecto.Enum, values: @limit_scopes, default: :market
    field :source_type, :string, default: "platform"
    field :source_provider, :string
    field :source_external_id, :string
    field :source_market_key, :string
    field :provider_snapshot, :map

    belongs_to :match, Back.Betting.Match
    belongs_to :published_by, Back.Accounts.User
    has_many :bets, Back.Betting.Bet

    timestamps(type: :utc_datetime)
  end

  def changeset(odds, attrs) do
    odds
    |> cast(attrs, [
      :match_id,
      :bet_type,
      :outcome,
      :odds_value,
      :is_active,
      :ai_generated,
      :ai_model,
      :visibility_status,
      :version_no,
      :admin_note,
      :published_by_id,
      :published_at,
      :max_stake_amount,
      :max_payout_amount,
      :limit_scope,
      :source_type,
      :source_provider,
      :source_external_id,
      :source_market_key,
      :provider_snapshot
    ])
    |> validate_required([:match_id, :bet_type, :outcome, :odds_value])
    |> validate_inclusion(:bet_type, @bet_types)
    |> validate_inclusion(:visibility_status, @visibility_statuses)
    |> validate_number(:version_no, greater_than_or_equal_to: 1)
    |> validate_number(:odds_value, greater_than: 1.0)
    |> validate_number(:max_stake_amount, greater_than: 0)
    |> validate_number(:max_payout_amount, greater_than: 0)
    |> validate_inclusion(:limit_scope, @limit_scopes)
    |> validate_inclusion(:source_type, @source_types)
    |> validate_published_tracking_fields()
    |> validate_provider_source_fields()
    |> foreign_key_constraint(:match_id)
    |> foreign_key_constraint(:published_by_id)
  end

  defp validate_published_tracking_fields(changeset) do
    case get_field(changeset, :visibility_status) do
      :published ->
        changeset
        |> validate_required([:published_by_id, :published_at])

      _ ->
        changeset
    end
  end

  defp validate_provider_source_fields(changeset) do
    case get_field(changeset, :source_type) do
      "provider_import" ->
        changeset
        |> validate_required([:source_provider])

      _ ->
        changeset
    end
  end
end
