"use client";

import { Card } from "@/components/ui/Card";
import { PlatformStats } from "@/lib/api";

function formatMixed(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${numeric.toFixed(2)} mixed` : String(value ?? "-");
}

export function PlatformSnapshotGrid({ stats }: { stats: PlatformStats }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <Card variant="surface-2" className="p-5">
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Total Volume (Mixed)</p>
        <p className="mt-3 font-mono text-3xl text-[var(--c-text)]">{formatMixed(stats.total_volume)}</p>
      </Card>
      <Card variant="surface-2" className="p-5">
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Total Payouts (Mixed)</p>
        <p className="mt-3 font-mono text-3xl text-[var(--c-text)]">{formatMixed(stats.total_payouts)}</p>
      </Card>
      <Card variant="surface-2" className="p-5">
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Net Revenue (Mixed)</p>
        <p className="mt-3 font-mono text-3xl text-[var(--c-success)]">{formatMixed(stats.net_revenue)}</p>
      </Card>
      <Card variant="surface-2" className="p-5">
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Active Matches</p>
        <p className="mt-3 font-mono text-3xl text-[var(--c-info)]">{stats.active_matches ?? 0}</p>
      </Card>
      <Card variant="surface-2" className="p-5">
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Pending Withdrawals (Mixed)</p>
        <p className="mt-3 font-mono text-3xl text-[var(--c-warning)]">{formatMixed(stats.pending_withdrawals)}</p>
      </Card>
      <Card variant="surface-2" className="p-5">
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Tracked Roles</p>
        <p className="mt-3 font-mono text-3xl text-[var(--c-text)]">{Object.keys(stats.total_users ?? {}).length}</p>
      </Card>
    </div>
  );
}
