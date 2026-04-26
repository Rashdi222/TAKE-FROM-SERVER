"use client";

import { Card } from "@/components/ui/Card";
import { formatDateTime } from "@/lib/format";
import type { Provider, ProviderSyncLog } from "@/lib/api";

type ProviderHealthPanelProps = {
  provider: Provider | null;
  syncLogs: ProviderSyncLog[];
};

function failureStreak(logs: ProviderSyncLog[]) {
  let streak = 0;

  for (const log of logs) {
    if (log.status === "failure") {
      streak += 1;
      continue;
    }

    break;
  }

  return streak;
}

export function ProviderHealthPanel({ provider, syncLogs }: ProviderHealthPanelProps) {
  if (!provider) {
    return (
      <Card variant="surface-2" className="p-6 text-sm text-[var(--c-text-muted)]">
        Select a provider to inspect health and recent failure history.
      </Card>
    );
  }

  const providerLogs = syncLogs.filter((log) => log.provider_id === provider.id);
  const latestSuccess = providerLogs.find((log) => log.status === "success") || null;
  const latestFailure = providerLogs.find((log) => log.status === "failure") || null;
  const consecutiveFailures = failureStreak(providerLogs);
  const circuitState =
    !provider.is_enabled
      ? "Disabled"
      : consecutiveFailures >= 3
          ? "Degraded"
          : "Healthy";

  return (
    <Card variant="surface-2" className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--c-text-faint)]">
            Provider Health
          </div>
          <div className="mt-2 text-xl font-semibold text-[var(--c-text)]">{provider.name}</div>
          <div className="mt-2 text-sm text-[var(--c-text-muted)]">
            Monitor last sync latency, failure streaks, and current provider stability from one panel.
          </div>
        </div>

        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            circuitState === "Healthy"
              ? "bg-emerald-500/12 text-emerald-300"
              : circuitState === "Degraded"
                ? "bg-amber-500/12 text-amber-300"
                : "bg-red-500/12 text-red-300"
          }`}
        >
          {circuitState}
        </span>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Last Latency" value={latestSuccess?.duration_ms ? `${latestSuccess.duration_ms} ms` : "-"} />
        <MetricCard label="Failure Streak" value={String(consecutiveFailures)} />
        <MetricCard label="Successful Syncs" value={String(providerLogs.filter((log) => log.status === "success").length)} />
        <MetricCard label="Failed Syncs" value={String(providerLogs.filter((log) => log.status === "failure").length)} />
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <LogCard
          title="Last Success"
          log={latestSuccess}
          emptyLabel="No successful sync recorded yet."
        />
        <LogCard
          title="Last Failure"
          log={latestFailure}
          emptyLabel="No failed sync recorded."
        />
      </div>
    </Card>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[rgba(255,255,255,0.025)] p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--c-text-faint)]">{label}</div>
      <div className="mt-2 text-lg font-semibold text-[var(--c-text)]">{value}</div>
    </div>
  );
}

function LogCard({
  title,
  log,
  emptyLabel,
}: {
  title: string;
  log: ProviderSyncLog | null;
  emptyLabel: string;
}) {
  return (
    <div className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[rgba(255,255,255,0.025)] p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--c-text-faint)]">{title}</div>
      {log ? (
        <div className="mt-3 space-y-2 text-sm">
          <div className="text-[var(--c-text)]">{formatDateTime(log.inserted_at)}</div>
          <div className="text-[var(--c-text-muted)]">Status: {log.status}</div>
          {log.error ? <div className="text-red-200">{log.error}</div> : null}
        </div>
      ) : (
        <div className="mt-3 text-sm text-[var(--c-text-muted)]">{emptyLabel}</div>
      )}
    </div>
  );
}
