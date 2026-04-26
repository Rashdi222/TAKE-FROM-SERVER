defmodule Back.Betting.BetRejectionLog do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "bet_rejection_logs" do
    field :stake, :decimal
    field :reason, :string
    field :metadata, :map, default: %{}

    belongs_to :user, Back.Accounts.User
    belongs_to :match, Back.Betting.Match
    belongs_to :odds, Back.Betting.Odds

    timestamps(type: :utc_datetime, updated_at: false)
  end

  def changeset(log, attrs) do
    log
    |> cast(attrs, [:user_id, :match_id, :odds_id, :stake, :reason, :metadata])
    |> validate_required([:user_id, :stake, :reason])
    |> validate_number(:stake, greater_than: 0)
    |> foreign_key_constraint(:user_id)
    |> foreign_key_constraint(:match_id)
    |> foreign_key_constraint(:odds_id)
  end
end
