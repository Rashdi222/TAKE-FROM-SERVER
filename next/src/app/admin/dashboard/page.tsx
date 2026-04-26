"use client";

import { useSuperAdminDashboard } from "@/hooks/useSuperAdmin";
import { SuperDashboardStatCard } from "@/components/admin/SuperDashboardStatCard";
import { Alert } from "@/components/ui/Alert";
import { Card } from "@/components/ui/Card";
import { PendingPaymentsWidget } from "@/components/payments/PendingPaymentsWidget";
import { CurrencyBreakdown } from "@/lib/api";
import { formatCurrency } from "@/lib/format";

export default function SuperAdminDashboardPage() {
  const { data, isLoading, isError } = useSuperAdminDashboard();
  const stats = (data as { data?: Record<string, unknown> } | undefined)?.data;
  const currencyBreakdown = ((stats?.currency_breakdown as CurrencyBreakdown[] | undefined) ?? []).filter(
    (item) => Number(item.user_count ?? 0) > 0 || Number(item.total_balance ?? 0) > 0
  );

  const statItems = stats
      ? [
        { label: "Total Users", value: stats.total_users ?? "-", key: "total_users" },
        {
          label: "Total Master Admins",
          value: stats.total_master_admins ?? "-",
          key: "total_master_admins",
        },
        { label: "Total Players", value: stats.total_players ?? "-", key: "total_players" },
        {
          label: "Platform Balance",
          value: stats.total_balance_on_platform ?? "-",
          key: "total_balance_on_platform",
          isMoney: true,
        },
        { label: "Total Bets", value: stats.total_bets ?? "-", key: "total_bets" },
        { label: "Pending Bets", value: stats.pending_bets ?? "-", key: "pending_bets" },
      ]
    : [];

  const formatValue = (value: unknown, isMoney?: boolean) => {
    if (!isMoney) return String(value);

    const numeric = Number(value);
    return Number.isFinite(numeric) ? `${numeric.toFixed(2)} mixed` : String(value);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="mb-6 text-3xl font-bold text-[var(--c-text)]">Platform Dashboard</h1>

      {isLoading ? (
        <p className="text-[var(--c-text-muted)]">Loading dashboard...</p>
      ) : isError ? (
        <Alert variant="error">
          Dashboard stats could not be loaded. The backend response is failing or incomplete.
        </Alert>
      ) : (
        <div className="space-y-4">
          <Alert variant="warning">
            Platform-wide money totals currently aggregate accounts across multiple currencies. The balance metric is shown as a mixed-currency total, not a converted FX value.
          </Alert>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {statItems.map((item) => (
              <SuperDashboardStatCard
                key={item.key}
                label={item.key === "total_balance_on_platform" ? "Platform Balance (Mixed)" : item.label}
                value={formatValue(item.value, item.isMoney)}
              />
            ))}
          </div>

          <PendingPaymentsWidget
            summary={{
              pending_deposits: Number(stats.pending_deposits ?? 0),
              pending_withdrawals: Number(stats.pending_withdrawals ?? 0),
              stale_pending_count: Number(stats.stale_pending_payments ?? 0),
              oldest_pending_at: typeof stats.oldest_pending_payment_at === "string" ? stats.oldest_pending_payment_at : null,
            }}
          />

          {currencyBreakdown.length > 0 ? (
            <Card variant="surface-2" className="p-6">
              <h2 className="text-xl font-semibold text-[var(--c-text)]">Per-Currency Breakdown</h2>
              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                {currencyBreakdown.map((item) => (
                  <div
                    key={item.code}
                    className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-[var(--c-text)]">
                          {item.flag} {item.code} - {item.name}
                        </p>
                        <p className="mt-1 text-xs uppercase tracking-[0.14em] text-[var(--c-text-faint)]">
                          {item.user_count ?? 0} accounts
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-[var(--c-text-muted)]">Balance</p>
                        <p className="font-mono text-lg text-[var(--c-success)]">
                          {formatCurrency(item.total_balance ?? 0, item.code)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-[var(--c-text-muted)]">Volume</p>
                        <p className="font-mono text-[var(--c-text)]">
                          {formatCurrency(item.total_volume ?? 0, item.code)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[var(--c-text-muted)]">Payouts</p>
                        <p className="font-mono text-[var(--c-text)]">
                          {formatCurrency(item.total_payouts ?? 0, item.code)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[var(--c-text-muted)]">Net Revenue</p>
                        <p className="font-mono text-[var(--c-success)]">
                          {formatCurrency(item.net_revenue ?? 0, item.code)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[var(--c-text-muted)]">Pending Withdrawals</p>
                        <p className="font-mono text-[var(--c-warning)]">
                          {formatCurrency(item.pending_withdrawals ?? 0, item.code)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}
        </div>
      )}
    </div>
  );
}
