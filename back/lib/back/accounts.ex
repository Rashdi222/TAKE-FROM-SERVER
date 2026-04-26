defmodule Back.Accounts do
  import Ecto.Query
  alias Back.Repo
  alias Back.Accounts.AccountCurrency
  alias Back.Accounts.PasswordResets
  alias Back.Accounts.WalletMode
  alias Back.Accounts.{User, Transaction}
  alias Back.Admin
  alias Back.Betting.{Bet, BetRejectionLog}

  # ── User Queries ──────────────────────────────────────────────────────────────

  def get_user(id), do: Repo.get(User, id)
  def get_user!(id), do: Repo.get!(User, id)

  def get_user_by_email(email) when is_binary(email),
    do: Repo.get_by(User, email: String.downcase(email))

  def wallet_mode(%User{} = user), do: WalletMode.resolve(user)
  def wallet_mode(user) when is_map(user), do: WalletMode.resolve(user)

  def list_master_admins(opts \\ []) do
    currency = opts[:account_currency] || opts["account_currency"]

    from(u in User, where: u.role == :master_admin, order_by: [desc: u.inserted_at])
    |> maybe_filter_account_currency(currency)
    |> Repo.all()
  end

  def list_players_by_master(master_admin_id) do
    Repo.all(from u in User, where: u.role == :player and u.created_by_id == ^master_admin_id)
  end

  def list_all_players(opts \\ []) do
    currency = opts[:account_currency] || opts["account_currency"]

    from(u in User, where: u.role in [:player, :customer], order_by: [desc: u.inserted_at])
    |> maybe_filter_account_currency(currency)
    |> Repo.all()
  end

  # ── User Creation ─────────────────────────────────────────────────────────────

  def register_customer(attrs) do
    with {:ok, currency} <- validate_enabled_account_currency(attrs) do
      %User{}
      |> User.registration_changeset(
        attrs
        |> Map.put("role", "player")
        |> Map.put("account_currency", currency)
      )
      |> Repo.insert()
    end
  end

  def create_master_admin(attrs, created_by_id) do
    initial_balance =
      attrs["balance"] || attrs[:balance] || attrs["initial_balance"] || attrs[:initial_balance] ||
        0

    amount = Decimal.new(to_string(initial_balance))

    with :ok <- validate_non_negative_initial_balance(amount),
         {:ok, currency} <- validate_enabled_account_currency(attrs),
         {:ok, supported_currencies} <-
           validate_enabled_supported_account_currencies(attrs, currency) do
      Ecto.Multi.new()
      |> Ecto.Multi.insert(:master_admin, fn _changes ->
        %User{}
        |> User.master_admin_changeset(
          attrs
          |> Map.new()
          |> Map.put("created_by_id", created_by_id)
          |> Map.put("balance", amount)
          |> Map.put("account_currency", currency)
          |> Map.put("supported_account_currencies", supported_currencies)
          |> Map.put("master_admin_type", nil)
          |> Map.put("commission_percentage", nil)
          |> Map.put("volume_margin", nil)
        )
      end)
      |> Ecto.Multi.run(:initial_funding_tx, fn repo, %{master_admin: master_admin} ->
        if Decimal.equal?(amount, Decimal.new(0)) do
          {:ok, nil}
        else
          %Transaction{}
          |> Transaction.changeset(%{
            from_user_id: created_by_id,
            to_user_id: master_admin.id,
            amount: amount,
            transaction_type: :credit,
            description: "Initial balance allocated to master admin"
          })
          |> repo.insert()
        end
      end)
      |> Repo.transaction()
      |> case do
        {:ok, %{master_admin: master_admin}} -> {:ok, master_admin}
        {:error, _step, reason, _changes} -> {:error, reason}
      end
    end
  end

  @doc "Alias for create_player/2 — used by MasterAdmin controller."
  def create_player_account(attrs, master_admin_id), do: create_player(attrs, master_admin_id)

  def create_player(attrs, master_admin_id) do
    Ecto.Multi.new()
    |> Ecto.Multi.run(:master_admin, fn _repo, _changes ->
      case get_user!(master_admin_id) do
        %User{role: :master_admin} = ma -> {:ok, ma}
        _ -> {:error, :not_master_admin}
      end
    end)
    |> Ecto.Multi.run(:account_currency, fn _repo, %{master_admin: master_admin} ->
      validate_player_account_currency(attrs, master_admin)
    end)
    |> Ecto.Multi.run(:balance_check, fn _repo, %{master_admin: ma} ->
      amount =
        Decimal.new(
          to_string(attrs["amount"] || attrs[:amount] || attrs["balance"] || attrs[:balance] || 0)
        )

      if Decimal.compare(ma.balance, amount) != :lt do
        {:ok, amount}
      else
        {:error, :insufficient_balance}
      end
    end)
    |> Ecto.Multi.insert(:player, fn _changes ->
      %User{}
      |> User.registration_changeset(
        attrs
        |> normalize_player_amount()
        |> Map.put("role", "player")
        |> Map.put("created_by_id", master_admin_id)
        |> Map.put("account_currency", currency_from_attrs(attrs))
      )
    end)
    |> Ecto.Multi.run(:deduct_master, fn repo, %{master_admin: ma, balance_check: amount} ->
      ma
      |> User.balance_changeset(%{balance: Decimal.sub(ma.balance, amount)})
      |> repo.update()
    end)
    |> Ecto.Multi.insert(:transaction, fn %{
                                            master_admin: ma,
                                            player: player,
                                            balance_check: amount
                                          } ->
      Transaction.changeset(%Transaction{}, %{
        from_user_id: ma.id,
        to_user_id: player.id,
        amount: amount,
        transaction_type: :transfer,
        description: "Initial balance for new player account"
      })
    end)
    |> Repo.transaction()
  end

  def list_account_currencies do
    AccountCurrency.list_all()
  end

  def list_enabled_account_currencies do
    AccountCurrency.list_enabled()
  end

  def update_enabled_account_currencies(codes) when is_list(codes) do
    AccountCurrency.put_enabled_codes(codes)
  end

  defp normalize_player_amount(attrs) do
    amount = attrs["amount"] || attrs[:amount]

    if is_nil(amount) do
      attrs
    else
      Map.put(attrs, "balance", amount)
    end
  end

  defp validate_enabled_account_currency(attrs) do
    currency = currency_from_attrs(attrs)

    cond do
      is_nil(currency) or currency == "" ->
        {:error, :invalid_account_currency}

      not AccountCurrency.valid_supported?(currency) ->
        {:error, :invalid_account_currency}

      not AccountCurrency.enabled?(currency) ->
        {:error, :account_currency_not_enabled}

      true ->
        {:ok, currency}
    end
  end

  defp validate_player_account_currency(attrs, %User{} = master_admin) do
    supported =
      case master_admin.supported_account_currencies do
        list when is_list(list) and list != [] -> list
        _ -> [master_admin.account_currency]
      end

    with {:ok, currency} <- validate_enabled_account_currency(attrs),
         true <- currency in supported || {:error, :player_currency_must_match_master_admin} do
      {:ok, currency}
    end
  end

  defp currency_from_attrs(attrs) when is_map(attrs) do
    attrs["account_currency"] || attrs[:account_currency] || attrs["currency"] ||
      attrs[:currency]
      |> case do
        nil -> nil
        value -> AccountCurrency.normalize(value)
      end
  end

  defp validate_non_negative_initial_balance(amount) do
    if Decimal.compare(amount, Decimal.new(0)) == :lt do
      {:error, :invalid_initial_balance}
    else
      :ok
    end
  end

  defp validate_enabled_supported_account_currencies(attrs, primary_currency) do
    requested =
      attrs["supported_account_currencies"] ||
        attrs[:supported_account_currencies] ||
        [primary_currency]

    normalized =
      requested
      |> List.wrap()
      |> Enum.map(fn
        value when is_binary(value) -> AccountCurrency.normalize(value)
        value -> value |> to_string() |> AccountCurrency.normalize()
      end)
      |> Enum.reject(&is_nil/1)
      |> Enum.uniq()
      |> then(fn codes ->
        if primary_currency in codes, do: codes, else: [primary_currency | codes]
      end)

    cond do
      normalized == [] ->
        {:error, :invalid_account_currency}

      Enum.any?(normalized, &(not AccountCurrency.valid_supported?(&1))) ->
        {:error, :invalid_account_currency}

      Enum.any?(normalized, &(not AccountCurrency.enabled?(&1))) ->
        {:error, :account_currency_not_enabled}

      true ->
        {:ok, normalized}
    end
  end

  defp maybe_filter_account_currency(query, nil), do: query
  defp maybe_filter_account_currency(query, ""), do: query

  defp maybe_filter_account_currency(query, currency) do
    normalized = AccountCurrency.normalize(currency)
    where(query, [u], u.account_currency == ^normalized)
  end

  # ── Authentication ────────────────────────────────────────────────────────────

  def authenticate_user(email, password) do
    user = get_user_by_email(email)

    cond do
      user && user.is_active && Bcrypt.verify_pass(password, user.password_hash) ->
        {:ok, user}

      user && !user.is_active ->
        {:error, :inactive}

      true ->
        Bcrypt.no_user_verify()
        {:error, :invalid_credentials}
    end
  end

  # ── Balance Operations ────────────────────────────────────────────────────────

  def transfer_to_master_admin(master_admin_id, amount) when is_binary(master_admin_id) do
    amount = Decimal.new(to_string(amount))
    master_admin = get_user!(master_admin_id)

    Ecto.Multi.new()
    |> Ecto.Multi.run(:update_balance, fn repo, _changes ->
      master_admin
      |> User.balance_changeset(%{balance: Decimal.add(master_admin.balance, amount)})
      |> repo.update()
    end)
    |> Ecto.Multi.insert(:transaction, fn _changes ->
      Transaction.changeset(%Transaction{}, %{
        to_user_id: master_admin_id,
        amount: amount,
        transaction_type: :credit,
        description: "Balance transfer from Super Admin"
      })
    end)
    |> Repo.transaction()
  end

  def manual_payment(user_id, amount, description \\ "Manual payment by admin") do
    amount = Decimal.new(to_string(amount))
    user = get_user!(user_id)

    Ecto.Multi.new()
    |> Ecto.Multi.run(:update_balance, fn repo, _changes ->
      user
      |> User.balance_changeset(%{balance: Decimal.add(user.balance, amount)})
      |> repo.update()
    end)
    |> Ecto.Multi.insert(:transaction, fn _changes ->
      Transaction.changeset(%Transaction{}, %{
        to_user_id: user_id,
        amount: amount,
        transaction_type: :manual_payment,
        description: description
      })
    end)
    |> Repo.transaction()
  end

  def deactivate_user(user_id) do
    get_user!(user_id)
    |> User.update_changeset(%{is_active: false})
    |> Repo.update()
  end

  def update_user(user_id, attrs) do
    get_user!(user_id)
    |> User.update_changeset(attrs)
    |> Repo.update()
  end

  def revoke_user_sessions(user_id) do
    update_user(user_id, %{session_revoked_at: DateTime.utc_now() |> DateTime.truncate(:second)})
  end

  def set_player_password_by_master(
        master_admin_id,
        player_id,
        password,
        password_confirmation,
        audit_meta \\ %{}
      ) do
    with {:ok, player} <- fetch_owned_player(master_admin_id, player_id),
         true <- password == password_confirmation || {:error, :password_confirmation_mismatch},
         {:ok, updated} <-
           player
           |> User.password_update_changeset(%{
             password: password,
             session_revoked_at: DateTime.utc_now() |> DateTime.truncate(:second)
           })
           |> Repo.update() do
      _ =
        Admin.log_action(%{
          actor_id: master_admin_id,
          action: "set_player_password",
          target_type: "User",
          target_id: player.id,
          payload: %{player_id: player.id},
          ip_address: audit_meta[:ip_address] || audit_meta["ip_address"],
          user_agent: audit_meta[:user_agent] || audit_meta["user_agent"]
        })

      {:ok, updated}
    end
  end

  def generate_player_password_reset_link_by_master(
        master_admin_id,
        player_id,
        reset_base_url,
        audit_meta \\ %{}
      ) do
    with {:ok, player} <- fetch_owned_player(master_admin_id, player_id) do
      PasswordResets.generate_player_reset(master_admin_id, player, reset_base_url, audit_meta)
    end
  end

  def validate_player_password_reset_token(token) do
    PasswordResets.validate_player_reset_token(token)
  end

  def complete_player_password_reset(token, password, password_confirmation, audit_meta \\ %{}) do
    PasswordResets.complete_player_reset(token, password, password_confirmation, audit_meta)
  end

  @doc "Generic atomic transfer between any two users with balance validation and audit trail."
  def transfer_amount(from_user_id, to_user_id, amount) do
    amount = Decimal.new(to_string(amount))

    Ecto.Multi.new()
    |> Ecto.Multi.run(:from_user, fn _repo, _changes ->
      case get_user(from_user_id) do
        %User{is_active: true} = u -> {:ok, u}
        nil -> {:error, :user_not_found}
        _ -> {:error, :user_inactive}
      end
    end)
    |> Ecto.Multi.run(:to_user, fn _repo, _changes ->
      case get_user(to_user_id) do
        %User{is_active: true} = u -> {:ok, u}
        nil -> {:error, :user_not_found}
        _ -> {:error, :user_inactive}
      end
    end)
    |> Ecto.Multi.run(:balance_check, fn _repo, %{from_user: from} ->
      if Decimal.compare(from.balance, amount) != :lt,
        do: {:ok, :sufficient},
        else: {:error, :insufficient_balance}
    end)
    |> Ecto.Multi.run(:deduct, fn repo, %{from_user: from} ->
      from
      |> User.balance_changeset(%{balance: Decimal.sub(from.balance, amount)})
      |> repo.update()
    end)
    |> Ecto.Multi.run(:credit, fn repo, %{to_user: to} ->
      to
      |> User.balance_changeset(%{balance: Decimal.add(to.balance, amount)})
      |> repo.update()
    end)
    |> Ecto.Multi.insert(:transaction, fn _changes ->
      Transaction.changeset(%Transaction{}, %{
        from_user_id: from_user_id,
        to_user_id: to_user_id,
        amount: amount,
        transaction_type: :transfer,
        description: "Transfer"
      })
    end)
    |> Repo.transaction()
  end

  defp fetch_owned_player(master_admin_id, player_id) do
    case Repo.get_by(User, id: player_id, role: :player, created_by_id: master_admin_id) do
      %User{} = player -> {:ok, player}
      nil -> {:error, :forbidden}
    end
  end

  @doc "Adds balance to a user. No deduction from another account (e.g. top-up by super admin)."
  def add_balance(user_id, amount) do
    amount = Decimal.new(to_string(amount))
    user = get_user!(user_id)

    Ecto.Multi.new()
    |> Ecto.Multi.run(:update, fn repo, _changes ->
      user
      |> User.balance_changeset(%{balance: Decimal.add(user.balance, amount)})
      |> repo.update()
    end)
    |> Ecto.Multi.insert(:transaction, fn _changes ->
      Transaction.changeset(%Transaction{}, %{
        to_user_id: user_id,
        amount: amount,
        transaction_type: :credit,
        description: "Balance credit"
      })
    end)
    |> Repo.transaction()
  end

  @doc "Deducts balance from a user. Validates sufficient funds before deducting."
  def deduct_balance(user_id, amount) do
    amount = Decimal.new(to_string(amount))
    user = get_user!(user_id)

    Ecto.Multi.new()
    |> Ecto.Multi.run(:balance_check, fn _repo, _changes ->
      if Decimal.compare(user.balance, amount) != :lt,
        do: {:ok, :sufficient},
        else: {:error, :insufficient_balance}
    end)
    |> Ecto.Multi.run(:update, fn repo, _changes ->
      user
      |> User.balance_changeset(%{balance: Decimal.sub(user.balance, amount)})
      |> repo.update()
    end)
    |> Ecto.Multi.insert(:transaction, fn _changes ->
      Transaction.changeset(%Transaction{}, %{
        from_user_id: user_id,
        to_user_id: user_id,
        amount: amount,
        transaction_type: :debit,
        description: "Balance deduction"
      })
    end)
    |> Repo.transaction()
  end

  # ── Dashboard Stats ───────────────────────────────────────────────────────────

  @doc "Super Admin god-view dashboard stats."
  def get_dashboard_stats do
    total_users = Repo.aggregate(User, :count, :id)

    total_master_admins =
      Repo.aggregate(from(u in User, where: u.role == :master_admin), :count, :id)

    total_players =
      Repo.aggregate(from(u in User, where: u.role in [:player, :customer]), :count, :id)

    total_balance = Repo.aggregate(User, :sum, :balance) || Decimal.new(0)

    total_bets = Repo.aggregate(Back.Betting.Bet, :count, :id)

    pending_bets =
      Repo.aggregate(from(b in Back.Betting.Bet, where: b.status == :pending), :count, :id)

    %{
      total_users: total_users,
      total_master_admins: total_master_admins,
      total_players: total_players,
      total_balance_on_platform: total_balance,
      total_bets: total_bets,
      pending_bets: pending_bets
    }
  end

  @doc "Master Admin scoped dashboard stats — only their players and bets."
  def get_master_admin_stats(master_admin_id) do
    master = get_user!(master_admin_id)

    player_ids =
      from(u in User, where: u.created_by_id == ^master_admin_id, select: u.id)
      |> Repo.all()

    total_players = length(player_ids)

    total_bets =
      if player_ids == [] do
        0
      else
        Repo.aggregate(from(b in Back.Betting.Bet, where: b.user_id in ^player_ids), :count, :id)
      end

    pending_bets =
      if player_ids == [] do
        0
      else
        Repo.aggregate(
          from(b in Back.Betting.Bet, where: b.user_id in ^player_ids and b.status == :pending),
          :count,
          :id
        )
      end

    total_player_balance =
      if player_ids == [] do
        Decimal.new(0)
      else
        Repo.one(
          from u in User,
            where: u.id in ^player_ids,
            select: coalesce(sum(u.balance), ^Decimal.new(0))
        )
      end

    %{
      balance: master.balance,
      total_players: total_players,
      total_bets: total_bets,
      pending_bets: pending_bets,
      total_player_balance: total_player_balance,
      supported_account_currencies:
        master.supported_account_currencies || [master.account_currency]
    }
  end

  def get_master_admin_detail_stats(master_admin_id) do
    with {:ok, master} <- fetch_master_admin(master_admin_id) do
      player_query =
        from u in User,
          where: u.role in [:player, :customer] and u.created_by_id == ^master_admin_id

      player_ids = Repo.all(from u in player_query, select: u.id)
      total_players = length(player_ids)

      active_players =
        Repo.aggregate(from(u in player_query, where: u.is_active == true), :count, :id)

      {total_bets, active_bets, won_bets, lost_bets, total_stake, total_potential_win} =
        if player_ids == [] do
          {0, 0, 0, 0, Decimal.new(0), Decimal.new(0)}
        else
          {
            Repo.aggregate(from(b in Bet, where: b.user_id in ^player_ids), :count, :id),
            Repo.aggregate(
              from(b in Bet, where: b.user_id in ^player_ids and b.status in [:pending, :active]),
              :count,
              :id
            ),
            Repo.aggregate(
              from(b in Bet, where: b.user_id in ^player_ids and b.status == :won),
              :count,
              :id
            ),
            Repo.aggregate(
              from(b in Bet, where: b.user_id in ^player_ids and b.status == :lost),
              :count,
              :id
            ),
            Repo.one(
              from b in Bet,
                where: b.user_id in ^player_ids,
                select: coalesce(sum(b.stake), ^Decimal.new(0))
            ),
            Repo.one(
              from b in Bet,
                where: b.user_id in ^player_ids and b.status == :won,
                select: coalesce(sum(b.potential_win), ^Decimal.new(0))
            )
          }
        end

      recent_players =
        from(u in player_query,
          order_by: [desc: u.inserted_at],
          limit: 5,
          select: %{
            id: u.id,
            username: u.username,
            email: u.email,
            is_active: u.is_active,
            balance: u.balance,
            inserted_at: u.inserted_at
          }
        )
        |> Repo.all()

      recent_activity =
        if player_ids == [] do
          []
        else
          from(b in Bet,
            join: u in User,
            on: u.id == b.user_id,
            where: b.user_id in ^player_ids,
            order_by: [desc: b.inserted_at],
            limit: 8,
            select: %{
              bet_id: b.id,
              user_id: u.id,
              username: u.username,
              stake: b.stake,
              potential_win: b.potential_win,
              status: b.status,
              inserted_at: b.inserted_at
            }
          )
          |> Repo.all()
        end

      {:ok,
       %{
         id: master.id,
         username: master.username,
         email: master.email,
         phone_number: master.phone_number,
         role: master.role,
         balance: master.balance,
         is_active: master.is_active,
         supported_account_currencies:
           master.supported_account_currencies || [master.account_currency],
         total_players: total_players,
         active_players: active_players,
         total_bets: total_bets,
         active_bets: active_bets,
         won_bets: won_bets,
         lost_bets: lost_bets,
         total_stake: total_stake,
         total_winnings: total_potential_win,
         recent_players: recent_players,
         recent_activity: recent_activity,
         inserted_at: master.inserted_at
       }}
    end
  end

  # ── Transactions ──────────────────────────────────────────────────────────────

  def get_user_transactions(user_id) do
    Repo.all(
      from t in Transaction,
        where: t.from_user_id == ^user_id or t.to_user_id == ^user_id,
        order_by: [desc: t.inserted_at]
    )
  end

  # ── Master Admin Member Lifecycle (Phase 2) ─────────────────────────────────

  def topup_player_by_master(master_admin_id, player_id, amount, audit_meta \\ %{}) do
    amount = Decimal.new(to_string(amount))

    with {:ok, master} <- fetch_master_admin(master_admin_id),
         {:ok, player} <- fetch_player_owned_by_master(master_admin_id, player_id),
         :ok <- ensure_sufficient_balance(master.balance, amount) do
      result =
        Ecto.Multi.new()
        |> Ecto.Multi.run(:deduct_master, fn repo, _changes ->
          master
          |> User.balance_changeset(%{balance: Decimal.sub(master.balance, amount)})
          |> repo.update()
        end)
        |> Ecto.Multi.run(:credit_player, fn repo, _changes ->
          player
          |> User.balance_changeset(%{balance: Decimal.add(player.balance, amount)})
          |> repo.update()
        end)
        |> Ecto.Multi.insert(:transaction, fn _changes ->
          Transaction.changeset(%Transaction{}, %{
            from_user_id: master.id,
            to_user_id: player.id,
            amount: amount,
            transaction_type: :transfer,
            description: "Master admin top-up for player"
          })
        end)
        |> Repo.transaction()

      case result do
        {:ok, %{transaction: tx}} = ok ->
          maybe_log_admin_action(master.id, "master_topup_member", "User", player.id, %{
            amount: amount,
            transaction_id: tx.id,
            ip_address: audit_meta["ip_address"] || audit_meta[:ip_address],
            user_agent: audit_meta["user_agent"] || audit_meta[:user_agent]
          })

          ok

        err ->
          err
      end
    end
  end

  def topup_master_admin(super_admin_id, master_admin_id, amount, audit_meta \\ %{}) do
    amount = Decimal.new(to_string(amount))

    with {:ok, super_admin} <- fetch_super_admin(super_admin_id),
         {:ok, master_admin} <- fetch_master_admin(master_admin_id) do
      result =
        Ecto.Multi.new()
        |> Ecto.Multi.run(:credit_master_admin, fn repo, _changes ->
          master_admin
          |> User.balance_changeset(%{balance: Decimal.add(master_admin.balance, amount)})
          |> repo.update()
        end)
        |> Ecto.Multi.insert(:transaction, fn _changes ->
          Transaction.changeset(%Transaction{}, %{
            from_user_id: super_admin.id,
            to_user_id: master_admin.id,
            amount: amount,
            transaction_type: :credit,
            description: "Super admin top-up for master admin"
          })
        end)
        |> Repo.transaction()

      case result do
        {:ok, %{credit_master_admin: updated, transaction: tx}} ->
          maybe_log_admin_action(
            super_admin.id,
            "super_topup_master_admin",
            "User",
            master_admin.id,
            %{
              amount: amount,
              transaction_id: tx.id,
              ip_address: audit_meta["ip_address"] || audit_meta[:ip_address],
              user_agent: audit_meta["user_agent"] || audit_meta[:user_agent]
            }
          )

          {:ok, %{user: updated, transaction: tx}}

        err ->
          err
      end
    end
  end

  def deduct_master_admin(super_admin_id, master_admin_id, amount, audit_meta \\ %{}) do
    amount = Decimal.new(to_string(amount))

    with {:ok, super_admin} <- fetch_super_admin(super_admin_id),
         {:ok, master_admin} <- fetch_master_admin(master_admin_id),
         :ok <- ensure_sufficient_balance(master_admin.balance, amount) do
      result =
        Ecto.Multi.new()
        |> Ecto.Multi.run(:debit_master_admin, fn repo, _changes ->
          master_admin
          |> User.balance_changeset(%{balance: Decimal.sub(master_admin.balance, amount)})
          |> repo.update()
        end)
        |> Ecto.Multi.insert(:transaction, fn _changes ->
          Transaction.changeset(%Transaction{}, %{
            from_user_id: master_admin.id,
            to_user_id: super_admin.id,
            amount: amount,
            transaction_type: :debit,
            description: "Super admin deduction from master admin"
          })
        end)
        |> Repo.transaction()

      case result do
        {:ok, %{debit_master_admin: updated, transaction: tx}} ->
          maybe_log_admin_action(
            super_admin.id,
            "super_deduct_master_admin",
            "User",
            master_admin.id,
            %{
              amount: amount,
              transaction_id: tx.id,
              ip_address: audit_meta["ip_address"] || audit_meta[:ip_address],
              user_agent: audit_meta["user_agent"] || audit_meta[:user_agent]
            }
          )

          {:ok, %{user: updated, transaction: tx}}

        err ->
          err
      end
    end
  end

  def deduct_player_by_master(master_admin_id, player_id, amount, audit_meta \\ %{}) do
    amount = Decimal.new(to_string(amount))

    with {:ok, master} <- fetch_master_admin(master_admin_id),
         {:ok, player} <- fetch_player_owned_by_master(master_admin_id, player_id),
         :ok <- ensure_sufficient_balance(player.balance, amount) do
      result =
        Ecto.Multi.new()
        |> Ecto.Multi.run(:deduct_player, fn repo, _changes ->
          player
          |> User.balance_changeset(%{balance: Decimal.sub(player.balance, amount)})
          |> repo.update()
        end)
        |> Ecto.Multi.run(:credit_master, fn repo, _changes ->
          master
          |> User.balance_changeset(%{balance: Decimal.add(master.balance, amount)})
          |> repo.update()
        end)
        |> Ecto.Multi.insert(:transaction, fn _changes ->
          Transaction.changeset(%Transaction{}, %{
            from_user_id: player.id,
            to_user_id: master.id,
            amount: amount,
            transaction_type: :transfer,
            description: "Master admin deduction from player"
          })
        end)
        |> Repo.transaction()

      case result do
        {:ok, %{transaction: tx}} = ok ->
          maybe_log_admin_action(master.id, "master_deduct_member", "User", player.id, %{
            amount: amount,
            transaction_id: tx.id,
            ip_address: audit_meta["ip_address"] || audit_meta[:ip_address],
            user_agent: audit_meta["user_agent"] || audit_meta[:user_agent]
          })

          ok

        err ->
          err
      end
    end
  end

  def get_player_ledger(master_admin_id, player_id, opts \\ []) do
    with {:ok, _master} <- fetch_master_admin(master_admin_id),
         {:ok, _player} <- fetch_player_owned_by_master(master_admin_id, player_id) do
      limit = to_positive_int(opts[:limit] || opts["limit"], 100)

      txs =
        from(t in Transaction,
          where: t.from_user_id == ^player_id or t.to_user_id == ^player_id,
          order_by: [desc: t.inserted_at],
          limit: ^limit
        )
        |> Repo.all()

      {:ok, txs}
    end
  end

  def get_player_stats(master_admin_id, player_id) do
    with {:ok, _master} <- fetch_master_admin(master_admin_id),
         {:ok, _player} <- fetch_player_owned_by_master(master_admin_id, player_id) do
      total_bets = Repo.aggregate(from(b in Bet, where: b.user_id == ^player_id), :count, :id)

      pending_bets =
        Repo.aggregate(
          from(b in Bet, where: b.user_id == ^player_id and b.status == :pending),
          :count,
          :id
        )

      won_bets =
        Repo.aggregate(
          from(b in Bet, where: b.user_id == ^player_id and b.status == :won),
          :count,
          :id
        )

      lost_bets =
        Repo.aggregate(
          from(b in Bet, where: b.user_id == ^player_id and b.status == :lost),
          :count,
          :id
        )

      total_stake =
        Repo.one(
          from b in Bet,
            where: b.user_id == ^player_id,
            select: coalesce(sum(b.stake), ^Decimal.new(0))
        )

      total_potential_win =
        Repo.one(
          from b in Bet,
            where: b.user_id == ^player_id and b.status == :won,
            select: coalesce(sum(b.potential_win), ^Decimal.new(0))
        )

      sport_breakdown =
        Repo.all(
          from b in Bet,
            join: m in assoc(b, :match),
            where: b.user_id == ^player_id,
            group_by: m.sport,
            select: %{
              sport: m.sport,
              total_bets: count(b.id),
              total_stake: coalesce(sum(b.stake), ^Decimal.new(0))
            }
        )

      market_breakdown =
        Repo.all(
          from b in Bet,
            join: o in assoc(b, :odds),
            where: b.user_id == ^player_id,
            group_by: o.bet_type,
            select: %{
              bet_type: o.bet_type,
              total_bets: count(b.id),
              total_stake: coalesce(sum(b.stake), ^Decimal.new(0))
            }
        )

      rejected_bets_by_reason =
        Repo.all(
          from r in BetRejectionLog,
            where: r.user_id == ^player_id,
            group_by: r.reason,
            select: %{reason: r.reason, rejected_count: count(r.id)}
        )

      {:ok,
       %{
         player_id: player_id,
         total_bets: total_bets,
         pending_bets: pending_bets,
         won_bets: won_bets,
         lost_bets: lost_bets,
         total_stake: total_stake,
         total_winnings: total_potential_win,
         sport_breakdown: sport_breakdown,
         market_breakdown: market_breakdown,
         rejected_bets_by_reason: rejected_bets_by_reason
       }}
    end
  end

  def get_player_bets_report(master_admin_id, player_id, opts \\ []) do
    with {:ok, _master} <- fetch_master_admin(master_admin_id),
         {:ok, player} <- fetch_player_owned_by_master(master_admin_id, player_id) do
      limit = to_positive_int(opts[:limit] || opts["limit"], 200) |> min(500)
      offset = non_negative_int(opts[:offset] || opts["offset"], 0)
      status = parse_bet_status(opts[:status] || opts["status"])
      from_dt = parse_datetime_opt(opts[:from] || opts["from"])
      to_dt = parse_datetime_opt(opts[:to] || opts["to"])

      base_query =
        from b in Bet,
          where: b.user_id == ^player_id,
          where: ^is_nil(status) or b.status == ^status,
          where: ^is_nil(from_dt) or b.inserted_at >= ^from_dt,
          where: ^is_nil(to_dt) or b.inserted_at <= ^to_dt

      total_count = Repo.aggregate(base_query, :count, :id)

      bets =
        from(b in base_query,
          join: m in assoc(b, :match),
          join: o in assoc(b, :odds),
          order_by: [desc: b.inserted_at],
          limit: ^limit,
          offset: ^offset,
          select: %{
            id: b.id,
            placed_at: b.inserted_at,
            settled_at: b.settled_at,
            stake: b.stake,
            potential_win: b.potential_win,
            status: b.status,
            result: b.result,
            is_in_play: b.is_in_play,
            match: %{
              id: m.id,
              sport: m.sport,
              team1: m.team1,
              team2: m.team2,
              start_time: m.start_time,
              status: m.status,
              winner: m.winner
            },
            odds: %{
              id: o.id,
              bet_type: o.bet_type,
              outcome: o.outcome,
              odds_value: o.odds_value,
              version_no: o.version_no,
              visibility_status: o.visibility_status
            }
          }
        )
        |> Repo.all()

      {:ok,
       %{
         player: %{
           id: player.id,
           username: player.username,
           email: player.email,
           phone_number: player.phone_number,
           balance: player.balance
         },
         filters: %{
           status: status,
           from: from_dt,
           to: to_dt,
           limit: limit,
           offset: offset
         },
         total_count: total_count,
         bets: bets
       }}
    end
  end

  def export_player_report(master_admin_id, player_id, opts \\ []) do
    with {:ok, _master} <- fetch_master_admin(master_admin_id),
         {:ok, player} <- fetch_player_owned_by_master(master_admin_id, player_id) do
      period = parse_export_period(opts[:period] || opts["period"])
      from_dt = parse_datetime_opt(opts[:from] || opts["from"])
      to_dt = parse_datetime_opt(opts[:to] || opts["to"])
      now = DateTime.utc_now() |> DateTime.truncate(:second)
      {window_from, window_to} = default_export_window(period, from_dt, to_dt, now)

      rows =
        from(b in Bet,
          where: b.user_id == ^player_id,
          where: b.inserted_at >= ^window_from and b.inserted_at <= ^window_to,
          select: %{
            inserted_at: b.inserted_at,
            status: b.status,
            stake: b.stake,
            potential_win: b.potential_win
          }
        )
        |> Repo.all()
        |> group_export_rows(period)

      rejected_summary =
        Repo.all(
          from r in BetRejectionLog,
            where: r.user_id == ^player_id,
            where: r.inserted_at >= ^window_from and r.inserted_at <= ^window_to,
            group_by: r.reason,
            select: %{reason: r.reason, rejected_count: count(r.id)}
        )

      {:ok,
       %{
         player: %{
           id: player.id,
           username: player.username,
           email: player.email
         },
         period: period,
         from: window_from,
         to: window_to,
         generated_at: now,
         rows: rows,
         rejected_bets_by_reason: rejected_summary
       }}
    end
  end

  defp fetch_master_admin(user_id) do
    case get_user(user_id) do
      %User{role: :master_admin, is_active: true} = user -> {:ok, user}
      %User{role: :master_admin} -> {:error, :inactive}
      %User{} -> {:error, :forbidden}
      nil -> {:error, :not_found}
    end
  end

  defp fetch_super_admin(user_id) do
    case get_user(user_id) do
      %User{role: :super_admin, is_active: true} = user -> {:ok, user}
      %User{role: :super_admin} -> {:error, :inactive}
      %User{} -> {:error, :forbidden}
      nil -> {:error, :not_found}
    end
  end

  defp fetch_player_owned_by_master(master_admin_id, player_id) do
    case get_user(player_id) do
      %User{role: role, created_by_id: ^master_admin_id} = user
      when role in [:player, :customer] ->
        {:ok, user}

      %User{} ->
        {:error, :forbidden}

      nil ->
        {:error, :not_found}
    end
  end

  defp ensure_sufficient_balance(balance, amount) do
    if Decimal.compare(balance, amount) != :lt, do: :ok, else: {:error, :insufficient_balance}
  end

  defp maybe_log_admin_action(actor_id, action, target_type, target_id, payload) do
    ip_address = payload[:ip_address] || payload["ip_address"]
    user_agent = payload[:user_agent] || payload["user_agent"]

    _ =
      Admin.log_action(%{
        actor_id: actor_id,
        action: action,
        target_type: target_type,
        target_id: target_id,
        payload: payload,
        ip_address: ip_address,
        user_agent: user_agent
      })

    :ok
  end

  defp to_positive_int(nil, default), do: default
  defp to_positive_int(v, _default) when is_integer(v) and v > 0, do: v

  defp to_positive_int(v, default) when is_binary(v) do
    case Integer.parse(v) do
      {int, ""} when int > 0 -> int
      _ -> default
    end
  end

  defp to_positive_int(_, default), do: default

  defp non_negative_int(nil, default), do: default
  defp non_negative_int(v, _default) when is_integer(v) and v >= 0, do: v

  defp non_negative_int(v, default) when is_binary(v) do
    case Integer.parse(v) do
      {int, ""} when int >= 0 -> int
      _ -> default
    end
  end

  defp non_negative_int(_, default), do: default

  defp parse_bet_status(nil), do: nil

  defp parse_bet_status(v) when is_binary(v) do
    case String.downcase(String.trim(v)) do
      "pending" -> :pending
      "won" -> :won
      "lost" -> :lost
      "cancelled" -> :cancelled
      _ -> nil
    end
  end

  defp parse_bet_status(v) when v in [:pending, :won, :lost, :cancelled], do: v
  defp parse_bet_status(_), do: nil

  defp parse_datetime_opt(nil), do: nil

  defp parse_datetime_opt(%DateTime{} = dt), do: DateTime.truncate(dt, :second)

  defp parse_datetime_opt(v) when is_binary(v) do
    case DateTime.from_iso8601(v) do
      {:ok, dt, _offset} ->
        DateTime.truncate(dt, :second)

      _ ->
        nil
    end
  end

  defp parse_datetime_opt(_), do: nil

  defp parse_export_period(v) when v in [:daily, :weekly], do: v

  defp parse_export_period(v) when is_binary(v) do
    case String.downcase(String.trim(v)) do
      "weekly" -> :weekly
      _ -> :daily
    end
  end

  defp parse_export_period(_), do: :daily

  defp default_export_window(:weekly, nil, nil, now),
    do: {DateTime.add(now, -7 * 86_400, :second), now}

  defp default_export_window(:daily, nil, nil, now),
    do: {DateTime.add(now, -86_400, :second), now}

  defp default_export_window(_period, from_dt, to_dt, now),
    do: {from_dt || DateTime.add(now, -86_400, :second), to_dt || now}

  defp group_export_rows(rows, period) do
    rows
    |> Enum.group_by(fn row -> period_bucket_start(row.inserted_at, period) end)
    |> Enum.map(fn {bucket_start, bucket_rows} ->
      total_bets = length(bucket_rows)
      pending_bets = Enum.count(bucket_rows, &(&1.status == :pending))
      won_bets = Enum.count(bucket_rows, &(&1.status == :won))
      lost_bets = Enum.count(bucket_rows, &(&1.status == :lost))
      cancelled_bets = Enum.count(bucket_rows, &(&1.status == :cancelled))

      total_stake =
        Enum.reduce(bucket_rows, Decimal.new(0), fn r, acc ->
          Decimal.add(acc, r.stake || Decimal.new(0))
        end)

      total_winnings =
        Enum.reduce(bucket_rows, Decimal.new(0), fn r, acc ->
          if r.status == :won do
            Decimal.add(acc, r.potential_win || Decimal.new(0))
          else
            acc
          end
        end)

      %{
        period_start: bucket_start,
        period_end: period_bucket_end(bucket_start, period),
        total_bets: total_bets,
        pending_bets: pending_bets,
        won_bets: won_bets,
        lost_bets: lost_bets,
        cancelled_bets: cancelled_bets,
        total_stake: total_stake,
        total_winnings: total_winnings
      }
    end)
    |> Enum.sort_by(& &1.period_start, {:desc, DateTime})
  end

  defp period_bucket_start(%DateTime{} = dt, :daily) do
    {:ok, value} = DateTime.new(DateTime.to_date(dt), ~T[00:00:00], "Etc/UTC")
    DateTime.truncate(value, :second)
  end

  defp period_bucket_start(%DateTime{} = dt, :weekly) do
    date = DateTime.to_date(dt)
    first_day = Date.beginning_of_week(date, :monday)
    {:ok, value} = DateTime.new(first_day, ~T[00:00:00], "Etc/UTC")
    DateTime.truncate(value, :second)
  end

  defp period_bucket_end(%DateTime{} = dt, :daily), do: DateTime.add(dt, 86_400 - 1, :second)
  defp period_bucket_end(%DateTime{} = dt, :weekly), do: DateTime.add(dt, 7 * 86_400 - 1, :second)
end
