defmodule Back.Betting.Bet do
  use Ecto.Schema
  import Ecto.Changeset

  @statuses [:pending, :won, :lost, :cancelled]

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "bets" do
    field :stake, :decimal
    field :potential_win, :decimal
    field :status, Ecto.Enum, values: @statuses, default: :pending
    field :is_in_play, :boolean, default: false
    field :result, :string
    field :settled_at, :utc_datetime
    field :match_state_version, :integer, default: 0
    field :odds_version_no, :integer, default: 0
    field :market_key, :string
    field :selection_key, :string
    field :quoted_odds_value, :decimal
    field :accepted_at, :utc_datetime
    field :rejected_reason, :string
    field :client_snapshot, :map, default: %{}

    belongs_to :user, Back.Accounts.User
    belongs_to :match, Back.Betting.Match
    belongs_to :odds, Back.Betting.Odds

    timestamps(type: :utc_datetime)
  end

  @type t :: %__MODULE__{
          id: Ecto.UUID.t() | nil,
          stake: Decimal.t() | nil,
          potential_win: Decimal.t() | nil,
          status: atom() | nil,
          is_in_play: boolean(),
          result: String.t() | nil,
          settled_at: DateTime.t() | nil,
          match_state_version: integer(),
          odds_version_no: integer(),
          market_key: String.t() | nil,
          selection_key: String.t() | nil,
          quoted_odds_value: Decimal.t() | nil,
          accepted_at: DateTime.t() | nil,
          rejected_reason: String.t() | nil,
          client_snapshot: map()
        }

  @spec changeset(t(), map()) :: Ecto.Changeset.t()
  def changeset(bet, attrs) do
    bet
    |> cast(attrs, [
      :user_id,
      :match_id,
      :odds_id,
      :stake,
      :potential_win,
      :is_in_play,
      :match_state_version,
      :odds_version_no,
      :market_key,
      :selection_key,
      :quoted_odds_value,
      :accepted_at,
      :rejected_reason,
      :client_snapshot
    ])
    |> validate_required([:user_id, :match_id, :odds_id, :stake, :potential_win])
    |> validate_number(:stake, greater_than: 0)
    |> validate_number(:potential_win, greater_than: 0)
    |> validate_number(:match_state_version, greater_than_or_equal_to: 0)
    |> validate_number(:odds_version_no, greater_than_or_equal_to: 0)
    |> validate_number(:quoted_odds_value, greater_than: 0)
    |> validate_length(:market_key, max: 160)
    |> validate_length(:selection_key, max: 160)
    |> validate_length(:rejected_reason, max: 255)
    |> foreign_key_constraint(:user_id)
    |> foreign_key_constraint(:match_id)
    |> foreign_key_constraint(:odds_id)
    |> check_constraint(:match_state_version, name: :bets_match_state_version_non_negative)
    |> check_constraint(:odds_version_no, name: :bets_odds_version_no_non_negative)
    |> check_constraint(:quoted_odds_value, name: :bets_quoted_odds_value_positive)
  end

  @spec settle_changeset(t(), map()) :: Ecto.Changeset.t()
  def settle_changeset(bet, attrs) do
    bet
    |> cast(attrs, [:status, :result, :settled_at])
    |> validate_required([:status, :settled_at])
    |> validate_inclusion(:status, [:won, :lost, :cancelled])
  end

  @spec execution_context_changeset(t(), map()) :: Ecto.Changeset.t()
  def execution_context_changeset(bet, attrs) do
    bet
    |> cast(attrs, [
      :match_state_version,
      :odds_version_no,
      :market_key,
      :selection_key,
      :quoted_odds_value,
      :accepted_at,
      :rejected_reason,
      :client_snapshot
    ])
    |> validate_number(:match_state_version, greater_than_or_equal_to: 0)
    |> validate_number(:odds_version_no, greater_than_or_equal_to: 0)
    |> validate_number(:quoted_odds_value, greater_than: 0)
    |> validate_length(:market_key, max: 160)
    |> validate_length(:selection_key, max: 160)
    |> validate_length(:rejected_reason, max: 255)
  end
end
