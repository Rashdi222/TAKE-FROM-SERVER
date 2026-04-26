defmodule Back.Payments do
  import Ecto.Query

  alias Back.Accounts
  alias Back.Accounts.{Transaction, User}
  alias Back.Betting.Bet
  alias Back.Payments.{PaymentMethod, PaymentTransaction}
  alias Back.Payments.PlayerMethods
  alias Back.Repo

  @allowed_receipt_types ~w(image/jpeg image/png image/webp application/pdf)
  @max_receipt_size 8_000_000
  @allowed_logo_types ~w(image/jpeg image/png image/webp image/svg+xml)
  @max_logo_size 4_000_000

  # ── Payment Methods ───────────────────────────────────────────────────────────

  def list_payment_methods do
    Repo.all(from pm in PaymentMethod, order_by: [asc: pm.method_name, asc: pm.inserted_at])
  end

  def list_payment_methods_for_owner(%User{id: owner_id}) do
    Repo.all(
      from pm in PaymentMethod,
        where: pm.created_by_id == ^owner_id,
        order_by: [asc: pm.sort_order, asc: pm.method_name, asc: pm.inserted_at]
    )
  end

  def get_payment_method_for_owner!(id, %User{id: owner_id}) do
    Repo.one!(
      from pm in PaymentMethod,
        where: pm.id == ^id and pm.created_by_id == ^owner_id
    )
  end

  def list_active_payment_methods_for_user(%User{} = user, purpose \\ nil) do
    with {:ok, owner} <- resolve_payment_owner(user) do
      methods =
        PaymentMethod
        |> where([pm], pm.is_active == true and pm.created_by_id == ^owner.id)
        |> maybe_filter_by_purpose(purpose)
        |> order_by([pm], asc: pm.sort_order, asc: pm.method_name, asc: pm.inserted_at)
        |> Repo.all()
        |> Enum.map(&PlayerMethods.serialize/1)

      {:ok, methods}
    end
  end

  def get_payment_method!(id), do: Repo.get!(PaymentMethod, id)

  def get_payment_method_by_provider(provider) when is_binary(provider) do
    Repo.get_by(PaymentMethod, provider: String.trim(provider))
  end

  def configure_payment_method(attrs, %User{} = owner) do
    with :ok <- ensure_payment_method_owner_role(owner) do
      provider = normalize_provider(attrs["provider"] || attrs[:provider])

      base_attrs =
        attrs
        |> Map.new()
        |> Map.put("provider", provider)
        |> Map.put("created_by_id", owner.id)
        |> Map.put("updated_by_id", owner.id)

      %PaymentMethod{}
      |> PaymentMethod.changeset(base_attrs)
      |> Repo.insert()
    end
  end

  def update_payment_method(id, attrs, %User{} = owner) do
    with :ok <- ensure_payment_method_owner_role(owner),
         %PaymentMethod{} = existing <- get_payment_method_for_owner!(id, owner) do
      normalized_provider =
        normalize_provider(attrs["provider"] || attrs[:provider] || existing.provider)

      existing
      |> PaymentMethod.changeset(
        attrs
        |> Map.new()
        |> Map.put("provider", normalized_provider)
        |> Map.put("created_by_id", owner.id)
        |> Map.put("updated_by_id", owner.id)
      )
      |> Repo.update()
    end
  end

  def set_active(%PaymentMethod{} = method, active, %User{} = actor) when is_boolean(active) do
    with :ok <- authorize_method_management(actor, method) do
      method
      |> Ecto.Changeset.change(is_active: active, updated_by_id: actor.id)
      |> Repo.update()
    end
  end

  # ── Payment Transactions ──────────────────────────────────────────────────────

  def list_payment_transactions(user_id \\ nil) do
    PaymentTransaction
    |> preload([:payment_method, :user, :approval_owner, :reviewed_by])
    |> then(fn q -> if user_id, do: where(q, [pt], pt.user_id == ^user_id), else: q end)
    |> order_by([pt], desc: pt.inserted_at)
    |> Repo.all()
  end

  def list_pending_review_transactions(%User{} = owner) do
    PaymentTransaction
    |> preload([:payment_method, :user, :approval_owner, :reviewed_by])
    |> where([pt], pt.status == :pending and pt.approval_owner_id == ^owner.id)
    |> order_by([pt], asc: pt.inserted_at)
    |> Repo.all()
  end

  def list_pending_review_transactions do
    PaymentTransaction
    |> preload([:payment_method, :user, :approval_owner, :reviewed_by])
    |> where([pt], pt.status == :pending)
    |> order_by([pt], asc: pt.inserted_at)
    |> Repo.all()
  end

  def list_review_transactions_for_owner(%User{} = owner) do
    PaymentTransaction
    |> preload([:payment_method, :user, :approval_owner, :reviewed_by])
    |> where([pt], pt.approval_owner_id == ^owner.id)
    |> order_by([pt], desc: pt.inserted_at)
    |> Repo.all()
  end

  def pending_review_summary(%User{} = owner) do
    now = DateTime.utc_now()
    cutoff = DateTime.add(now, -86_400, :second)

    base_query =
      from pt in PaymentTransaction,
        where: pt.status == :pending and pt.approval_owner_id == ^owner.id

    %{
      pending_deposits:
        Repo.aggregate(from(pt in base_query, where: pt.type == "deposit"), :count, :id),
      pending_withdrawals:
        Repo.aggregate(from(pt in base_query, where: pt.type == "withdrawal"), :count, :id),
      stale_pending_count:
        Repo.aggregate(from(pt in base_query, where: pt.inserted_at < ^cutoff), :count, :id),
      oldest_pending_at: Repo.one(from pt in base_query, select: min(pt.inserted_at))
    }
  end

  def pending_review_summary do
    now = DateTime.utc_now()
    cutoff = DateTime.add(now, -86_400, :second)

    base_query =
      from pt in PaymentTransaction,
        where: pt.status == :pending

    %{
      pending_deposits:
        Repo.aggregate(from(pt in base_query, where: pt.type == "deposit"), :count, :id),
      pending_withdrawals:
        Repo.aggregate(from(pt in base_query, where: pt.type == "withdrawal"), :count, :id),
      stale_pending_count:
        Repo.aggregate(from(pt in base_query, where: pt.inserted_at < ^cutoff), :count, :id),
      oldest_pending_at: Repo.one(from pt in base_query, select: min(pt.inserted_at))
    }
  end

  def get_payment_transaction!(id), do: Repo.get!(PaymentTransaction, id)

  def create_payment_transaction(attrs) do
    %PaymentTransaction{}
    |> PaymentTransaction.changeset(attrs)
    |> Repo.insert()
  end

  def create_deposit_request(%User{} = user, amount, payment_method_id, opts \\ %{}) do
    receipt_path = get_option(opts, :receipt_path)
    amount_decimal = Decimal.new(to_string(amount))

    with {:ok, owner} <- resolve_payment_owner(user),
         {:ok, method} <- get_active_payment_method_for_user(user, payment_method_id, :deposit),
         :ok <- ensure_owner_can_cover_deposit(owner, amount_decimal),
         :ok <- ensure_receipt_present(receipt_path) do
      create_payment_transaction(%{
        user_id: user.id,
        payment_method_id: method.id,
        approval_owner_id: owner.id,
        amount: amount_decimal,
        status: :pending,
        type: "deposit",
        receipt_path: receipt_path,
        provider_response: %{
          "type" => "deposit",
          "provider" => method.provider,
          "method_name" => method.method_name,
          "approval_owner_id" => owner.id,
          "wallet_mode" => Accounts.wallet_mode(user) |> Back.Accounts.WalletMode.serialize()
        }
      })
    end
  end

  def complete_payment_transaction(%PaymentTransaction{} = pt, provider_tx_id, response) do
    Ecto.Multi.new()
    |> Ecto.Multi.update(
      :payment_tx,
      PaymentTransaction.complete_changeset(pt, provider_tx_id, response)
    )
    |> Ecto.Multi.run(:credit_user, fn _repo, _changes ->
      Back.Accounts.manual_payment(pt.user_id, pt.amount, "EasyPaisa payment - #{provider_tx_id}")
    end)
    |> Repo.transaction()
  end

  def fail_payment_transaction(%PaymentTransaction{} = pt, response) do
    pt
    |> PaymentTransaction.fail_changeset(response)
    |> Repo.update()
  end

  def approve_deposit(payment_tx_id, %User{} = approver) do
    Repo.transaction(fn ->
      payment_tx =
        Repo.one!(
          from pt in PaymentTransaction,
            where: pt.id == ^payment_tx_id,
            lock: "FOR UPDATE"
        )

      with :ok <- ensure_pending_type(payment_tx, "deposit"),
           :ok <- authorize_payment_review(approver, payment_tx) do
        user =
          Repo.one!(
            from u in User,
              where: u.id == ^payment_tx.user_id,
              lock: "FOR UPDATE"
          )

        approver_locked =
          Repo.one!(
            from u in User,
              where: u.id == ^approver.id,
              lock: "FOR UPDATE"
          )

        with :ok <- ensure_owner_can_cover_approved_deposit(approver_locked, payment_tx.amount) do
          if approver_locked.id == user.id do
            Repo.rollback(:forbidden)
          end

          {:ok, updated_approver} =
            maybe_deduct_approver_balance(approver_locked, payment_tx.amount)

          {:ok, credited_user} =
            user
            |> User.balance_changeset(%{balance: Decimal.add(user.balance, payment_tx.amount)})
            |> Repo.update()

          {:ok, wallet_tx} =
            %Transaction{}
            |> Transaction.changeset(%{
              from_user_id: updated_approver.id,
              to_user_id: payment_tx.user_id,
              amount: payment_tx.amount,
              transaction_type: :manual_payment,
              description: "Manual deposit approved"
            })
            |> Repo.insert()

          {:ok, updated_payment_tx} =
            payment_tx
            |> Ecto.Changeset.change(%{
              transaction_id: wallet_tx.id,
              status: :completed,
              provider_transaction_id: "deposit_#{payment_tx.id}",
              reviewed_by_id: approver.id,
              reviewed_at: DateTime.utc_now() |> DateTime.truncate(:second),
              provider_response:
                Map.merge(payment_tx.provider_response || %{}, %{
                  "decision" => "approved",
                  "reviewed_by" => approver.id,
                  "wallet_effect" => "credited"
                })
            })
            |> Repo.update()

          %{payment_tx: updated_payment_tx, user: credited_user, transaction: wallet_tx}
        else
          {:error, reason} -> Repo.rollback(reason)
        end
      else
        {:error, reason} -> Repo.rollback(reason)
      end
    end)
  end

  def reject_deposit(payment_tx_id, %User{} = approver, reason \\ nil) do
    Repo.transaction(fn ->
      payment_tx =
        Repo.one!(
          from pt in PaymentTransaction,
            where: pt.id == ^payment_tx_id,
            lock: "FOR UPDATE"
        )

      with :ok <- ensure_pending_type(payment_tx, "deposit"),
           :ok <- authorize_payment_review(approver, payment_tx) do
        {:ok, updated_payment_tx} =
          payment_tx
          |> Ecto.Changeset.change(%{
            status: :failed,
            reviewed_by_id: approver.id,
            reviewed_at: DateTime.utc_now() |> DateTime.truncate(:second),
            provider_response:
              Map.merge(payment_tx.provider_response || %{}, %{
                "decision" => "rejected",
                "reviewed_by" => approver.id,
                "reason" => blank_to_nil(reason),
                "wallet_effect" => "none"
              })
          })
          |> Repo.update()

        %{payment_tx: updated_payment_tx}
      else
        {:error, reason} -> Repo.rollback(reason)
      end
    end)
  end

  # ── EasyPaisa IPN Handler ─────────────────────────────────────────────────────

  def handle_easypaisa_ipn(params) do
    provider_tx_id = params["transactionId"] || params["transaction_id"]
    status = params["responseCode"] || params["status"]

    with :ok <- verify_ipn_signature(params),
         :ok <- check_replay(provider_tx_id),
         {:ok, pt} <- find_pending_transaction(provider_tx_id),
         true <- payment_successful?(status) do
      complete_payment_transaction(pt, provider_tx_id, params)
    else
      {:error, :invalid_signature} -> {:error, :invalid_signature}
      {:error, :replay_detected} -> {:error, :replay_detected}
      {:error, :not_found} -> {:error, :transaction_not_found}
      false -> {:error, :payment_failed}
    end
  end

  defp find_pending_transaction(provider_tx_id) do
    case Repo.get_by(PaymentTransaction,
           provider_transaction_id: provider_tx_id,
           status: :pending
         ) do
      nil -> {:error, :not_found}
      pt -> {:ok, pt}
    end
  end

  defp payment_successful?(code) when code in ["000", "0000", "success", "SUCCESS"], do: true
  defp payment_successful?(_), do: false

  # ── Withdrawals ───────────────────────────────────────────────────────────────

  def request_withdrawal(user_id, amount, payment_method_id, opts \\ %{}) do
    amount = Decimal.new(to_string(amount))
    user = Accounts.get_user!(user_id)
    destination_account_title = blank_to_nil(get_option(opts, :account_title))
    destination_account_number = blank_to_nil(get_option(opts, :account_number))

    with {:ok, owner} <- resolve_payment_owner(user),
         {:ok, method} <- get_active_payment_method_for_user(user, payment_method_id, :withdrawal),
         :ok <-
           ensure_withdrawal_destination_present(
             destination_account_title,
             destination_account_number
           ) do
      if user.payments_locked do
        {:error, :payments_locked}
      else
        locked = get_locked_balance(user_id)
        available = Decimal.sub(user.balance, locked)

        if Decimal.compare(available, amount) == :lt do
          {:error, :insufficient_available_balance}
        else
          create_payment_transaction(%{
            user_id: user_id,
            payment_method_id: method.id,
            approval_owner_id: owner.id,
            amount: amount,
            status: :pending,
            type: "withdrawal",
            provider_response: %{
              "type" => "withdrawal",
              "provider" => method.provider,
              "method_name" => method.method_name,
              "approval_owner_id" => owner.id,
              "wallet_mode" => Accounts.wallet_mode(user) |> Back.Accounts.WalletMode.serialize(),
              "destination_account_title" => destination_account_title,
              "destination_account_number" => destination_account_number
            }
          })
        end
      end
    end
  end

  def approve_withdrawal(payment_tx_id, %User{} = approver) do
    Repo.transaction(fn ->
      payment_tx =
        Repo.one!(
          from pt in PaymentTransaction,
            where: pt.id == ^payment_tx_id,
            lock: "FOR UPDATE"
        )

      with :ok <- ensure_pending_type(payment_tx, "withdrawal"),
           :ok <- authorize_payment_review(approver, payment_tx) do
        user =
          Repo.one!(
            from u in User,
              where: u.id == ^payment_tx.user_id,
              lock: "FOR UPDATE"
          )

        if Decimal.compare(user.balance, payment_tx.amount) == :lt do
          Repo.rollback(:insufficient_balance)
        else
          {:ok, updated_user} =
            user
            |> User.balance_changeset(%{balance: Decimal.sub(user.balance, payment_tx.amount)})
            |> Repo.update()

          {:ok, wallet_tx} =
            %Transaction{}
            |> Transaction.changeset(%{
              from_user_id: payment_tx.user_id,
              to_user_id: approver.id,
              amount: payment_tx.amount,
              transaction_type: :debit,
              description: "Withdrawal approved"
            })
            |> Repo.insert()

          {:ok, updated_payment_tx} =
            payment_tx
            |> Ecto.Changeset.change(%{
              transaction_id: wallet_tx.id,
              status: :completed,
              provider_transaction_id: "withdrawal_#{payment_tx.id}",
              reviewed_by_id: approver.id,
              reviewed_at: DateTime.utc_now() |> DateTime.truncate(:second),
              provider_response:
                Map.merge(payment_tx.provider_response || %{}, %{
                  "decision" => "approved",
                  "reviewed_by" => approver.id,
                  "wallet_effect" => "debited"
                })
            })
            |> Repo.update()

          %{payment_tx: updated_payment_tx, user: updated_user, transaction: wallet_tx}
        end
      else
        {:error, reason} -> Repo.rollback(reason)
      end
    end)
  end

  def reject_withdrawal(payment_tx_id, %User{} = approver, reason \\ nil) do
    Repo.transaction(fn ->
      payment_tx =
        Repo.one!(
          from pt in PaymentTransaction,
            where: pt.id == ^payment_tx_id,
            lock: "FOR UPDATE"
        )

      with :ok <- ensure_pending_type(payment_tx, "withdrawal"),
           :ok <- authorize_payment_review(approver, payment_tx) do
        {:ok, updated_payment_tx} =
          payment_tx
          |> Ecto.Changeset.change(%{
            status: :failed,
            reviewed_by_id: approver.id,
            reviewed_at: DateTime.utc_now() |> DateTime.truncate(:second),
            provider_response:
              Map.merge(payment_tx.provider_response || %{}, %{
                "decision" => "rejected",
                "reviewed_by" => approver.id,
                "reason" => blank_to_nil(reason),
                "wallet_effect" => "none"
              })
          })
          |> Repo.update()

        %{payment_tx: updated_payment_tx}
      else
        {:error, reason} -> Repo.rollback(reason)
      end
    end)
  end

  # ── Receipts ─────────────────────────────────────────────────────────────────

  def store_deposit_receipt(%Plug.Upload{} = upload, %User{} = user) do
    with :ok <- validate_receipt_upload(upload) do
      relative_path = build_receipt_relative_path(user.id, upload.filename)
      absolute_path = receipt_absolute_path(relative_path)

      absolute_path
      |> Path.dirname()
      |> File.mkdir_p!()

      File.cp!(upload.path, absolute_path)

      {:ok,
       %{
         receipt_path: relative_path,
         file_name: Path.basename(relative_path),
         content_type: upload.content_type,
         size: File.stat!(absolute_path).size
       }}
    end
  end

  def store_payment_method_logo(%Plug.Upload{} = upload, %User{} = user) do
    with :ok <- ensure_payment_method_owner_role(user),
         :ok <- validate_logo_upload(upload) do
      relative_path = build_logo_relative_path(user.id, upload.filename)
      absolute_path = logo_absolute_path(relative_path)

      absolute_path
      |> Path.dirname()
      |> File.mkdir_p!()

      File.cp!(upload.path, absolute_path)

      {:ok,
       %{
         logo_path: "/api/payment-method-logos/#{relative_path}",
         file_name: Path.basename(relative_path),
         content_type: upload.content_type,
         size: File.stat!(absolute_path).size
       }}
    end
  end

  def fetch_payment_method_logo(["api", "payment-method-logos" | path_segments]),
    do: fetch_payment_method_logo(path_segments)

  def fetch_payment_method_logo(path_segments) when is_list(path_segments) do
    relative_path = Path.join(path_segments)
    absolute_path = logo_absolute_path(relative_path)

    if relative_path == "." or not File.exists?(absolute_path) do
      {:error, :not_found}
    else
      {:ok,
       %{
         path: absolute_path,
         file_name: Path.basename(relative_path),
         content_type: logo_content_type(relative_path)
       }}
    end
  end

  def fetch_receipt_for_actor(payment_tx_id, %User{} = actor) do
    payment_tx = Repo.get!(PaymentTransaction, payment_tx_id)

    with :ok <- authorize_receipt_access(actor, payment_tx),
         path when is_binary(path) <- payment_tx.receipt_path,
         true <- File.exists?(receipt_absolute_path(path)) do
      {:ok,
       %{
         path: receipt_absolute_path(path),
         file_name: Path.basename(path),
         content_type: receipt_content_type(path)
       }}
    else
      nil -> {:error, :receipt_not_found}
      false -> {:error, :receipt_not_found}
      {:error, reason} -> {:error, reason}
    end
  end

  # ── Private Helpers ───────────────────────────────────────────────────────────

  @doc false
  def get_locked_balance(user_id) do
    Repo.one(
      from b in Bet,
        where: b.user_id == ^user_id and b.status == :pending,
        select: coalesce(sum(b.stake), ^Decimal.new(0))
    )
  end

  defp resolve_payment_owner(%User{created_by_id: created_by_id})
       when not is_nil(created_by_id) do
    case Accounts.get_user(created_by_id) do
      %User{role: :master_admin, is_active: true} = owner -> {:ok, owner}
      _ -> {:error, :payment_owner_not_found}
    end
  end

  defp resolve_payment_owner(%User{}) do
    preferred_owner =
      Repo.one(
        from u in User,
          join: pm in PaymentMethod,
          on: pm.created_by_id == u.id and pm.is_active == true,
          where: u.role == :super_admin and u.is_active == true,
          order_by: [desc: u.updated_at, desc: u.inserted_at],
          limit: 1,
          select: u
      )

    fallback_owner =
      Repo.one(
        from u in User,
          where: u.role == :super_admin and u.is_active == true,
          order_by: [desc: u.updated_at, desc: u.inserted_at],
          limit: 1
      )

    case preferred_owner || fallback_owner do
      %User{} = owner -> {:ok, owner}
      nil -> {:error, :payment_owner_not_found}
    end
  end

  defp ensure_pending_type(%PaymentTransaction{status: :pending, type: type}, type), do: :ok
  defp ensure_pending_type(%PaymentTransaction{}, "deposit"), do: {:error, :not_a_pending_deposit}

  defp ensure_pending_type(%PaymentTransaction{}, "withdrawal"),
    do: {:error, :not_a_pending_withdrawal}

  defp ensure_receipt_present(path) when is_binary(path) and byte_size(path) > 0, do: :ok
  defp ensure_receipt_present(_), do: {:error, :receipt_required}

  defp ensure_withdrawal_destination_present(title, number) do
    cond do
      not (is_binary(title) and byte_size(title) > 0) ->
        {:error, :withdrawal_account_title_required}

      not (is_binary(number) and byte_size(number) > 0) ->
        {:error, :withdrawal_account_number_required}

      true ->
        :ok
    end
  end

  defp ensure_payment_method_owner_role(%User{role: role})
       when role in [:super_admin, :master_admin], do: :ok

  defp ensure_payment_method_owner_role(_), do: {:error, :forbidden}

  defp ensure_owner_can_cover_deposit(%User{role: :master_admin, balance: balance}, amount) do
    if Decimal.compare(balance, amount) == :lt do
      {:error, :approval_owner_insufficient_balance}
    else
      :ok
    end
  end

  defp ensure_owner_can_cover_deposit(%User{}, _amount), do: :ok

  defp ensure_owner_can_cover_approved_deposit(%User{role: :master_admin} = approver, amount),
    do: ensure_owner_can_cover_deposit(approver, amount)

  defp ensure_owner_can_cover_approved_deposit(%User{}, _amount), do: :ok

  defp maybe_deduct_approver_balance(%User{role: :master_admin} = approver, amount) do
    approver
    |> User.balance_changeset(%{balance: Decimal.sub(approver.balance, amount)})
    |> Repo.update()
  end

  defp maybe_deduct_approver_balance(%User{} = approver, _amount), do: {:ok, approver}

  defp authorize_method_management(%User{role: :super_admin}, _method), do: :ok

  defp authorize_method_management(%User{role: :master_admin, id: actor_id}, %PaymentMethod{
         created_by_id: actor_id
       }),
       do: :ok

  defp authorize_method_management(_, _), do: {:error, :forbidden}

  defp authorize_payment_review(%User{role: :super_admin}, %PaymentTransaction{
         approval_owner_id: owner_id
       }) do
    case Accounts.get_user(owner_id) do
      %User{role: :super_admin} -> :ok
      _ -> {:error, :forbidden}
    end
  end

  defp authorize_payment_review(%User{role: :master_admin, id: actor_id}, %PaymentTransaction{
         approval_owner_id: actor_id
       }),
       do: :ok

  defp authorize_payment_review(_, _), do: {:error, :forbidden}

  defp authorize_receipt_access(%User{role: :super_admin}, _payment_tx), do: :ok

  defp authorize_receipt_access(%User{role: :master_admin, id: actor_id}, %PaymentTransaction{
         approval_owner_id: actor_id
       }),
       do: :ok

  defp authorize_receipt_access(_, _), do: {:error, :forbidden}

  defp get_active_payment_method_for_user(%User{} = user, payment_method_id, purpose) do
    with {:ok, owner} <- resolve_payment_owner(user),
         %PaymentMethod{} = method <- Repo.get(PaymentMethod, payment_method_id),
         true <- method.is_active,
         true <- method.created_by_id == owner.id,
         :ok <- ensure_payment_method_supports_purpose(method, purpose) do
      {:ok, method}
    else
      nil -> {:error, :payment_method_not_found}
      false -> {:error, :payment_method_inactive}
      {:error, reason} -> {:error, reason}
    end
  end

  defp normalize_provider(value) when is_binary(value) do
    value
    |> String.trim()
    |> String.downcase()
    |> String.replace(~r/[^a-z0-9]+/u, "_")
    |> String.trim("_")
  end

  defp normalize_provider(value), do: value |> to_string() |> normalize_provider()

  defp verify_ipn_signature(_params), do: :ok

  defp maybe_filter_by_purpose(query, :deposit),
    do: where(query, [pm], pm.supports_deposit == true)

  defp maybe_filter_by_purpose(query, :withdrawal),
    do: where(query, [pm], pm.supports_withdrawal == true)

  defp maybe_filter_by_purpose(query, "deposit"), do: maybe_filter_by_purpose(query, :deposit)

  defp maybe_filter_by_purpose(query, "withdrawal"),
    do: maybe_filter_by_purpose(query, :withdrawal)

  defp maybe_filter_by_purpose(query, _), do: query

  defp supports_payment_purpose?(%PaymentMethod{supports_deposit: true}, :deposit), do: true
  defp supports_payment_purpose?(%PaymentMethod{supports_withdrawal: true}, :withdrawal), do: true
  defp supports_payment_purpose?(%PaymentMethod{}, nil), do: true
  defp supports_payment_purpose?(%PaymentMethod{}, _), do: false

  defp ensure_payment_method_supports_purpose(%PaymentMethod{} = method, purpose) do
    if supports_payment_purpose?(method, purpose),
      do: :ok,
      else: {:error, :payment_method_unavailable_for_flow}
  end

  defp check_replay(provider_tx_id) do
    case Repo.get_by(PaymentTransaction,
           provider_transaction_id: provider_tx_id,
           status: :completed
         ) do
      nil -> :ok
      _ -> {:error, :replay_detected}
    end
  end

  defp validate_receipt_upload(%Plug.Upload{content_type: content_type, path: path}) do
    cond do
      content_type not in @allowed_receipt_types ->
        {:error, :unsupported_receipt_type}

      not File.exists?(path) ->
        {:error, :receipt_not_found}

      File.stat!(path).size > @max_receipt_size ->
        {:error, :receipt_too_large}

      true ->
        :ok
    end
  end

  defp validate_logo_upload(%Plug.Upload{content_type: content_type, path: path}) do
    cond do
      content_type not in @allowed_logo_types ->
        {:error, :unsupported_logo_type}

      not File.exists?(path) ->
        {:error, :logo_not_found}

      File.stat!(path).size > @max_logo_size ->
        {:error, :logo_too_large}

      true ->
        :ok
    end
  end

  defp build_receipt_relative_path(user_id, original_filename) do
    ext = original_filename |> Path.extname() |> String.downcase()
    day = Date.utc_today() |> Date.to_iso8601()
    Path.join([day, user_id, "#{Ecto.UUID.generate()}#{ext}"])
  end

  defp build_logo_relative_path(user_id, original_filename) do
    ext = original_filename |> Path.extname() |> String.downcase()
    day = Date.utc_today() |> Date.to_iso8601()
    Path.join([day, user_id, "#{Ecto.UUID.generate()}#{ext}"])
  end

  defp receipt_absolute_path(relative_path) do
    Application.app_dir(:back, "priv/uploads/receipts/#{relative_path}")
  end

  defp logo_absolute_path(relative_path) do
    normalized =
      relative_path |> to_string() |> String.replace_prefix("/api/payment-method-logos/", "")

    Application.app_dir(:back, "priv/uploads/payment_method_logos/#{normalized}")
  end

  defp receipt_content_type(path) do
    case Path.extname(path) |> String.downcase() do
      ".jpg" -> "image/jpeg"
      ".jpeg" -> "image/jpeg"
      ".png" -> "image/png"
      ".webp" -> "image/webp"
      ".pdf" -> "application/pdf"
      _ -> "application/octet-stream"
    end
  end

  defp logo_content_type(path) do
    case Path.extname(path) |> String.downcase() do
      ".jpg" -> "image/jpeg"
      ".jpeg" -> "image/jpeg"
      ".png" -> "image/png"
      ".webp" -> "image/webp"
      ".svg" -> "image/svg+xml"
      _ -> "application/octet-stream"
    end
  end

  defp blank_to_nil(nil), do: nil

  defp blank_to_nil(value) when is_binary(value),
    do: if(String.trim(value) == "", do: nil, else: String.trim(value))

  defp blank_to_nil(value), do: to_string(value)

  defp get_option(opts, key) when is_list(opts), do: Keyword.get(opts, key)

  defp get_option(opts, key) when is_map(opts) do
    Map.get(opts, key) || Map.get(opts, Atom.to_string(key))
  end

  defp get_option(_, _), do: nil
end
