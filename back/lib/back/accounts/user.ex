defmodule Back.Accounts.User do
  use Ecto.Schema
  import Ecto.Changeset

  @roles [:super_admin, :master_admin, :player, :customer]
  @master_admin_types [:volume_based, :loss_based]
  @account_currencies Back.Accounts.AccountCurrency.supported_codes()

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "users" do
    field :email, :string
    field :username, :string
    field :phone_number, :string
    field :country_code, :string
    field :password, :string, virtual: true
    field :password_hash, :string
    field :role, Ecto.Enum, values: @roles, default: :customer
    field :account_currency, :string, default: "PKR"
    field :supported_account_currencies, {:array, :string}, default: []
    field :balance, :decimal, default: Decimal.new("0.00")
    field :wallet_version, :integer, default: 0
    field :last_balance_changed_at, :utc_datetime
    field :is_active, :boolean, default: true
    field :master_admin_type, Ecto.Enum, values: @master_admin_types
    field :commission_percentage, :decimal
    field :volume_margin, :decimal
    field :max_stake_per_bet, :decimal
    field :daily_max_exposure, :decimal
    field :betting_locked, :boolean, default: false
    field :payments_locked, :boolean, default: false
    field :session_revoked_at, :utc_datetime

    belongs_to :created_by, __MODULE__
    has_many :created_users, __MODULE__, foreign_key: :created_by_id
    has_many :password_reset_tokens, Back.Accounts.PasswordResetToken
    has_many :bets, Back.Betting.Bet
    has_many :sent_transactions, Back.Accounts.Transaction, foreign_key: :from_user_id
    has_many :received_transactions, Back.Accounts.Transaction, foreign_key: :to_user_id

    timestamps(type: :utc_datetime)
  end

  def registration_changeset(user, attrs) do
    user
    |> cast(attrs, [
      :email,
      :username,
      :phone_number,
      :country_code,
      :password,
      :role,
      :account_currency,
      :balance,
      :created_by_id
    ])
    |> validate_required([:email, :password, :account_currency])
    |> validate_format(:email, ~r/^[^\s]+@[^\s]+$/, message: "must be a valid email")
    |> validate_username()
    |> normalize_phone_number()
    |> validate_phone_number()
    |> normalize_country_code()
    |> validate_country_code()
    |> validate_length(:password, min: 8)
    |> validate_inclusion(:role, @roles)
    |> validate_inclusion(:account_currency, @account_currencies)
    |> unique_constraint(:email)
    |> unique_constraint(:username)
    |> put_password_hash()
  end

  def master_admin_changeset(user, attrs) do
    user
    |> cast(attrs, [
      :email,
      :username,
      :phone_number,
      :country_code,
      :password,
      :account_currency,
      :supported_account_currencies,
      :balance,
      :created_by_id
    ])
    |> validate_required([:email, :password, :account_currency])
    |> validate_format(:email, ~r/^[^\s]+@[^\s]+$/, message: "must be a valid email")
    |> validate_username()
    |> normalize_phone_number()
    |> validate_phone_number()
    |> normalize_country_code()
    |> validate_country_code()
    |> validate_length(:password, min: 8)
    |> validate_inclusion(:account_currency, @account_currencies)
    |> normalize_supported_account_currencies()
    |> validate_supported_account_currencies()
    |> unique_constraint(:email)
    |> unique_constraint(:username)
    |> put_change(:role, :master_admin)
    |> put_password_hash()
  end

  def update_changeset(user, attrs) do
    user
    |> cast(attrs, [
      :email,
      :username,
      :phone_number,
      :country_code,
      :account_currency,
      :supported_account_currencies,
      :is_active,
      :commission_percentage,
      :volume_margin,
      :max_stake_per_bet,
      :daily_max_exposure,
      :betting_locked,
      :payments_locked,
      :session_revoked_at
    ])
    |> validate_format(:email, ~r/^[^\s]+@[^\s]+$/, message: "must be a valid email")
    |> validate_username()
    |> normalize_phone_number()
    |> validate_phone_number()
    |> normalize_country_code()
    |> validate_country_code()
    |> validate_inclusion(:account_currency, @account_currencies)
    |> normalize_supported_account_currencies()
    |> validate_supported_account_currencies()
    |> validate_number(:max_stake_per_bet, greater_than: 0)
    |> validate_number(:daily_max_exposure, greater_than: 0)
    |> unique_constraint(:email)
    |> unique_constraint(:username)
  end

  def balance_changeset(user, attrs) do
    user
    |> cast(attrs, [:balance, :wallet_version, :last_balance_changed_at])
    |> validate_required([:balance])
    |> validate_number(:balance, greater_than_or_equal_to: 0)
    |> validate_number(:wallet_version, greater_than_or_equal_to: 0)
    |> check_constraint(:wallet_version, name: :users_wallet_version_non_negative)
  end

  def password_update_changeset(user, attrs) do
    user
    |> cast(attrs, [:password, :session_revoked_at])
    |> validate_required([:password])
    |> validate_length(:password, min: 8)
    |> put_password_hash()
  end

  defp put_password_hash(%Ecto.Changeset{valid?: true, changes: %{password: pw}} = cs) do
    change(cs, password_hash: Bcrypt.hash_pwd_salt(pw))
  end

  defp put_password_hash(cs), do: cs

  defp normalize_supported_account_currencies(changeset) do
    primary = get_field(changeset, :account_currency)
    current = get_field(changeset, :supported_account_currencies) || []

    normalized =
      current
      |> List.wrap()
      |> Enum.map(fn
        value when is_binary(value) -> value |> String.trim() |> String.upcase()
        value -> value |> to_string() |> String.trim() |> String.upcase()
      end)
      |> Enum.reject(&(&1 == ""))
      |> then(fn values -> if primary in [nil, ""], do: values, else: [primary | values] end)
      |> Enum.uniq()

    put_change(changeset, :supported_account_currencies, normalized)
  end

  defp validate_supported_account_currencies(changeset) do
    currencies = get_field(changeset, :supported_account_currencies) || []

    invalid =
      currencies
      |> Enum.reject(&(&1 in @account_currencies))

    if invalid == [] do
      changeset
    else
      add_error(changeset, :supported_account_currencies, "contains unsupported currencies")
    end
  end

  defp validate_username(changeset) do
    changeset
    |> validate_length(:username, min: 3, max: 20)
    |> validate_format(:username, ~r/^[a-zA-Z0-9_]+$/,
      message: "must be 3-20 chars and only letters, numbers, underscore"
    )
  end

  defp validate_phone_number(changeset) do
    validate_format(
      changeset,
      :phone_number,
      ~r/^\+?[1-9]\d{6,14}$/,
      message: "must be a valid international phone number"
    )
  end

  defp normalize_phone_number(changeset) do
    update_change(changeset, :phone_number, fn
      value when is_binary(value) ->
        trimmed = String.trim(value)
        had_plus = String.starts_with?(trimmed, "+")
        digits = String.replace(trimmed, ~r/\D/u, "")

        cond do
          digits == "" -> nil
          had_plus -> "+" <> digits
          true -> digits
        end

      value ->
        value
    end)
  end

  defp normalize_country_code(changeset) do
    update_change(changeset, :country_code, fn
      value when is_binary(value) -> value |> String.trim() |> String.upcase()
      value -> value
    end)
  end

  defp validate_country_code(changeset) do
    changeset
    |> validate_length(:country_code, is: 2)
    |> validate_format(:country_code, ~r/^[A-Z]{2}$/, message: "must be a valid ISO country code")
  end
end
