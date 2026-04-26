defmodule Back.Payments.PaymentMethod do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "payment_methods" do
    field :provider, :string
    field :method_name, :string
    field :is_active, :boolean, default: false
    field :supports_deposit, :boolean, default: true
    field :supports_withdrawal, :boolean, default: false
    field :logo_path, :string
    field :preset_key, :string
    field :bank_name, :string
    field :account_title, :string
    field :iban_or_account_number, :string
    field :instructions, :string
    field :account_label_hint, :string
    field :account_number_label, :string
    field :account_number_placeholder, :string
    field :instructions_hint, :string
    field :sort_order, :integer, default: 0

    belongs_to :created_by, Back.Accounts.User
    belongs_to :updated_by, Back.Accounts.User
    has_many :payment_transactions, Back.Payments.PaymentTransaction

    timestamps(type: :utc_datetime)
  end

  def changeset(method, attrs) do
    method
    |> cast(attrs, [
      :provider,
      :method_name,
      :is_active,
      :supports_deposit,
      :supports_withdrawal,
      :logo_path,
      :preset_key,
      :bank_name,
      :account_title,
      :iban_or_account_number,
      :instructions,
      :account_label_hint,
      :account_number_label,
      :account_number_placeholder,
      :instructions_hint,
      :sort_order,
      :created_by_id,
      :updated_by_id
    ])
    |> validate_required([
      :provider,
      :method_name,
      :account_title,
      :iban_or_account_number,
      :instructions,
      :created_by_id
    ])
    |> validate_length(:provider, min: 2, max: 50)
    |> validate_length(:method_name, min: 2, max: 120)
    |> validate_length(:instructions, min: 3, max: 2000)
    |> validate_number(:sort_order, greater_than_or_equal_to: 0)
    |> validate_payment_flow_enabled()
    |> unique_constraint(:method_name, name: :payment_methods_owner_provider_method_name_index)
  end

  defp validate_payment_flow_enabled(changeset) do
    if get_field(changeset, :supports_deposit) || get_field(changeset, :supports_withdrawal) do
      changeset
    else
      add_error(
        changeset,
        :supports_deposit,
        "enable deposit or withdrawal support for this method"
      )
    end
  end
end
