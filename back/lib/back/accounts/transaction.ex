defmodule Back.Accounts.Transaction do
  use Ecto.Schema
  import Ecto.Changeset

  @types [
    :credit,
    :debit,
    :bet_placed,
    :bet_won,
    :bet_lost,
    :transfer,
    :commission,
    :manual_payment
  ]

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "transactions" do
    field :amount, :decimal
    field :transaction_type, Ecto.Enum, values: @types
    field :reference_id, :binary_id
    field :description, :string

    belongs_to :from_user, Back.Accounts.User
    belongs_to :to_user, Back.Accounts.User

    timestamps(type: :utc_datetime)
  end

  def changeset(transaction, attrs) do
    transaction
    |> cast(attrs, [
      :from_user_id,
      :to_user_id,
      :amount,
      :transaction_type,
      :reference_id,
      :description
    ])
    |> validate_required([:to_user_id, :amount, :transaction_type])
    |> validate_number(:amount, greater_than: 0)
    |> validate_inclusion(:transaction_type, @types)
    |> foreign_key_constraint(:from_user_id)
    |> foreign_key_constraint(:to_user_id)
  end
end
