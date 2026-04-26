defmodule BackWeb.UserController do
  use BackWeb, :controller

  action_fallback BackWeb.FallbackController

  alias Back.Accounts
  alias Back.Auth.Guardian
  alias BackWeb.JsonHelpers

  # GET /api/user/profile
  def profile(conn, _params) do
    user = Guardian.Plug.current_resource(conn)
    json(conn, %{data: profile_json(user)})
  end

  # GET /api/user/balance
  def balance(conn, _params) do
    user = Guardian.Plug.current_resource(conn)

    json(conn, %{
      balance: JsonHelpers.decimal(user.balance),
      account_currency: user.account_currency
    })
  end

  # GET /api/user/transactions
  def transactions(conn, _params) do
    user = Guardian.Plug.current_resource(conn)
    txs = Accounts.get_user_transactions(user.id)
    json(conn, %{data: Enum.map(txs, &tx_json/1)})
  end

  defp profile_json(u) do
    %{
      id: u.id,
      email: u.email,
      username: u.username,
      phone_number: u.phone_number,
      country_code: u.country_code,
      role: u.role,
      account_currency: u.account_currency,
      wallet_mode: Accounts.wallet_mode(u) |> Back.Accounts.WalletMode.serialize(),
      balance: JsonHelpers.decimal(u.balance),
      is_active: u.is_active,
      inserted_at: u.inserted_at
    }
  end

  defp tx_json(t) do
    %{
      id: t.id,
      amount: JsonHelpers.decimal(t.amount),
      transaction_type: t.transaction_type,
      description: t.description,
      inserted_at: t.inserted_at
    }
  end
end
