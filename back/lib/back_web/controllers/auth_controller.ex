defmodule BackWeb.AuthController do
  use BackWeb, :controller

  action_fallback BackWeb.FallbackController

  alias Back.Accounts
  alias Back.Auth.Guardian
  alias BackWeb.JsonHelpers

  @doc "POST /api/auth/register — self-registration for self-service players."
  def register(conn, params) do
    with {:ok, user} <- Accounts.register_customer(params),
         {:ok, access_token, _claims} <- Guardian.generate_access_token(user),
         {:ok, refresh_token, _claims} <- Guardian.generate_refresh_token(user) do
      conn
      |> put_status(:created)
      |> json(%{
        user: user_json(user),
        access_token: access_token,
        refresh_token: refresh_token
      })
    end
  end

  @doc "POST /api/auth/login — login for all roles."
  def login(conn, %{"email" => email, "password" => password}) do
    with {:ok, user} <- Accounts.authenticate_user(email, password),
         {:ok, access_token, _claims} <- Guardian.generate_access_token(user),
         {:ok, refresh_token, _claims} <- Guardian.generate_refresh_token(user) do
      json(conn, %{
        user: user_json(user),
        access_token: access_token,
        refresh_token: refresh_token
      })
    end
  end

  @doc "POST /api/auth/logout — revokes the current access token."
  def logout(conn, _params) do
    token = Guardian.Plug.current_token(conn)
    Guardian.revoke_token(token)
    json(conn, %{message: "logged out"})
  end

  @doc "GET /api/auth/me — returns the current authenticated user."
  def me(conn, _params) do
    user = Guardian.Plug.current_resource(conn)
    json(conn, %{user: user_json(user)})
  end

  @doc "POST /api/auth/refresh — exchanges a refresh token for a new access token."
  def refresh(conn, %{"refresh_token" => refresh_token}) do
    with {:ok, _old, {new_access_token, _claims}} <-
           Guardian.exchange(refresh_token, "refresh", "access") do
      json(conn, %{access_token: new_access_token})
    else
      {:error, _reason} ->
        conn |> put_status(:unauthorized) |> json(%{error: "invalid or expired refresh token"})
    end
  end

  @doc "GET /api/auth/reset-password/validate — validate a password reset token."
  def validate_reset_password(conn, %{"token" => token}) do
    with {:ok, result} <- Accounts.validate_player_password_reset_token(token) do
      json(conn, %{data: result})
    end
  end

  @doc "POST /api/auth/reset-password — complete a password reset."
  def reset_password(
        conn,
        %{
          "token" => token,
          "password" => password,
          "password_confirmation" => password_confirmation
        }
      ) do
    with {:ok, _user} <-
           Accounts.complete_player_password_reset(
             token,
             password,
             password_confirmation,
             audit_meta(conn)
           ) do
      json(conn, %{data: %{password_reset: true}})
    end
  end

  # ── Private ───────────────────────────────────────────────────────────────────

  defp user_json(user) do
    %{
      id: user.id,
      email: user.email,
      username: user.username,
      phone_number: user.phone_number,
      country_code: user.country_code,
      role: user.role,
      account_currency: user.account_currency,
      wallet_mode: Accounts.wallet_mode(user) |> Back.Accounts.WalletMode.serialize(),
      balance: JsonHelpers.decimal(user.balance),
      is_active: user.is_active
    }
  end

  defp audit_meta(conn) do
    %{
      ip_address: conn.remote_ip |> :inet.ntoa() |> to_string(),
      user_agent: List.first(get_req_header(conn, "user-agent"))
    }
  rescue
    _ -> %{}
  end
end
