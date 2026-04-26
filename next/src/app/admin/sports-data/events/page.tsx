"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { SportsEvent } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useSportsDataEvents } from "@/hooks/useSuperAdmin";

export default function SportsDataEventsPage() {
  const [provider, setProvider] = useState("");
  const [sport, setSport] = useState("");
  const [status, setStatus] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({ limit: "50" });
  const { data, isLoading } = useSportsDataEvents(filters);

  const rows: SportsEvent[] = ((data as { data?: SportsEvent[] } | undefined)?.data ?? []) as SportsEvent[];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.24em] text-[var(--c-accent)]">Sports Data</p>
        <h1 className="mt-2 text-3xl font-semibold text-[var(--c-text)]">Normalized Events</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--c-text-muted)]">
          Observe the normalized event feed after provider ingestion. Filters map directly to backend event queries, so the table reflects actual stored sports-data rows.
        </p>
      </div>

      <Card variant="surface-2" className="p-6">
        <div className="grid gap-4 md:grid-cols-4">
          <select value={provider} onChange={(e) => setProvider(e.target.value)} className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-2 text-[var(--c-text)]">
            <option value="">All providers</option>
            <option value="goalserve">goalserve</option>
            <option value="api_tennis">api_tennis</option>
            <option value="betsapi">betsapi</option>
          </select>
          <select value={sport} onChange={(e) => setSport(e.target.value)} className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-2 text-[var(--c-text)]">
            <option value="">All sports</option>
            <option value="tennis">tennis</option>
            <option value="horse_racing">horse_racing</option>
            <option value="greyhound">greyhound</option>
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-2 text-[var(--c-text)]">
            <option value="">All statuses</option>
            <option value="scheduled">scheduled</option>
            <option value="live">live</option>
            <option value="finished">finished</option>
            <option value="cancelled">cancelled</option>
          </select>
          <Button variant="primary" onClick={() => setFilters({ provider, sport, status, limit: "50" })}>Apply Filters</Button>
        </div>
      </Card>

      {isLoading ? (
        <p className="text-[var(--c-text-muted)]">Loading sports events...</p>
      ) : (
        <Card variant="surface-1" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px]">
              <thead>
                <tr className="border-b border-[var(--c-border)] bg-[var(--c-surface-2)]/50">
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Provider</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Event ID</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Sport</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Competition</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Status</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Start</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-[var(--c-border)] last:border-b-0 hover:bg-[var(--c-surface-2)]/40">
                    <td className="px-4 py-4 text-sm text-[var(--c-text)]">{row.provider}</td>
                    <td className="px-4 py-4 font-mono text-sm text-[var(--c-text-muted)]">{row.provider_event_id}</td>
                    <td className="px-4 py-4 text-sm text-[var(--c-text)]">{row.sport}</td>
                    <td className="px-4 py-4 text-sm text-[var(--c-text)]">{row.competition_name ?? "-"}</td>
                    <td className="px-4 py-4 text-sm text-[var(--c-text)]">{row.status}</td>
                    <td className="px-4 py-4 text-sm text-[var(--c-text-muted)]">{formatDateTime(row.start_time_utc)}</td>
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
