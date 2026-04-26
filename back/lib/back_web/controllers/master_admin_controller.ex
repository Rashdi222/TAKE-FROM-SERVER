defmodule BackWeb.MasterAdminController do
  use BackWeb, :controller

  action_fallback BackWeb.FallbackController

  alias Back.Accounts
  alias Back.Auth.Guardian
  alias Back.Payments
  alias BackWeb.JsonHelpers

  # GET /api/master-admin/dashboard
  def dashboard(conn, _params) do
    current_user = Guardian.Plug.current_resource(conn)

    json(conn, %{
      data:
        dashboard_json(
          Accounts.get_master_admin_stats(current_user.id),
          current_user,
          Payments.pending_review_summary(current_user)
        )
    })
  end

  # POST /api/master-admin/players
  def create_player(conn, params) do
    current_user = Guardian.Plug.current_resource(conn)

    with {:ok, %{player: player}} <- Accounts.create_player_account(params, current_user.id) do
      conn |> put_status(:created) |> json(%{data: player_json(player)})
    else
      {:error, :balance_check, :insufficient_balance, _} ->
        conn |> put_status(:unprocessable_entity) |> json(%{error: "insufficient balance"})

      {:error, :account_currency, reason, _} ->
        {:error, reason}

      {:error, :player, changeset, _} ->
        conn |> put_status(:unprocessable_entity) |> json(%{errors: format_errors(changeset)})

      {:error, _step, reason, _} ->
        conn |> put_status(:bad_request) |> json(%{error: to_string(reason)})
    end
  end

  # GET /api/master-admin/players
  def list_players(conn, _params) do
    current_user = Guardian.Plug.current_resource(conn)
    players = Accounts.list_players_by_master(current_user.id)
    json(conn, %{data: Enum.map(players, &player_json/1)})
  end

  # GET /api/master-admin/transactions
  def transactions(conn, _params) do
    current_user = Guardian.Plug.current_resource(conn)
    txs = Accounts.get_user_transactions(current_user.id)
    json(conn, %{data: Enum.map(txs, &tx_json(&1, current_user.id))})
  end

  # POST /api/master-admin/players/:id/topup
  def topup_player(conn, %{"id" => player_id, "amount" => amount}) do
    current_user = Guardian.Plug.current_resource(conn)
    audit_meta = audit_meta(conn)

    with {:ok, %{transaction: tx}} <-
           Accounts.topup_player_by_master(current_user.id, player_id, amount, audit_meta) do
      conn
      |> put_status(:created)
      |> json(%{message: "topup successful", transaction_id: tx.id})
    end
  end

  # POST /api/master-admin/players/:id/deduct
  def deduct_player(conn, %{"id" => player_id, "amount" => amount}) do
    current_user = Guardian.Plug.current_resource(conn)
    audit_meta = audit_meta(conn)

    with {:ok, %{transaction: tx}} <-
           Accounts.deduct_player_by_master(current_user.id, player_id, amount, audit_meta) do
      conn
      |> put_status(:created)
      |> json(%{message: "deduction successful", transaction_id: tx.id})
    end
  end

  # GET /api/master-admin/players/:id/ledger
  def player_ledger(conn, %{"id" => player_id} = params) do
    current_user = Guardian.Plug.current_resource(conn)

    with {:ok, txs} <- Accounts.get_player_ledger(current_user.id, player_id, params) do
      json(conn, %{data: Enum.map(txs, &tx_json(&1, current_user.id))})
    end
  end

  # GET /api/master-admin/players/:id/stats
  def player_stats(conn, %{"id" => player_id}) do
    current_user = Guardian.Plug.current_resource(conn)

    with {:ok, stats} <- Accounts.get_player_stats(current_user.id, player_id) do
      json(conn, %{data: stats})
    end
  end

  # GET /api/master-admin/players/:id/bets-report
  def player_bets_report(conn, %{"id" => player_id} = params) do
    current_user = Guardian.Plug.current_resource(conn)

    opts = %{
      "status" => params["status"],
      "from" => params["from"],
      "to" => params["to"],
      "limit" => params["limit"],
      "offset" => params["offset"]
    }

    with {:ok, report} <- Accounts.get_player_bets_report(current_user.id, player_id, opts) do
      json(conn, %{data: report})
    end
  end

  # GET /api/master-admin/players/:id/report-export
  def player_report_export(conn, %{"id" => player_id} = params) do
    current_user = Guardian.Plug.current_resource(conn)

    opts = %{
      "period" => params["period"],
      "from" => params["from"],
      "to" => params["to"]
    }

    with {:ok, report} <- Accounts.export_player_report(current_user.id, player_id, opts) do
      json(conn, %{data: report})
    end
  end

  # POST /api/master-admin/players/:id/set-password
  def set_player_password(
        conn,
        %{
          "id" => player_id,
          "password" => password,
          "password_confirmation" => password_confirmation
        }
      ) do
    current_user = Guardian.Plug.current_resource(conn)

    with {:ok, _player} <-
           Accounts.set_player_password_by_master(
             current_user.id,
             player_id,
             password,
             password_confirmation,
             audit_meta(conn)
           ) do
      json(conn, %{data: %{player_id: player_id, password_updated: true}})
    end
  end

  # POST /api/master-admin/players/:id/password-reset-link
  def generate_player_password_reset_link(conn, %{"id" => player_id} = params) do
    current_user = Guardian.Plug.current_resource(conn)
    reset_base_url = params["reset_base_url"] || params["base_url"] || default_reset_base_url()

    with {:ok, result} <-
           Accounts.generate_player_password_reset_link_by_master(
             current_user.id,
             player_id,
             reset_base_url,
             audit_meta(conn)
           ) do
      json(conn, %{data: result})
    end
  end

  defp player_json(u) do
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
      inserted_at: u.inserted_at
    }
  end

  defp tx_json(t, actor_id) do
    direction =
      cond do
        t.to_user_id == actor_id and t.from_user_id == actor_id -> "internal"
        t.to_user_id == actor_id -> "credit"
        t.from_user_id == actor_id -> "debit"
        true -> "neutral"
      end

    %{
      id: t.id,
      amount: JsonHelpers.decimal(t.amount),
      transaction_type: t.transaction_type,
      type: t.transaction_type,
      direction: direction,
      status: "completed",
      from_user_id: t.from_user_id,
      to_user_id: t.to_user_id,
      counterparty_user_id:
        cond do
          t.to_user_id == actor_id -> t.from_user_id
          t.from_user_id == actor_id -> t.to_user_id
          true -> nil
        end,
      description: t.description,
      inserted_at: t.inserted_at
    }
  end

  defp dashboard_json(stats, current_user, payment_summary) do
    %{
      account_currency: current_user.account_currency,
      balance: JsonHelpers.decimal(stats.balance),
      total_player_balance: JsonHelpers.decimal(stats.total_player_balance),
      total_players: stats.total_players,
      total_bets: stats.total_bets,
      pending_bets: stats.pending_bets,
      pending_deposits: payment_summary.pending_deposits,
      pending_withdrawals: payment_summary.pending_withdrawals,
      stale_pending_payments: payment_summary.stale_pending_count,
      oldest_pending_payment_at: payment_summary.oldest_pending_at,
      supported_account_currencies:
        stats.supported_account_currencies || [current_user.account_currency]
    }
  end

  defp format_errors(changeset) do
    Ecto.Changeset.traverse_errors(changeset, fn {msg, opts} ->
      Enum.reduce(opts, msg, fn {k, v}, acc -> String.replace(acc, "%{#{k}}", to_string(v)) end)
    end)
  end

  defp audit_meta(conn) do
    %{
      ip_address: conn.remote_ip |> :inet.ntoa() |> to_string(),
      user_agent: List.first(get_req_header(conn, "user-agent"))
    }
  rescue
    _ -> %{}
  end

  defp default_reset_base_url do
    "http://localhost:3000/reset-password"
  end
end
