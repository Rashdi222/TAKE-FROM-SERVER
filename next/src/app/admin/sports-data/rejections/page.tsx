"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SportsDataRejection } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useReplaySportsDataRejections, useSportsDataBackfill, useSportsDataRejections } from "@/hooks/useSuperAdmin";

export default function SportsDataRejectionsPage() {
  const [provider, setProvider] = useState("");
  const [replayStatus, setReplayStatus] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({ limit: "100" });
  const [backfillPayload, setBackfillPayload] = useState("{}");
  const [error, setError] = useState<string | null>(null);
  const { data, isLoading } = useSportsDataRejections(filters);
  const replay = useReplaySportsDataRejections();
  const backfill = useSportsDataBackfill();

  const rows: SportsDataRejection[] = ((data as { data?: SportsDataRejection[] } | undefined)?.data ?? []) as SportsDataRejection[];

  const handleBackfill = async () => {
    setError(null);
    try {
      const parsed = JSON.parse(backfillPayload) as Record<string, unknown>;
      await backfill.mutateAsync(parsed);
    } catch {
      setError("Backfill payload must be valid JSON.");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.24em] text-[var(--c-accent)]">Sports Data</p>
        <h1 className="mt-2 text-3xl font-semibold text-[var(--c-text)]">Rejected Events</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--c-text-muted)]">
          Quarantined events that failed validation or ingestion. You can replay rejections in bulk or queue a targeted backfill job with a raw payload.
        </p>
      </div>

      {error ? <Alert variant="error">{error}</Alert> : null}

      <Card variant="surface-2" className="p-6">
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto_auto]">
          <input value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="provider" className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-2 text-[var(--c-text)]" />
          <input value={replayStatus} onChange={(e) => setReplayStatus(e.target.value)} placeholder="replay_status" className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-2 text-[var(--c-text)]" />
          <Button variant="secondary" onClick={() => setFilters({ provider, replay_status: replayStatus, limit: "100" })}>Apply Filters</Button>
          <Button variant="primary" onClick={() => replay.mutate({})} disabled={replay.isPending}>
            {replay.isPending ? "Replaying..." : "Replay rejections"}
          </Button>
        </div>
        <div className="mt-4 space-y-2">
          <label className="text-sm font-medium text-[var(--c-text)]">Backfill payload JSON</label>
          <textarea
            value={backfillPayload}
            onChange={(e) => setBackfillPayload(e.target.value)}
            rows={5}
            className="w-full rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-3 font-mono text-sm leading-6 text-[var(--c-text)] outline-none focus:border-[var(--c-accent)]"
          />
          <Button variant="secondary" onClick={handleBackfill} disabled={backfill.isPending}>
            {backfill.isPending ? "Queueing..." : "Queue backfill"}
          </Button>
        </div>
      </Card>

      {isLoading ? (
        <p className="text-[var(--c-text-muted)]">Loading rejections...</p>
      ) : (
        <div className="space-y-4">
          {rows.map((row) => (
            <Card key={row.id} variant="surface-2" className="p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">{row.provider}</p>
                  <h2 className="mt-2 text-xl font-semibold text-[var(--c-text)]">{row.reason}</h2>
                  <p className="mt-2 font-mono text-sm text-[var(--c-text-muted)]">{row.provider_event_id}</p>
                </div>
                <div className="text-sm text-[var(--c-text-muted)]">
                  <p>Replay status: {row.replay_status ?? "pending"}</p>
                  <p className="mt-1">Inserted: {formatDateTime(row.inserted_at)}</p>
                  <p className="mt-1">Replayed: {formatDateTime(row.replayed_at)}</p>
                </div>
              </div>
              <div className="mt-4 rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] p-4">
                <p className="mb-2 text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Diagnostics</p>
                <pre className="max-h-56 overflow-auto text-xs leading-6 text-[var(--c-text-muted)]">
                  {JSON.stringify(row.diagnostics ?? {}, null, 2)}
                </pre>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
