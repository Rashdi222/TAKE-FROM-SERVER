"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { PlatformStats } from "@/lib/api";
import { AccountCurrencyFilter } from "@/components/admin/AccountCurrencyFilter";
import { PlatformCurrencyBreakdownTable } from "@/components/admin/PlatformCurrencyBreakdownTable";
import { PlatformSnapshotGrid } from "@/components/admin/PlatformSnapshotGrid";
import { useAccountCurrencies, useSuperAdminMonthlyReport } from "@/hooks/useSuperAdmin";

export default function MonthlyReportPage() {
  const [currencyFilter, setCurrencyFilter] = useState("");
  const { data: currencyData } = useAccountCurrencies();
  const { data, isLoading } = useSuperAdminMonthlyReport();
  const stats = ((data as { data?: PlatformStats } | undefined)?.data ?? {}) as PlatformStats;
  const currencies = (currencyData?.data ?? []).filter((currency) => currency.enabled !== false);
  const currencyBreakdown = (stats.currency_breakdown ?? []).filter((item) =>
    !currencyFilter || item.code === currencyFilter
  );

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.24em] text-[var(--c-accent)]">Reports</p>
        <h1 className="mt-2 text-3xl font-semibold text-[var(--c-text)]">Monthly Report</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--c-text-muted)]">Month-to-date platform performance from the current analytics backend.</p>
      </div>

      {isLoading ? (
        <p className="text-[var(--c-text-muted)]">Loading monthly report...</p>
      ) : (
        <div className="space-y-6">
          <Card variant="surface-2" className="p-4">
            <p className="text-sm text-[var(--c-text-muted)]">
              Snapshot totals remain mixed-currency aggregates. Use the table below for per-currency operational values.
            </p>
          </Card>
          <PlatformSnapshotGrid stats={stats} />
          <Card variant="surface-2" className="p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-[var(--c-text)]">Monthly Per-Currency Totals</h2>
                <p className="mt-1 text-sm text-[var(--c-text-muted)]">Focus the monthly currency table on one account currency if needed.</p>
              </div>
              <div className="w-full max-w-xs">
                <AccountCurrencyFilter
                  value={currencyFilter}
                  onChange={setCurrencyFilter}
                  currencies={currencies}
                  label="Focus currency"
                />
              </div>
            </div>
            <div className="mt-4">
              <PlatformCurrencyBreakdownTable items={currencyBreakdown} title="" wrap={false} />
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
