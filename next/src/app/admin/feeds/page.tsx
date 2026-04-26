"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CompetitionFeedForm } from "@/components/providers/CompetitionFeedForm";
import { CompetitionFeedTable } from "@/components/providers/CompetitionFeedTable";
import { useCreateCompetitionFeed, useEnableCompetitionFeed, useImportCompetitionFeed, useRefreshCompetitionFeedLive, useRefreshCompetitionFeedUpcoming, useSuperAdminProviders, useCompetitionFeeds } from "@/hooks/useSuperAdmin";
import type { CompetitionFeed, Provider } from "@/lib/api";

export default function AdminFeedsPage() {
  const [busyId, setBusyId] = useState<string | null>(null);
  const { data: providersData } = useSuperAdminProviders();
  const { data: feedsData, isLoading } = useCompetitionFeeds({ include_metrics: true });
  const createFeed = useCreateCompetitionFeed();
  const enableFeed = useEnableCompetitionFeed();
  const importFeed = useImportCompetitionFeed();
  const refreshUpcoming = useRefreshCompetitionFeedUpcoming();
  const refreshLive = useRefreshCompetitionFeedLive();

  const providers: Provider[] = useMemo(
    () => ((providersData as { data?: Provider[] } | undefined)?.data ?? []) as Provider[],
    [providersData],
  );
  const feeds: CompetitionFeed[] = useMemo(
    () => ((feedsData as { data?: CompetitionFeed[] } | undefined)?.data ?? []) as CompetitionFeed[],
    [feedsData],
  );
  const totals = useMemo(() => {
    return feeds.reduce(
      (acc, feed) => {
        const metrics = feed.metrics;
        acc.imported += metrics?.imported_fixture_count ?? 0;
        acc.upcoming += metrics?.upcoming_match_count ?? 0;
        acc.live += metrics?.live_match_count ?? 0;
        acc.providerOdds += metrics?.provider_odds_imported_count ?? 0;
        return acc;
      },
      { imported: 0, upcoming: 0, live: 0, providerOdds: 0 },
    );
  }, [feeds]);

  const handleWithBusy = async (id: string, action: () => Promise<unknown>) => {
    setBusyId(id);
    try {
      await action();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--c-accent)]">Feeds</p>
          <h1 className="mt-2 text-3xl font-semibold text-[var(--c-text)]">Competition Feed Control</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--c-text-muted)]">
            This is the business-level import layer. Configure feed profiles like IPL, PSL, or regional racing here, then import and refresh them without touching raw provider internals.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link href="/admin/providers">
            <Button variant="secondary">Provider Sources</Button>
          </Link>
          <Link href="/admin/providers/health">
            <Button variant="secondary">Provider Health</Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <CompetitionFeedForm
          providers={providers}
          onSubmit={(body) => createFeed.mutateAsync(body).then(() => undefined)}
        />

        <Card variant="surface-2" className="p-6">
          <h2 className="text-lg font-semibold text-[var(--c-text)]">Operating Sequence</h2>
          <div className="mt-4 space-y-3 text-sm text-[var(--c-text-muted)]">
            <p>1. Configure provider credentials in Provider Sources.</p>
            <p>2. Create one feed profile per competition or region.</p>
            <p>3. Import the feed once to cache fixtures into Sixerbat.</p>
            <p>4. Refresh upcoming or live windows when operations need immediate updates.</p>
            <p>5. Open Imported Matches and move into the Odds Desk for publishing.</p>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card variant="surface-2" className="p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Feeds</p>
          <p className="mt-3 text-3xl font-semibold text-[var(--c-text)]">{feeds.length}</p>
          <p className="mt-1 text-sm text-[var(--c-text-muted)]">Configured competition profiles</p>
        </Card>
        <Card variant="surface-2" className="p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Imported</p>
          <p className="mt-3 text-3xl font-semibold text-[var(--c-text)]">{totals.imported}</p>
          <p className="mt-1 text-sm text-[var(--c-text-muted)]">Cached fixtures across all feeds</p>
        </Card>
        <Card variant="surface-2" className="p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Upcoming / Live</p>
          <p className="mt-3 text-3xl font-semibold text-[var(--c-text)]">
            {totals.upcoming} / {totals.live}
          </p>
          <p className="mt-1 text-sm text-[var(--c-text-muted)]">Current operational inventory</p>
        </Card>
        <Card variant="surface-2" className="p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Provider Odds</p>
          <p className="mt-3 text-3xl font-semibold text-[var(--c-text)]">{totals.providerOdds}</p>
          <p className="mt-1 text-sm text-[var(--c-text-muted)]">Imported reference odds snapshots</p>
        </Card>
      </div>

      {isLoading ? (
        <p className="text-[var(--c-text-muted)]">Loading competition feeds...</p>
      ) : (
        <CompetitionFeedTable
          feeds={feeds}
          busyId={busyId}
          onToggleEnabled={(id, enabled) =>
            void handleWithBusy(id, () => enableFeed.mutateAsync({ id, enabled }))
          }
          onImport={(id) => void handleWithBusy(id, () => importFeed.mutateAsync(id))}
          onRefreshUpcoming={(id) =>
            void handleWithBusy(id, () => refreshUpcoming.mutateAsync(id))
          }
          onRefreshLive={(id) =>
            void handleWithBusy(id, () => refreshLive.mutateAsync(id))
          }
        />
      )}
    </div>
  );
}
