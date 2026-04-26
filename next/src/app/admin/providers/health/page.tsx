"use client";

import Link from "next/link";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ProviderHealthResponse, ProviderSyncLog } from "@/lib/api";
import { isApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useSuperAdminProviderHealth, useSuperAdminProviderSyncLogs, useSyncProviderNow } from "@/hooks/useSuperAdmin";

export default function ProviderHealthPage() {
  const { data, isLoading, error: healthError } = useSuperAdminProviderHealth();
  const { data: syncData, isLoading: logsLoading, error: logsError } = useSuperAdminProviderSyncLogs({ limit: 12 });
  const syncNow = useSyncProviderNow();

  const health = ((data as { data?: ProviderHealthResponse } | undefined)?.data ?? {}) as ProviderHealthResponse;
  const logs: ProviderSyncLog[] = ((syncData as { data?: ProviderSyncLog[] } | undefined)?.data ?? []) as ProviderSyncLog[];
  const pageError =
    (isApiError(healthError) ? healthError.message : null) ||
    (isApiError(logsError) ? logsError.message : null);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--c-accent)]">Providers</p>
          <h1 className="mt-2 text-3xl font-semibold text-[var(--c-text)]">Provider Health</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--c-text-muted)]">
            Operational health for the currently active provider and the latest sync outcomes. Use this as the first stop when live-match ingestion looks stale.
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="primary" onClick={() => syncNow.mutate({})} disabled={syncNow.isPending}>
            {syncNow.isPending ? "Syncing..." : "Trigger sync now"}
          </Button>
          <Link href="/admin/providers">
            <Button variant="secondary">Back to providers</Button>
          </Link>
        </div>
      </div>

      {pageError ? <Alert variant="error">{pageError}</Alert> : null}

      {isLoading ? (
        <p className="text-[var(--c-text-muted)]">Loading provider health...</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card variant="surface-2" className="p-6 lg:col-span-1">
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Active provider</p>
            <h2 className="mt-3 text-2xl font-semibold text-[var(--c-text)]">{health.active_provider?.name ?? "None active"}</h2>
            <p className="mt-2 text-sm text-[var(--c-text-muted)]">{health.active_provider?.base_url ?? "No active provider selected."}</p>
          </Card>
          <Card variant="surface-2" className="p-6">
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Last successful sync</p>
            <p className="mt-3 font-mono text-lg text-[var(--c-success)]">{formatDateTime(health.last_successful_sync?.inserted_at)}</p>
            <p className="mt-2 text-sm text-[var(--c-text-muted)]">Status: {health.last_successful_sync?.status ?? "-"}</p>
          </Card>
          <Card variant="surface-2" className="p-6">
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Last failure</p>
            <p className="mt-3 font-mono text-lg text-[var(--c-danger)]">{formatDateTime(health.last_failure?.inserted_at)}</p>
            <p className="mt-2 text-sm text-[var(--c-text-muted)]">{health.last_failure?.error ?? "No recent failure logged."}</p>
          </Card>
        </div>
      )}

      <Card variant="surface-1" className="overflow-hidden">
        <div className="border-b border-[var(--c-border)] px-6 py-4">
          <h2 className="text-xl font-semibold text-[var(--c-text)]">Recent provider sync logs</h2>
        </div>
        {logsLoading ? (
          <div className="p-6 text-[var(--c-text-muted)]">Loading sync logs...</div>
        ) : logs.length === 0 ? (
          <div className="p-6 text-[var(--c-text-muted)]">No sync logs recorded yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="border-b border-[var(--c-border)] bg-[var(--c-surface-2)]/50">
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Provider</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Sync type</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Status</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Duration</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Logged at</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-[var(--c-border)] last:border-b-0 hover:bg-[var(--c-surface-2)]/40">
                    <td className="px-4 py-4 font-mono text-sm text-[var(--c-text)]">{log.provider_id?.slice(0, 8) ?? "-"}...</td>
                    <td className="px-4 py-4 text-sm text-[var(--c-text)]">{log.sync_type ?? "-"}</td>
                    <td className="px-4 py-4 text-sm text-[var(--c-text)]">{log.status}</td>
                    <td className="px-4 py-4 font-mono text-sm text-[var(--c-text-muted)]">{log.duration_ms ?? "-"}</td>
                    <td className="px-4 py-4 text-sm text-[var(--c-text-muted)]">{formatDateTime(log.inserted_at)}</td>
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
