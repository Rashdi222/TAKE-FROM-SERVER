defmodule BackWeb.PaymentController do
  use BackWeb, :controller

  action_fallback BackWeb.FallbackController

  alias Back.Payments
  alias Back.Accounts.PasswordResetSupport
  alias Back.Auth.Guardian

  # ── Payment Methods (Super Admin) ─────────────────────────────────────────────

  def list_methods(conn, _params) do
    actor = Guardian.Plug.current_resource(conn)

    json(conn, %{
      data: Enum.map(Payments.list_payment_methods_for_owner(actor), &payment_method_json/1)
    })
  end

  def configure(conn, params) do
    user = Guardian.Plug.current_resource(conn)

    with {:ok, method} <- Payments.configure_payment_method(params, user) do
      json(conn, %{data: payment_method_json(method)})
    end
  end

  def update_method(conn, %{"id" => id} = params) do
    user = Guardian.Plug.current_resource(conn)

    with {:ok, method} <- Payments.update_payment_method(id, params, user) do
      json(conn, %{data: payment_method_json(method)})
    end
  end

  def my_methods(conn, _params) do
    user = Guardian.Plug.current_resource(conn)

    json(conn, %{
      data: Enum.map(Payments.list_payment_methods_for_owner(user), &payment_method_json/1)
    })
  end

  def show_method(conn, %{"id" => id}) do
    actor = Guardian.Plug.current_resource(conn)
    json(conn, %{data: payment_method_json(Payments.get_payment_method_for_owner!(id, actor))})
  end

  def activate(conn, %{"id" => id}) do
    actor = Guardian.Plug.current_resource(conn)

    with method <- Payments.get_payment_method!(id),
         {:ok, updated} <- Payments.set_active(method, true, actor) do
      json(conn, %{data: payment_method_json(updated)})
    end
  end

  def deactivate(conn, %{"id" => id}) do
    actor = Guardian.Plug.current_resource(conn)

    with method <- Payments.get_payment_method!(id),
         {:ok, updated} <- Payments.set_active(method, false, actor) do
      json(conn, %{data: payment_method_json(updated)})
    end
  end

  # ── Deposits ──────────────────────────────────────────────────────────────────

  def list_active_methods(conn, params) do
    user = Guardian.Plug.current_resource(conn)
    purpose = params["purpose"]

    with {:ok, methods} <- Payments.list_active_payment_methods_for_user(user, purpose) do
      json(conn, %{data: methods})
    end
  end

  def support_contacts(conn, _params) do
    user = Guardian.Plug.current_resource(conn)

    with {:ok, result} <- PasswordResetSupport.resolve_support_for_user(user) do
      json(conn, %{data: result})
    end
  end

  def upload_deposit_receipt(conn, %{"receipt" => %Plug.Upload{} = receipt}) do
    user = Guardian.Plug.current_resource(conn)

    with {:ok, stored} <- Payments.store_deposit_receipt(receipt, user) do
      conn
      |> put_status(:created)
      |> json(%{data: stored})
    end
  end

  def upload_method_logo(conn, %{"logo" => %Plug.Upload{} = logo}) do
    actor = Guardian.Plug.current_resource(conn)

    with {:ok, stored} <- Payments.store_payment_method_logo(logo, actor) do
      conn
      |> put_status(:created)
      |> json(%{data: stored})
    end
  end

  def initiate_deposit(conn, %{"amount" => amount} = params) do
    user = Guardian.Plug.current_resource(conn)
    method_id = params["payment_method_id"]
    receipt_path = params["receipt_path"]

    if user.payments_locked do
      {:error, :payments_locked}
    else
      with {:ok, pt} <-
             Payments.create_deposit_request(user, amount, method_id, receipt_path: receipt_path) do
        conn |> put_status(:created) |> json(%{data: %{payment_transaction_id: pt.id}})
      end
    end
  end

  # ── EasyPaisa IPN Callback (public endpoint) ──────────────────────────────────

  def easypaisa_ipn(conn, params) do
    case Payments.handle_easypaisa_ipn(params) do
      {:ok, _} ->
        json(conn, %{status: "ok"})

      {:error, :invalid_signature} ->
        conn |> put_status(401) |> json(%{error: "invalid_signature"})

      # silent ack to prevent retry loops
      {:error, :replay_detected} ->
        json(conn, %{status: "ok"})

      {:error, :transaction_not_found} ->
        conn |> put_status(404) |> json(%{error: "not_found"})

      {:error, reason} ->
        conn |> put_status(422) |> json(%{error: reason})
    end
  end

  # ── Withdrawals ───────────────────────────────────────────────────────────────

  def request_withdrawal(
        conn,
        %{"amount" => amount, "payment_method_id" => payment_method_id} = params
      ) do
    user = Guardian.Plug.current_resource(conn)
    account_title = params["account_title"]
    account_number = params["account_number"]

    with {:ok, pt} <-
           Payments.request_withdrawal(user.id, amount, payment_method_id,
             account_title: account_title,
             account_number: account_number
           ) do
      conn
      |> put_status(:created)
      |> json(%{data: %{payment_transaction_id: pt.id, status: pt.status}})
    end
  end

  def approve_withdrawal(conn, %{"id" => id}) do
    admin = Guardian.Plug.current_resource(conn)

    with {:ok, %{payment_tx: pt}} <- Payments.approve_withdrawal(id, admin) do
      json(conn, %{data: %{id: pt.id, status: pt.status}})
    end
  end

  def approve_deposit(conn, %{"id" => id}) do
    admin = Guardian.Plug.current_resource(conn)

    with {:ok, %{payment_tx: pt}} <- Payments.approve_deposit(id, admin) do
      json(conn, %{data: %{id: pt.id, status: pt.status}})
    end
  end

  def reject_deposit(conn, %{"id" => id} = params) do
    admin = Guardian.Plug.current_resource(conn)

    with {:ok, %{payment_tx: pt}} <- Payments.reject_deposit(id, admin, params["reason"]) do
      json(conn, %{data: %{id: pt.id, status: pt.status}})
    end
  end

  def reject_withdrawal(conn, %{"id" => id} = params) do
    admin = Guardian.Plug.current_resource(conn)

    with {:ok, %{payment_tx: pt}} <- Payments.reject_withdrawal(id, admin, params["reason"]) do
      json(conn, %{data: %{id: pt.id, status: pt.status}})
    end
  end

  def super_admin_receipt(conn, %{"id" => id}) do
    actor = Guardian.Plug.current_resource(conn)

    with {:ok, receipt} <- Payments.fetch_receipt_for_actor(id, actor) do
      conn
      |> put_resp_content_type(receipt.content_type)
      |> put_resp_header("content-disposition", ~s(inline; filename="#{receipt.file_name}"))
      |> send_file(200, receipt.path)
    end
  end

  def master_admin_receipt(conn, %{"id" => id}) do
    actor = Guardian.Plug.current_resource(conn)

    with {:ok, receipt} <- Payments.fetch_receipt_for_actor(id, actor) do
      conn
      |> put_resp_content_type(receipt.content_type)
      |> put_resp_header("content-disposition", ~s(inline; filename="#{receipt.file_name}"))
      |> send_file(200, receipt.path)
    end
  end

  def public_logo(conn, %{"path" => path_segments}) do
    with {:ok, logo} <- Payments.fetch_payment_method_logo(path_segments) do
      conn
      |> put_resp_content_type(logo.content_type)
      |> put_resp_header("cache-control", "public, max-age=86400")
      |> put_resp_header("content-disposition", ~s(inline; filename="#{logo.file_name}"))
      |> send_file(200, logo.path)
    end
  end

  # ── Payment Transaction History ───────────────────────────────────────────────

  def my_transactions(conn, _params) do
    user = Guardian.Plug.current_resource(conn)

    json(conn, %{
      data: Enum.map(Payments.list_payment_transactions(user.id), &payment_transaction_json/1)
    })
  end

  def all_transactions(conn, _params) do
    json(conn, %{
      data: Enum.map(Payments.list_payment_transactions(), &payment_transaction_json/1)
    })
  end

  def owner_transactions(conn, _params) do
    actor = Guardian.Plug.current_resource(conn)

    json(conn, %{
      data:
        Enum.map(Payments.list_review_transactions_for_owner(actor), &payment_transaction_json/1)
    })
  end

  def pending_transactions(conn, _params) do
    actor = Guardian.Plug.current_resource(conn)

    transactions =
      case actor.role do
        :super_admin -> Payments.list_pending_review_transactions()
        _ -> Payments.list_pending_review_transactions(actor)
      end

    json(conn, %{data: Enum.map(transactions, &payment_transaction_json/1)})
  end

  def pending_summary(conn, _params) do
    actor = Guardian.Plug.current_resource(conn)

    summary =
      case actor.role do
        :super_admin -> Payments.pending_review_summary()
        _ -> Payments.pending_review_summary(actor)
      end

    json(conn, %{data: payment_summary_json(summary)})
  end

  defp payment_transaction_json(tx) do
    %{
      id: tx.id,
      user_id: tx.user_id,
      payment_method_id: tx.payment_method_id,
      amount: decimal_json(tx.amount),
      type: tx.type,
      status: tx.status,
      provider_transaction_id: tx.provider_transaction_id,
      provider_response: tx.provider_response,
      approval_owner_id: tx.approval_owner_id,
      reviewed_by_id: tx.reviewed_by_id,
      reviewed_at: tx.reviewed_at,
      receipt_path: tx.receipt_path,
      inserted_at: tx.inserted_at,
      updated_at: tx.updated_at,
      player: player_json(tx.user),
      payment_method: payment_method_json(tx.payment_method),
      approval_owner: actor_json(tx.approval_owner),
      reviewed_by: actor_json(tx.reviewed_by)
    }
  end

  defp player_json(nil), do: nil

  defp player_json(user) do
    %{
      id: user.id,
      username: user.username,
      email: user.email,
      phone_number: user.phone_number,
      country_code: user.country_code
    }
  end

  defp actor_json(nil), do: nil

  defp actor_json(user) do
    %{
      id: user.id,
      username: user.username,
      role: user.role
    }
  end

  defp payment_method_json(nil), do: nil

  defp payment_method_json(method) do
    %{
      id: method.id,
      provider: method.provider,
      method_name: method.method_name,
      is_active: method.is_active,
      supports_deposit: method.supports_deposit,
      supports_withdrawal: method.supports_withdrawal,
      logo_path: method.logo_path,
      preset_key: method.preset_key,
      bank_name: method.bank_name,
      account_title: method.account_title,
      iban_or_account_number: method.iban_or_account_number,
      instructions: method.instructions,
      account_label_hint: method.account_label_hint,
      account_number_label: method.account_number_label,
      account_number_placeholder: method.account_number_placeholder,
      instructions_hint: method.instructions_hint,
      sort_order: method.sort_order,
      created_by_id: method.created_by_id,
      updated_by_id: method.updated_by_id,
      inserted_at: method.inserted_at,
      updated_at: method.updated_at
    }
  end

  defp payment_summary_json(summary) do
    %{
      pending_deposits: summary.pending_deposits,
      pending_withdrawals: summary.pending_withdrawals,
      stale_pending_count: summary.stale_pending_count,
      oldest_pending_at: summary.oldest_pending_at
    }
  end

  defp decimal_json(nil), do: nil
  defp decimal_json(%Decimal{} = value), do: Decimal.to_string(value, :normal)
  defp decimal_json(value), do: value
end
