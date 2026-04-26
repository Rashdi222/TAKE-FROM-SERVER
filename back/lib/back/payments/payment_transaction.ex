defmodule Back.Payments.PaymentTransaction do
  use Ecto.Schema
  import Ecto.Changeset

  @statuses [:pending, :completed, :failed, :cancelled]
  @types ["deposit", "withdrawal"]

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "payment_transactions" do
    field :amount, :decimal
    field :status, Ecto.Enum, values: @statuses, default: :pending
    field :type, :string, default: "deposit"
    field :provider_transaction_id, :string
    field :provider_response, :map
    field :receipt_path, :string
    field :reviewed_at, :utc_datetime

    belongs_to :user, Back.Accounts.User
    belongs_to :payment_method, Back.Payments.PaymentMethod
    belongs_to :transaction, Back.Accounts.Transaction
    belongs_to :approval_owner, Back.Accounts.User
    belongs_to :reviewed_by, Back.Accounts.User

    timestamps(type: :utc_datetime)
  end

  def changeset(pt, attrs) do
    pt
    |> cast(attrs, [
      :user_id,
      :payment_method_id,
      :transaction_id,
      :amount,
      :status,
      :type,
      :provider_transaction_id,
      :provider_response,
      :approval_owner_id,
      :reviewed_by_id,
      :reviewed_at,
      :receipt_path
    ])
    |> validate_required([:user_id, :amount, :approval_owner_id, :type])
    |> validate_number(:amount, greater_than: 0)
    |> validate_inclusion(:status, @statuses)
    |> validate_inclusion(:type, @types)
    |> foreign_key_constraint(:user_id)
    |> foreign_key_constraint(:payment_method_id)
    |> foreign_key_constraint(:transaction_id)
    |> foreign_key_constraint(:approval_owner_id)
    |> foreign_key_constraint(:reviewed_by_id)
  end

  def complete_changeset(pt, provider_tx_id, response) do
    pt
    |> change(
      status: :completed,
      provider_transaction_id: provider_tx_id,
      provider_response: response,
      reviewed_at: DateTime.utc_now() |> DateTime.truncate(:second)
    )
  end

  def fail_changeset(pt, response) do
    pt
    |> change(
      status: :failed,
      provider_response: response,
      reviewed_at: DateTime.utc_now() |> DateTime.truncate(:second)
    )
  end
end
