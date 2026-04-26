"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { ReportRangeTabs } from "@/components/master/ReportRangeTabs";
import { useMasterDashboard } from "@/hooks/useMasterDashboard";
import { useMasterReports } from "@/hooks/useMasterReports";
import { formatCurrency } from "@/lib/format";

function rangeToFilters(range: "1d" | "1w" | "1m" | "custom", from: string, to: string) {
  const now = new Date();
  const start = new Date(now);

  if (range === "1d") start.setDate(now.getDate() - 1);
  if (range === "1w") start.setDate(now.getDate() - 7);
  if (range === "1m") start.setMonth(now.getMonth() - 1);

  if (range === "custom") {
    return {
      from: from ? new Date(from).toISOString() : undefined,
      to: to ? new Date(to).toISOString() : undefined,
    };
  }

  return {
    from: start.toISOString(),
    to: now.toISOString(),
  };
}

export default function MasterReportsPage() {
  const [range, setRange] = useState<"1d" | "1w" | "1m" | "custom">("1d");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const filters = useMemo(() => rangeToFilters(range, from, to), [range, from, to]);
  const { data: dashboardData } = useMasterDashboard();
  const { data, isLoading, isError } = useMasterReports(filters);
  const report = (data as { data?: Record<string, unknown> } | undefined)?.data || {};
  const currency = String((dashboardData as { data?: { account_currency?: string } } | undefined)?.data?.account_currency ?? "USD");

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.24em] text-[var(--c-accent)]">Reports</p>
        <h1 className="mt-2 text-3xl font-bold text-[var(--c-text)]">Master Admin Reports</h1>
        <p className="mt-2 text-sm text-[var(--c-text-muted)]">
          Review your player volume, payouts, house edge, commission, and rejection patterns across common windows or a custom range.
        </p>
      </div>

      <ReportRangeTabs
        range={range}
        onRangeChange={setRange}
        from={from}
        to={to}
        onFromChange={setFrom}
        onToChange={setTo}
      />

      {isLoading ? (
        <p className="text-[var(--c-text-muted)]">Loading reports...</p>
      ) : isError ? (
        <Alert variant="error">Reports could not be loaded.</Alert>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card variant="surface-2" className="p-6">
              <p className="text-sm text-[var(--c-text-muted)]">Player Count</p>
              <p className="mt-2 text-3xl font-mono text-[var(--c-text)]">
                {Number(report.player_count ?? 0)}
              </p>
            </Card>
            <Card variant="surface-2" className="p-6">
              <p className="text-sm text-[var(--c-text-muted)]">Player Volume</p>
              <p className="mt-2 text-3xl font-mono text-[var(--c-text)]">
                {formatCurrency(report.player_volume ?? 0, currency)}
              </p>
            </Card>
            <Card variant="surface-2" className="p-6">
              <p className="text-sm text-[var(--c-text-muted)]">Player Payouts</p>
              <p className="mt-2 text-3xl font-mono text-[var(--c-warning)]">
                {formatCurrency(report.player_payouts ?? 0, currency)}
              </p>
            </Card>
            <Card variant="surface-2" className="p-6">
              <p className="text-sm text-[var(--c-text-muted)]">Commission Earned</p>
              <p className="mt-2 text-3xl font-mono text-[var(--c-success)]">
                {formatCurrency(report.commission_earned ?? 0, currency)}
              </p>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card variant="surface-2" className="p-6">
              <h2 className="text-lg font-semibold text-[var(--c-text)]">Sport Breakdown</h2>
              <div className="mt-4 space-y-3">
                {((report.sport_breakdown as Array<Record<string, unknown>>) || []).map((item) => (
                  <div
                    key={String(item.sport)}
                    className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] p-4"
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-[var(--c-text)]">{String(item.sport)}</div>
                      <div className="text-sm text-[var(--c-text-muted)]">
                        {Number(item.total_bets ?? 0)} bets · {formatCurrency(item.total_stake ?? 0, currency)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card variant="surface-2" className="p-6">
              <h2 className="text-lg font-semibold text-[var(--c-text)]">Rejection Reasons</h2>
              <div className="mt-4 space-y-3">
                {((report.rejected_bets_by_reason as Array<Record<string, unknown>>) || []).map((item) => (
                  <div
                    key={String(item.reason)}
                    className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] p-4"
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-[var(--c-text)]">{String(item.reason)}</div>
                      <div className="text-sm text-[var(--c-text-muted)]">
                        {Number(item.rejected_count ?? 0)} rejected
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
