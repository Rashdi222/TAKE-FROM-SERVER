"use client";

import Link from "next/link";
import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { CurrencyBreakdown, MasterAdminReport, PlatformStats } from "@/lib/api";
import { AccountCurrencyFilter } from "@/components/admin/AccountCurrencyFilter";
import { PlatformCurrencyBreakdownTable } from "@/components/admin/PlatformCurrencyBreakdownTable";
import { PlatformSnapshotGrid } from "@/components/admin/PlatformSnapshotGrid";
import { formatCurrency } from "@/lib/format";
import { useAccountCurrencies, useSuperAdminMasterAdminReports, useSuperAdminReportStats } from "@/hooks/useSuperAdmin";

const reportLinks = [
  { href: "/admin/reports/daily", label: "Daily Report", description: "Operational snapshot for a single UTC day." },
  { href: "/admin/reports/weekly", label: "Weekly Report", description: "Rolling seven-day platform performance." },
  { href: "/admin/reports/monthly", label: "Monthly Report", description: "Month-to-date volume, payouts, and exposure." },
  { href: "/admin/reports/cricket-calibration", label: "Cricket Calibration", description: "Audit AI live cricket prices against stored reference drift and resolved outcomes." },
];

export default function ReportsPage() {
  const [currencyFilter, setCurrencyFilter] = useState("");
  const [currencyBreakdownFilter, setCurrencyBreakdownFilter] = useState("");
  const { data: statsData } = useSuperAdminReportStats();
  const { data: currencyData } = useAccountCurrencies();
  const { data: masterData, isLoading: masterLoading } = useSuperAdminMasterAdminReports(
    currencyFilter ? { account_currency: currencyFilter } : undefined
  );

  const stats = ((statsData as { data?: PlatformStats } | undefined)?.data ?? {}) as PlatformStats;
  const reports = ((masterData as { data?: MasterAdminReport[] } | undefined)?.data ?? []) as MasterAdminReport[];
  const currencyBreakdown = ((stats.currency_breakdown ?? []) as CurrencyBreakdown[]).filter((item) =>
    !currencyBreakdownFilter || item.code === currencyBreakdownFilter
  );
  const currencies = (currencyData?.data ?? []).filter((currency) => currency.enabled !== false);

  const userTotals = stats.total_users ?? {};

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.24em] text-[var(--c-accent)]">Reports</p>
        <h1 className="mt-2 text-3xl font-semibold text-[var(--c-text)]">Platform Reporting Desk</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--c-text-muted)]">
          A reporting entry point for platform finance and master-admin performance. The cards below mirror the backend analytics output directly, so nothing here depends on synthetic chart data.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {reportLinks.map((link) => (
          <Card key={link.href} variant="surface-2" className="p-6">
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Snapshot</p>
            <h2 className="mt-3 text-2xl font-semibold text-[var(--c-text)]">{link.label}</h2>
            <p className="mt-3 text-sm leading-6 text-[var(--c-text-muted)]">{link.description}</p>
            <div className="mt-6">
              <Link href={link.href}>
                <Button variant="primary">Open Report</Button>
              </Link>
            </div>
          </Card>
        ))}
      </div>

      <PlatformSnapshotGrid stats={stats} />

      <Card variant="surface-2" className="p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-[var(--c-text)]">Per-Currency Platform Totals</h2>
            <p className="mt-1 text-sm text-[var(--c-text-muted)]">Narrow the platform currency table to a single account currency when needed.</p>
          </div>
          <div className="w-full max-w-xs">
            <AccountCurrencyFilter
              value={currencyBreakdownFilter}
              onChange={setCurrencyBreakdownFilter}
              currencies={currencies}
              label="Focus currency"
            />
          </div>
        </div>
        <div className="mt-4">
          <PlatformCurrencyBreakdownTable items={currencyBreakdown} title="" wrap={false} />
        </div>
      </Card>

      <Card variant="surface-2" className="p-6">
        <h2 className="text-xl font-semibold text-[var(--c-text)]">User Mix</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {Object.entries(userTotals).map(([role, count]) => (
            <div key={role} className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">{role.replaceAll("_", " ")}</p>
              <p className="mt-3 font-mono text-2xl text-[var(--c-text)]">{count}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card variant="surface-1" className="overflow-hidden">
        <div className="border-b border-[var(--c-border)] px-6 py-4">
          <h2 className="text-xl font-semibold text-[var(--c-text)]">Master Admin Performance</h2>
          <p className="mt-1 text-sm text-[var(--c-text-muted)]">Rendered directly from the analytics report feed.</p>
        </div>
        <div className="border-b border-[var(--c-border)] px-6 py-4">
          <div className="max-w-xs">
            <AccountCurrencyFilter
              value={currencyFilter}
              onChange={setCurrencyFilter}
              currencies={currencies}
              label="Filter master-admin reports by currency"
            />
          </div>
        </div>
        {masterLoading ? (
          <div className="p-6 text-[var(--c-text-muted)]">Loading master admin reports...</div>
        ) : reports.length === 0 ? (
          <div className="p-6 text-[var(--c-text-muted)]">No master admin reports available.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px]">
              <thead>
                <tr className="border-b border-[var(--c-border)] bg-[var(--c-surface-2)]/50">
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Master Admin</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Currency</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Players</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Volume</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Payouts</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">House Edge</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Commission</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((report) => (
                  <tr key={report.master_admin_id} className="border-b border-[var(--c-border)] last:border-b-0 hover:bg-[var(--c-surface-2)]/40">
                    <td className="px-4 py-4 font-mono text-sm text-[var(--c-text)]">{report.master_admin_id.slice(0, 8)}...</td>
                    <td className="px-4 py-4 text-xs uppercase tracking-[0.12em] text-[var(--c-text-faint)]">{report.account_currency ?? "-"}</td>
                    <td className="px-4 py-4 text-sm text-[var(--c-text)]">{report.player_count ?? 0}</td>
                    <td className="px-4 py-4 font-mono text-sm text-[var(--c-text)]">{formatCurrency(report.player_volume, report.account_currency ?? "USD")}</td>
                    <td className="px-4 py-4 font-mono text-sm text-[var(--c-text)]">{formatCurrency(report.player_payouts, report.account_currency ?? "USD")}</td>
                    <td className="px-4 py-4 font-mono text-sm text-[var(--c-success)]">{formatCurrency(report.house_edge, report.account_currency ?? "USD")}</td>
                    <td className="px-4 py-4 font-mono text-sm text-[var(--c-accent)]">{formatCurrency(report.commission_earned, report.account_currency ?? "USD")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
