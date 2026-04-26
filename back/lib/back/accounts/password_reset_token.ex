defmodule Back.Accounts.PasswordResetToken do
  use Ecto.Schema
  import Ecto.Changeset

  @purposes ["player_password_reset"]

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "password_reset_tokens" do
    field :purpose, :string, default: "player_password_reset"
    field :token_hash, :string
    field :expires_at, :utc_datetime
    field :used_at, :utc_datetime

    belongs_to :user, Back.Accounts.User
    belongs_to :created_by, Back.Accounts.User

    timestamps(type: :utc_datetime, updated_at: false)
  end

  def changeset(token, attrs) do
    token
    |> cast(attrs, [:user_id, :created_by_id, :purpose, :token_hash, :expires_at, :used_at])
    |> validate_required([:user_id, :purpose, :token_hash, :expires_at])
    |> validate_inclusion(:purpose, @purposes)
    |> unique_constraint(:token_hash)
    |> foreign_key_constraint(:user_id)
    |> foreign_key_constraint(:created_by_id)
  end
end
