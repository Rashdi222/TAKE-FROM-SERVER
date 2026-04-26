"use client";

import { AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { formatDateTime } from "@/lib/format";
import type { PaymentApprovalSummary } from "@/lib/api";

export function PendingPaymentsWidget({ summary }: { summary: PaymentApprovalSummary | null | undefined }) {
  const data = summary ?? {
    pending_deposits: 0,
    pending_withdrawals: 0,
    stale_pending_count: 0,
    oldest_pending_at: null,
  };

  const hasAgingWarning = Number(data.stale_pending_count ?? 0) > 0;

  return (
    <Card variant="surface-2" className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-[var(--c-accent)]">Pending Payments</p>
          <h3 className="mt-2 text-xl font-semibold text-[var(--c-text)]">Approval Queue</h3>
          <p className="mt-2 text-sm leading-6 text-[var(--c-text-muted)]">
            Monitor pending manual deposits and withdrawals. Aging warnings flag requests older than 24 hours.
          </p>
        </div>
        {hasAgingWarning ? (
          <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(255,60,60,0.28)] bg-[rgba(255,60,60,0.12)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--c-danger)]">
            <AlertTriangle className="h-4 w-4" />
            Aging alert
          </div>
        ) : null}
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <MetricCard label="Pending Deposits" value={String(data.pending_deposits ?? 0)} />
        <MetricCard label="Pending Withdrawals" value={String(data.pending_withdrawals ?? 0)} />
        <MetricCard
          label="Older Than 24h"
          value={String(data.stale_pending_count ?? 0)}
          tone={hasAgingWarning ? "danger" : "default"}
        />
      </div>

      <div className="mt-4 text-xs uppercase tracking-[0.14em] text-[var(--c-text-faint)]">
        Oldest pending:
        <span className="ml-2 normal-case tracking-normal text-[var(--c-text-muted)]">
          {formatDateTime(data.oldest_pending_at)}
        </span>
      </div>
    </Card>
  );
}

function MetricCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "danger";
}) {
  return (
    <div className={`rounded-[var(--r-sm)] border p-4 ${tone === "danger" ? "border-[rgba(255,60,60,0.24)] bg-[rgba(255,60,60,0.08)]" : "border-[var(--c-border)] bg-[var(--c-surface-1)]"}`}>
      <p className="text-xs uppercase tracking-[0.16em] text-[var(--c-text-faint)]">{label}</p>
      <p className={`mt-3 font-mono text-2xl ${tone === "danger" ? "text-[var(--c-danger)]" : "text-[var(--c-text)]"}`}>{value}</p>
    </div>
  );
}
