"use client";

import { useMasterDashboard } from "@/hooks/useMasterDashboard";
import { DashboardCharts } from "@/components/master/DashboardCharts";
import { Alert } from "@/components/ui/Alert";
import { PendingPaymentsWidget } from "@/components/payments/PendingPaymentsWidget";

export default function MasterDashboardPage() {
  const { data, isLoading, isError } = useMasterDashboard();
  const stats = (data as { data?: Record<string, unknown> } | undefined)?.data;
  const currency = String(stats?.account_currency ?? "USD");

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="mb-6 text-3xl font-bold text-[var(--c-text)]">Dashboard</h1>

      {isLoading ? (
        <p className="text-[var(--c-text-muted)]">Loading dashboard...</p>
      ) : isError ? (
        <Alert variant="error">
          Dashboard stats could not be loaded. Please check the backend response payload.
        </Alert>
      ) : (
        <div className="space-y-6">
          <DashboardCharts data={stats} currency={currency} />
          <PendingPaymentsWidget
            summary={{
              pending_deposits: Number(stats?.pending_deposits ?? 0),
              pending_withdrawals: Number(stats?.pending_withdrawals ?? 0),
              stale_pending_count: Number(stats?.stale_pending_payments ?? 0),
              oldest_pending_at:
                typeof stats?.oldest_pending_payment_at === "string" ? stats.oldest_pending_payment_at : null,
            }}
          />
        </div>
      )}
    </div>
  );
}
