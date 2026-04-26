defmodule BackWeb.SuperAdminController do
  use BackWeb, :controller

  action_fallback BackWeb.FallbackController

  alias Back.Accounts
  alias Back.Auth.Guardian
  alias Back.Payments
  alias BackWeb.JsonHelpers

  # GET /api/super-admin/dashboard
  def dashboard(conn, _params) do
    current_user = Guardian.Plug.current_resource(conn)

    json(conn, %{
      data:
        dashboard_json(
          Accounts.get_dashboard_stats(),
          Payments.pending_review_summary(current_user)
        )
    })
  end

  # GET /api/super-admin/master-admins
  def list_master_admins(conn, params) do
    admins = Accounts.list_master_admins(params)
    json(conn, %{data: Enum.map(admins, &user_json/1)})
  end

  # POST /api/super-admin/master-admins
  def create_master_admin(conn, params) do
    current_user = Guardian.Plug.current_resource(conn)

    with {:ok, user} <- Accounts.create_master_admin(params, current_user.id) do
      conn |> put_status(:created) |> json(%{data: user_json(user)})
    end
  end

  # POST /api/super-admin/transfer
  def transfer(conn, %{"to_user_id" => to_id, "amount" => amount}) do
    with {:ok, %{transaction: tx}} <- Accounts.add_balance(to_id, amount) do
      json(conn, %{message: "transfer successful", transaction_id: tx.id})
    end
  end

  # POST /api/super-admin/manual-payment
  def manual_payment(conn, %{"user_id" => user_id, "amount" => amount} = params) do
    description = Map.get(params, "description", "Manual payment by Super Admin")

    with {:ok, %{transaction: tx}} <- Accounts.manual_payment(user_id, amount, description) do
      json(conn, %{message: "payment applied", transaction_id: tx.id})
    end
  end

  # GET /api/super-admin/players
  def list_players(conn, params) do
    players = Accounts.list_all_players(params)
    json(conn, %{data: Enum.map(players, &user_json/1)})
  end

  # GET /api/super-admin/master-admins/:id
  def get_master_admin(conn, %{"id" => id}) do
    user = Accounts.get_user!(id)
    json(conn, %{data: user_json(user)})
  end

  def master_admin_stats(conn, %{"id" => id}) do
    with {:ok, stats} <- Accounts.get_master_admin_detail_stats(id) do
      json(conn, %{data: master_admin_stats_json(stats)})
    end
  end

  def topup_master_admin(conn, %{"id" => id, "amount" => amount}) do
    current_user = Guardian.Plug.current_resource(conn)
    audit_meta = audit_meta(conn)

    with {:ok, %{user: user, transaction: tx}} <-
           Accounts.topup_master_admin(current_user.id, id, amount, audit_meta) do
      conn
      |> put_status(:created)
      |> json(%{data: user_json(user), transaction_id: tx.id, message: "master admin topped up"})
    end
  end

  def deduct_master_admin(conn, %{"id" => id, "amount" => amount}) do
    current_user = Guardian.Plug.current_resource(conn)
    audit_meta = audit_meta(conn)

    with {:ok, %{user: user, transaction: tx}} <-
           Accounts.deduct_master_admin(current_user.id, id, amount, audit_meta) do
      conn
      |> put_status(:created)
      |> json(%{data: user_json(user), transaction_id: tx.id, message: "master admin deducted"})
    end
  end

  # DELETE /api/super-admin/users/:id  (soft deactivate)
  def deactivate_user(conn, %{"id" => id}) do
    with {:ok, _user} <- Accounts.deactivate_user(id) do
      json(conn, %{message: "user deactivated"})
    end
  end

  # POST /api/super-admin/users/:id/risk-controls
  def update_risk_controls(conn, %{"id" => id} = params) do
    attrs =
      %{
        max_stake_per_bet: params["max_stake_per_bet"],
        daily_max_exposure: params["daily_max_exposure"],
        betting_locked: parse_bool(params["betting_locked"]),
        payments_locked: parse_bool(params["payments_locked"])
      }
      |> Enum.reject(fn {_k, v} -> is_nil(v) end)
      |> Map.new()

    with {:ok, user} <- Accounts.update_user(id, attrs) do
      json(conn, %{data: user_json(user)})
    end
  end

  # POST /api/super-admin/users/:id/revoke-session
  def revoke_session(conn, %{"id" => id}) do
    with {:ok, _user} <- Accounts.revoke_user_sessions(id) do
      json(conn, %{message: "user sessions revoked"})
    end
  end

  defp user_json(u) do
    %{
      id: u.id,
      email: u.email,
      username: u.username,
      phone_number: u.phone_number,
      country_code: u.country_code,
      role: u.role,
      account_currency: u.account_currency,
      balance: JsonHelpers.decimal(u.balance),
      is_active: u.is_active,
      max_stake_per_bet: JsonHelpers.decimal(u.max_stake_per_bet),
      daily_max_exposure: JsonHelpers.decimal(u.daily_max_exposure),
      betting_locked: u.betting_locked,
      payments_locked: u.payments_locked,
      session_revoked_at: u.session_revoked_at,
      supported_account_currencies: u.supported_account_currencies || [u.account_currency],
      created_by_id: u.created_by_id,
      inserted_at: u.inserted_at
    }
  end

  defp dashboard_json(stats, payment_summary) do
    %{
      total_users: stats.total_users,
      total_master_admins: stats.total_master_admins,
      total_players: stats.total_players,
      total_balance_on_platform: JsonHelpers.decimal(stats.total_balance_on_platform),
      total_bets: stats.total_bets,
      pending_bets: stats.pending_bets,
      pending_deposits: payment_summary.pending_deposits,
      pending_withdrawals: payment_summary.pending_withdrawals,
      stale_pending_payments: payment_summary.stale_pending_count,
      oldest_pending_payment_at: payment_summary.oldest_pending_at
    }
  end

  defp master_admin_stats_json(stats) do
    %{
      id: stats.id,
      username: stats.username,
      email: stats.email,
      phone_number: stats.phone_number,
      country_code: stats.country_code,
      role: stats.role,
      account_currency: stats.account_currency,
      balance: JsonHelpers.decimal(stats.balance),
      is_active: stats.is_active,
      supported_account_currencies:
        stats.supported_account_currencies || [stats.account_currency],
      total_players: stats.total_players,
      active_players: stats.active_players,
      total_bets: stats.total_bets,
      active_bets: stats.active_bets,
      won_bets: stats.won_bets,
      lost_bets: stats.lost_bets,
      total_stake: JsonHelpers.decimal(stats.total_stake),
      total_winnings: JsonHelpers.decimal(stats.total_winnings),
      recent_players:
        Enum.map(stats.recent_players, fn player ->
          %{
            id: player.id,
            username: player.username,
            email: player.email,
            country_code: player.country_code,
            is_active: player.is_active,
            account_currency: player.account_currency,
            balance: JsonHelpers.decimal(player.balance),
            inserted_at: player.inserted_at
          }
        end),
      recent_activity:
        Enum.map(stats.recent_activity, fn item ->
          %{
            bet_id: item.bet_id,
            user_id: item.user_id,
            username: item.username,
            stake: JsonHelpers.decimal(item.stake),
            potential_win: JsonHelpers.decimal(item.potential_win),
            status: item.status,
            inserted_at: item.inserted_at
          }
        end),
      inserted_at: stats.inserted_at
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

  defp parse_bool(nil), do: nil
  defp parse_bool(v) when v in [true, "true", 1, "1"], do: true
  defp parse_bool(v) when v in [false, "false", 0, "0"], do: false
  defp parse_bool(_), do: nil
end
