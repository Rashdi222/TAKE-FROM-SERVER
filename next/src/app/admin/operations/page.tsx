"use client";

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useCompetitionFeeds, useSportsDataSyncLogs, useSuperAdminProviderHealth } from "@/hooks/useSuperAdmin";
import type { CompetitionFeed, ProviderHealthResponse, SportsDataSyncLog } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

export default function AdminOperationsPage() {
  const { data: healthData } = useSuperAdminProviderHealth();
  const { data: feedsData } = useCompetitionFeeds();
  const { data: syncData } = useSportsDataSyncLogs({ limit: "8" });

  const health = ((healthData as { data?: ProviderHealthResponse } | undefined)?.data ??
    {}) as ProviderHealthResponse;
  const feeds = ((feedsData as { data?: CompetitionFeed[] } | undefined)?.data ??
    []) as CompetitionFeed[];
  const syncLogs = ((syncData as { data?: SportsDataSyncLog[] } | undefined)?.data ??
    []) as SportsDataSyncLog[];

  const enabledFeeds = feeds.filter((feed) => feed.enabled).length;
  const liveFeeds = feeds.filter((feed) => feed.enabled && feed.live_sync_enabled).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--c-accent)]">Operations</p>
          <h1 className="mt-2 text-3xl font-semibold text-[var(--c-text)]">Admin Operations Hub</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--c-text-muted)]">
            One operational view for feeds, provider health, sync behavior, imported matches, and the odds desk.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card variant="surface-2" className="p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Active Provider</p>
          <h2 className="mt-3 text-2xl font-semibold text-[var(--c-text)]">
            {health.active_provider?.name ?? "None"}
          </h2>
          <p className="mt-2 text-sm text-[var(--c-text-muted)]">
            Last success {formatDateTime(health.last_successful_sync?.inserted_at)}
          </p>
        </Card>
        <Card variant="surface-2" className="p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Configured Feeds</p>
          <h2 className="mt-3 text-2xl font-semibold text-[var(--c-text)]">{feeds.length}</h2>
          <p className="mt-2 text-sm text-[var(--c-text-muted)]">{enabledFeeds} enabled</p>
        </Card>
        <Card variant="surface-2" className="p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Live Sync Feeds</p>
          <h2 className="mt-3 text-2xl font-semibold text-[var(--c-text)]">{liveFeeds}</h2>
          <p className="mt-2 text-sm text-[var(--c-text-muted)]">Feeds eligible for live polling windows</p>
        </Card>
        <Card variant="surface-2" className="p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Recent Sports Syncs</p>
          <h2 className="mt-3 text-2xl font-semibold text-[var(--c-text)]">{syncLogs.length}</h2>
          <p className="mt-2 text-sm text-[var(--c-text-muted)]">Latest ingestion logs in scope</p>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card variant="surface-2" className="p-6">
          <h2 className="text-lg font-semibold text-[var(--c-text)]">Operational Sequence</h2>
          <div className="mt-4 grid gap-3">
            <Link href="/admin/providers"><Button variant="secondary">1. Feed Sources</Button></Link>
            <Link href="/admin/feeds"><Button variant="secondary">2. Competition Import</Button></Link>
            <Link href="/admin/matches"><Button variant="secondary">3. Imported Matches</Button></Link>
            <Link href="/admin/settings/market-templates"><Button variant="secondary">4. Risk Templates</Button></Link>
            <Link href="/admin/providers/health"><Button variant="secondary">5. Provider Health</Button></Link>
          </div>
        </Card>

        <Card variant="surface-2" className="p-6">
          <h2 className="text-lg font-semibold text-[var(--c-text)]">Latest Sports Data Syncs</h2>
          <div className="mt-4 space-y-3">
            {syncLogs.length === 0 ? (
              <p className="text-sm text-[var(--c-text-muted)]">No sync logs yet.</p>
            ) : (
              syncLogs.map((row) => (
                <div
                  key={row.id}
                  className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-[var(--c-text)]">
                        {row.provider} · {row.source}
                      </div>
                      <div className="mt-1 text-xs text-[var(--c-text-muted)]">
                        {formatDateTime(row.inserted_at)}
                      </div>
                    </div>
                    <div className="text-sm text-[var(--c-text-muted)]">
                      {row.status} · fetched {row.fetched_count ?? 0} · upserted {row.upserted_count ?? 0}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
