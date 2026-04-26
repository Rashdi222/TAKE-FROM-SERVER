defmodule Back.Analytics.CurrencyBreakdown do
  import Ecto.Query

  alias Back.Accounts.AccountCurrency
  alias Back.Accounts.Transaction
  alias Back.Accounts.User
  alias Back.Payments.PaymentTransaction
  alias Back.Repo

  def platform_breakdown(range \\ nil) do
    balances = balances_by_currency()
    user_counts = user_counts_by_currency()
    volume = transaction_totals_by_currency(:bet_placed, :from_user_id, range)
    payouts = transaction_totals_by_currency(:bet_won, :to_user_id, range)
    pending_withdrawals = pending_withdrawals_by_currency()

    AccountCurrency.supported()
    |> Enum.map(fn currency ->
      code = currency.code
      total_volume = Map.get(volume, code, Decimal.new(0))
      total_payouts = Map.get(payouts, code, Decimal.new(0))

      %{
        code: code,
        name: currency.name,
        symbol: currency.symbol,
        flag: currency.flag,
        kind: currency.kind,
        enabled: AccountCurrency.enabled?(code),
        user_count: Map.get(user_counts, code, 0),
        total_balance: Map.get(balances, code, Decimal.new(0)),
        total_volume: total_volume,
        total_payouts: total_payouts,
        net_revenue: Decimal.sub(total_volume, total_payouts),
        pending_withdrawals: Map.get(pending_withdrawals, code, Decimal.new(0))
      }
    end)
  end

  defp balances_by_currency do
    Repo.all(
      from u in User,
        group_by: u.account_currency,
        select: {u.account_currency, coalesce(sum(u.balance), ^Decimal.new(0))}
    )
    |> Map.new()
  end

  defp user_counts_by_currency do
    Repo.all(
      from u in User,
        group_by: u.account_currency,
        select: {u.account_currency, count(u.id)}
    )
    |> Map.new()
  end

  defp transaction_totals_by_currency(transaction_type, join_field, nil) do
    transaction_totals_by_currency(transaction_type, join_field, {nil, nil})
  end

  defp transaction_totals_by_currency(transaction_type, join_field, {from, to}) do
    Transaction
    |> join(:inner, [t], u in User, on: field(t, ^join_field) == u.id)
    |> where([t, _u], t.transaction_type == ^transaction_type)
    |> maybe_filter_range(from, to)
    |> group_by([_t, u], u.account_currency)
    |> select([t, u], {u.account_currency, coalesce(sum(t.amount), ^Decimal.new(0))})
    |> Repo.all()
    |> Map.new()
  end

  defp pending_withdrawals_by_currency do
    PaymentTransaction
    |> join(:inner, [pt], u in User, on: pt.user_id == u.id)
    |> where(
      [pt, _u],
      fragment("?->>'type' = ?", pt.provider_response, "withdrawal") and pt.status == :pending
    )
    |> group_by([_pt, u], u.account_currency)
    |> select([pt, u], {u.account_currency, coalesce(sum(pt.amount), ^Decimal.new(0))})
    |> Repo.all()
    |> Map.new()
  end

  defp maybe_filter_range(query, nil, nil), do: query

  defp maybe_filter_range(query, from, to) do
    where(query, [t, _u], t.inserted_at >= ^from and t.inserted_at <= ^to)
  end
end
