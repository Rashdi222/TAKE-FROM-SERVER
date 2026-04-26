defmodule Back.Analytics do
  import Ecto.Query
  alias Back.Repo
  alias Back.Analytics.CurrencyBreakdown
  alias Back.Analytics.CricketQuoteAudit
  alias Back.Accounts.{User, Transaction}
  alias Back.Betting.{Match, Bet, BetRejectionLog}
  alias Back.Payments.PaymentTransaction

  # ── Platform Stats (Super Admin) ──────────────────────────────────────────────

  def get_platform_stats(opts \\ []) do
    range = date_range(opts)

    %{
      total_volume: total_bet_volume(range),
      total_payouts: total_payouts(range),
      net_revenue: net_revenue(range),
      total_users: user_counts(),
      active_matches: active_match_count(),
      pending_withdrawals: pending_withdrawal_total(),
      currency_breakdown: CurrencyBreakdown.platform_breakdown(range)
    }
  end

  defp total_bet_volume(range) do
    Repo.one(
      from t in Transaction,
        where: t.transaction_type == :bet_placed,
        where: ^range_filter(range),
        select: coalesce(sum(t.amount), ^Decimal.new(0))
    )
  end

  defp total_payouts(range) do
    Repo.one(
      from t in Transaction,
        where: t.transaction_type == :bet_won,
        where: ^range_filter(range),
        select: coalesce(sum(t.amount), ^Decimal.new(0))
    )
  end

  defp net_revenue(range) do
    volume = total_bet_volume(range)
    payouts = total_payouts(range)
    Decimal.sub(volume, payouts)
  end

  defp user_counts do
    Repo.all(
      from u in User,
        group_by: u.role,
        select: {u.role, count(u.id)}
    )
    |> Map.new()
  end

  defp active_match_count do
    Repo.one(from m in Match, where: m.status in [:upcoming, :live], select: count(m.id))
  end

  defp pending_withdrawal_total do
    Repo.one(
      from pt in PaymentTransaction,
        where:
          fragment("?->>'type' = ?", pt.provider_response, "withdrawal") and pt.status == :pending,
        select: coalesce(sum(pt.amount), ^Decimal.new(0))
    )
  end

  # ── Master Admin P&L + Commission ─────────────────────────────────────────────

  def get_master_admin_report(master_admin_id, opts \\ []) do
    range = date_range(opts)
    master_admin = Repo.get(User, master_admin_id)

    player_ids =
      Repo.all(from u in User, where: u.created_by_id == ^master_admin_id, select: u.id)

    player_volume =
      Repo.one(
        from t in Transaction,
          where: t.transaction_type == :bet_placed and t.from_user_id in ^player_ids,
          where: ^range_filter(range),
          select: coalesce(sum(t.amount), ^Decimal.new(0))
      )

    player_payouts =
      Repo.one(
        from t in Transaction,
          where: t.transaction_type == :bet_won and t.to_user_id in ^player_ids,
          where: ^range_filter(range),
          select: coalesce(sum(t.amount), ^Decimal.new(0))
      )

    commission_earned =
      Repo.one(
        from t in Transaction,
          where: t.transaction_type == :commission and t.to_user_id == ^master_admin_id,
          where: ^range_filter(range),
          select: coalesce(sum(t.amount), ^Decimal.new(0))
      )

    sport_breakdown =
      Repo.all(
        from b in Bet,
          join: m in assoc(b, :match),
          where: b.user_id in ^player_ids,
          where: ^bet_range_filter(range),
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
          where: b.user_id in ^player_ids,
          where: ^bet_range_filter(range),
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
          where: r.user_id in ^player_ids,
          where: ^rejection_range_filter(range),
          group_by: r.reason,
          select: %{reason: r.reason, rejected_count: count(r.id)}
      )

    %{
      master_admin_id: master_admin_id,
      account_currency: master_admin && master_admin.account_currency,
      player_count: length(player_ids),
      player_volume: player_volume,
      player_payouts: player_payouts,
      house_edge: Decimal.sub(player_volume, player_payouts),
      commission_earned: commission_earned,
      sport_breakdown: sport_breakdown,
      market_breakdown: market_breakdown,
      rejected_bets_by_reason: rejected_bets_by_reason
    }
  end

  def get_all_master_admin_reports(opts \\ []) do
    currency = Keyword.get(opts, :account_currency)

    from(u in User, where: u.role == :master_admin)
    |> maybe_filter_account_currency(currency)
    |> select([u], u.id)
    |> Repo.all()
    |> Enum.map(&get_master_admin_report(&1, opts))
  end

  # ── Player Ledger ─────────────────────────────────────────────────────────────

  def get_player_ledger(user_id, opts \\ []) do
    range = date_range(opts)
    types = Keyword.get(opts, :types, nil)

    Transaction
    |> where([t], t.from_user_id == ^user_id or t.to_user_id == ^user_id)
    |> then(fn q -> if range, do: where(q, [t], ^range_filter(range)), else: q end)
    |> then(fn q -> if types, do: where(q, [t], t.transaction_type in ^types), else: q end)
    |> order_by([t], desc: t.inserted_at)
    |> Repo.all()
  end

  # ── Daily / Weekly / Monthly Reports ─────────────────────────────────────────

  def daily_report(date \\ Date.utc_today()) do
    get_platform_stats(
      from: DateTime.new!(date, ~T[00:00:00], "Etc/UTC"),
      to: DateTime.new!(date, ~T[23:59:59], "Etc/UTC")
    )
  end

  def weekly_report do
    today = Date.utc_today()

    get_platform_stats(
      from: DateTime.new!(Date.add(today, -7), ~T[00:00:00], "Etc/UTC"),
      to: DateTime.new!(today, ~T[23:59:59], "Etc/UTC")
    )
  end

  def monthly_report do
    today = Date.utc_today()

    get_platform_stats(
      from: DateTime.new!(Date.beginning_of_month(today), ~T[00:00:00], "Etc/UTC"),
      to: DateTime.new!(today, ~T[23:59:59], "Etc/UTC")
    )
  end

  def insert_cricket_quote_audits(rows) when is_list(rows) do
    rows =
      Enum.map(rows, fn row ->
        now = DateTime.utc_now() |> DateTime.truncate(:second)

        row
        |> Map.put_new(:id, Ecto.UUID.generate())
        |> Map.put_new(:inserted_at, now)
      end)

    if rows == [] do
      {0, nil}
    else
      Repo.insert_all(CricketQuoteAudit, rows)
    end
  end

  def resolve_cricket_quote_audits_for_match(%Match{} = match) do
    status = to_string(match.status)
    winner = match.winner && to_string(match.winner)
    resolved_at = DateTime.utc_now() |> DateTime.truncate(:second)

    Repo.update_all(
      from(a in CricketQuoteAudit,
        where: a.match_id == ^match.id and is_nil(a.resolved_at)
      ),
      set: [
        eventual_match_status: status,
        eventual_winner: winner,
        resolved_at: resolved_at
      ]
    )
  end

  def cricket_quote_calibration_report(opts \\ []) do
    limit = opts[:limit] || 60
    range = date_range(opts)

    query =
      from a in CricketQuoteAudit,
        join: m in Match,
        on: m.id == a.match_id,
        where: m.sport == :cricket

    query =
      case range do
        nil -> query
        {from, to} -> where(query, [a, _m], a.inserted_at >= ^from and a.inserted_at <= ^to)
      end

    rows =
      Repo.all(
        from [a, m] in query,
          order_by: [desc: a.inserted_at],
          limit: ^limit,
          select: %{
            id: a.id,
            match_id: a.match_id,
            match_status: m.status,
            team1: m.team1,
            team2: m.team2,
            state_version: a.state_version,
            event_seq: a.event_seq,
            market_key: a.market_key,
            selection_key: a.selection_key,
            published_price: a.published_price,
            fair_probability: a.fair_probability,
            display_probability: a.display_probability,
            approved_probability: a.approved_probability,
            confidence_score: a.confidence_score,
            valid_for_ms: a.valid_for_ms,
            reviewer_decision: a.reviewer_decision,
            active_playbooks: a.active_playbooks,
            reference_source: a.reference_source,
            reference_price: a.reference_price,
            reference_probability: a.reference_probability,
            reference_probability_delta: a.reference_probability_delta,
            eventual_match_status: a.eventual_match_status,
            eventual_winner: a.eventual_winner,
            inserted_at: a.inserted_at
          }
      )

    total = Repo.aggregate(query, :count)

    drift_rows =
      Repo.all(
        from [a, _m] in query,
          where: not is_nil(a.reference_probability_delta),
          select: a.reference_probability_delta
      )

    resolved_count =
      Repo.aggregate(
        from([a, _m] in query, where: not is_nil(a.resolved_at)),
        :count
      )

    with_reference_count =
      Repo.aggregate(
        from([a, _m] in query, where: not is_nil(a.reference_source)),
        :count
      )

    high_drift_count =
      Repo.aggregate(
        from([a, _m] in query, where: a.reference_probability_delta > 0.12),
        :count
      )

    avg_drift =
      case drift_rows do
        [] -> 0.0
        values -> Enum.sum(values) / length(values)
      end

    %{
      total_quotes: total,
      with_reference_count: with_reference_count,
      resolved_count: resolved_count,
      unresolved_count: max(total - resolved_count, 0),
      high_drift_count: high_drift_count,
      average_reference_drift: Float.round(avg_drift, 4),
      recent_quotes: rows
    }
  end

  # ── Private Helpers ───────────────────────────────────────────────────────────

  defp date_range(opts) do
    case {Keyword.get(opts, :from), Keyword.get(opts, :to)} do
      {nil, nil} -> nil
      pair -> pair
    end
  end

  defp range_filter(nil), do: dynamic(true)
  defp range_filter({from, to}), do: dynamic([t], t.inserted_at >= ^from and t.inserted_at <= ^to)

  defp bet_range_filter(nil), do: dynamic(true)

  defp bet_range_filter({from, to}),
    do: dynamic([b], b.inserted_at >= ^from and b.inserted_at <= ^to)

  defp rejection_range_filter(nil), do: dynamic(true)

  defp rejection_range_filter({from, to}) do
    dynamic([r], r.inserted_at >= ^from and r.inserted_at <= ^to)
  end

  defp maybe_filter_account_currency(query, nil), do: query
  defp maybe_filter_account_currency(query, ""), do: query

  defp maybe_filter_account_currency(query, currency) do
    where(query, [u], u.account_currency == ^currency)
  end
end
