"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { SportsDataSyncLog } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useSportsDataSyncLogs } from "@/hooks/useSuperAdmin";

export default function SportsDataSyncLogsPage() {
  const [provider, setProvider] = useState("");
  const [status, setStatus] = useState("");
  const [source, setSource] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({ limit: "100" });
  const { data, isLoading } = useSportsDataSyncLogs(filters);

  const rows: SportsDataSyncLog[] = ((data as { data?: SportsDataSyncLog[] } | undefined)?.data ?? []) as SportsDataSyncLog[];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.24em] text-[var(--c-accent)]">Sports Data</p>
        <h1 className="mt-2 text-3xl font-semibold text-[var(--c-text)]">Sync Logs</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--c-text-muted)]">
          Operational log stream for sports-data ingestion workers, including fetched counts, upserts, failures, and source worker identity.
        </p>
      </div>

      <Card variant="surface-2" className="p-6">
        <div className="grid gap-4 md:grid-cols-4">
          <input value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="provider" className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-2 text-[var(--c-text)]" />
          <input value={status} onChange={(e) => setStatus(e.target.value)} placeholder="status" className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-2 text-[var(--c-text)]" />
          <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="source" className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-2 text-[var(--c-text)]" />
          <Button variant="primary" onClick={() => setFilters({ provider, status, source, limit: "100" })}>Apply Filters</Button>
        </div>
      </Card>

      {isLoading ? (
        <p className="text-[var(--c-text-muted)]">Loading sync logs...</p>
      ) : (
        <Card variant="surface-1" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px]">
              <thead>
                <tr className="border-b border-[var(--c-border)] bg-[var(--c-surface-2)]/50">
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Provider</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Source</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Status</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Fetched</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Upserted</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Failed</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Logged</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-[var(--c-border)] last:border-b-0 hover:bg-[var(--c-surface-2)]/40">
                    <td className="px-4 py-4 text-sm text-[var(--c-text)]">{row.provider}</td>
                    <td className="px-4 py-4 font-mono text-sm text-[var(--c-text-muted)]">{row.source}</td>
                    <td className="px-4 py-4 text-sm text-[var(--c-text)]">{row.status}</td>
                    <td className="px-4 py-4 font-mono text-sm text-[var(--c-text)]">{row.fetched_count ?? 0}</td>
                    <td className="px-4 py-4 font-mono text-sm text-[var(--c-success)]">{row.upserted_count ?? 0}</td>
                    <td className="px-4 py-4 font-mono text-sm text-[var(--c-danger)]">{row.failed_count ?? 0}</td>
                    <td className="px-4 py-4 text-sm text-[var(--c-text-muted)]">{formatDateTime(row.inserted_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
