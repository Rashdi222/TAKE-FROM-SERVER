"use client";

import Link from "next/link";
import { useMemo } from "react";
import { SportControlShell } from "@/components/admin/SportControlShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useCompetitionFeeds } from "@/hooks/useSuperAdmin";
import type { CompetitionFeed, CompetitionFeedDetailRefreshMetrics, CompetitionFeedLiveIndexMetrics } from "@/lib/api";

type SportKey = "cricket" | "football" | "tennis";

const sportConfig: Record<SportKey, { title: string; description: string; href: string }> = {
  cricket: {
    title: "Cricket",
    description: "SportMonks batch live discovery, targeted detail refresh, and 1xBet-linked runtime recovery.",
    href: "/admin/cricket",
  },
  football: {
    title: "Football",
    description: "API-Football batch live scores and batch live odds with platform trading layered above them.",
    href: "/admin/football",
  },
  tennis: {
    title: "Tennis",
    description: "API-Tennis batch live score and live odds sync feeding the tennis command desk.",
    href: "/admin/tennis",
  },
};

export default function AdminLivePollingPage() {
  const { data: feedsData, isLoading } = useCompetitionFeeds({ include_metrics: true });

  const feeds = useMemo(
    () => ((feedsData as { data?: CompetitionFeed[] } | undefined)?.data ?? []) as CompetitionFeed[],
    [feedsData],
  );

  const grouped = useMemo(() => {
    const bySport: Record<SportKey, CompetitionFeed[]> = { cricket: [], football: [], tennis: [] };
    for (const feed of feeds) {
      if (feed.sport === "cricket" || feed.sport === "football" || feed.sport === "tennis") {
        bySport[feed.sport].push(feed);
      }
    }
    return bySport;
  }, [feeds]);

  const totals = useMemo(() => {
    return (Object.keys(grouped) as SportKey[]).reduce(
      (acc, sport) => {
        const sportFeeds = grouped[sport];
        acc.feeds += sportFeeds.length;
        for (const feed of sportFeeds) {
          acc.live += feed.metrics?.live_match_count ?? 0;
          acc.activeBatch +=
            feed.metrics?.live_index?.active_fixture_count ??
            feed.metrics?.live_odds_index?.active_fixture_count ??
            0;
        }
        return acc;
      },
      { feeds: 0, live: 0, activeBatch: 0 },
    );
  }, [grouped]);

  return (
    <SportControlShell
      eyebrow="Polling Ops"
      title="Live Polling Operations"
      description="One operator page for batch score discovery, batch live odds, and targeted follow-up refresh. This page does not replace the sport desks. It makes the polling layer easier to inspect and manage."
      actions={
        <>
          <Link href="/admin/feeds">
            <Button variant="secondary">All Feeds</Button>
          </Link>
          <Link href="/admin/multi-source/matchmaker">
            <Button variant="secondary">Matchmaker</Button>
          </Link>
        </>
      }
      metrics={[
        {
          label: "Tracked Feeds",
          value: totals.feeds,
          detail: "Competition feeds across cricket, football, and tennis included on this board.",
        },
        {
          label: "Live Inventory",
          value: totals.live,
          detail: "Imported live matches currently visible across sport control surfaces.",
        },
        {
          label: "Batch Fixtures",
          value: totals.activeBatch,
          detail: "Active fixtures currently being seen by batch polling indexes.",
        },
      ]}
    >
      <div className="space-y-6">
        <Card variant="surface-2" className="p-5">
          <div className="grid gap-4 xl:grid-cols-3">
            <StatusLegend
              title="Batch Score Discovery"
              description="One provider request gets the current live score inventory for many matches at once."
            />
            <StatusLegend
              title="Batch Live Odds"
              description="Provider odds are read from live batch caches instead of per-match fetches where that sport supports it."
            />
            <StatusLegend
              title="Targeted Follow-Up"
              description="Only selected matches get extra detail refresh when freshness, mapping, or risk rules require it."
            />
          </div>
        </Card>

        {isLoading ? (
          <Card variant="surface-2" className="p-6">
            <p className="text-sm text-[var(--c-text-muted)]">Loading live polling operations...</p>
          </Card>
        ) : (
          (Object.keys(grouped) as SportKey[]).map((sport) => (
            <SportPollingSection key={sport} sport={sport} feeds={grouped[sport]} />
          ))
        )}
      </div>
    </SportControlShell>
  );
}

function SportPollingSection({ sport, feeds }: { sport: SportKey; feeds: CompetitionFeed[] }) {
  const config = sportConfig[sport];
  const summary = useMemo(() => summarizeSport(feeds), [feeds]);

  return (
    <Card variant="surface-2" className="p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-3xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--c-text-faint)]">
            {config.title}
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-[var(--c-text)]">{config.title} Polling</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--c-text-muted)]">{config.description}</p>
        </div>
        <Link href={config.href}>
          <Button variant="secondary">Open {config.title} Desk</Button>
        </Link>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricTile label="Feeds" value={summary.feedCount} detail="Configured feeds on this sport." />
        <MetricTile label="Live Matches" value={summary.liveMatches} detail="Imported live match count." />
        <MetricTile label="Batch Fixtures" value={summary.batchFixtures} detail="Active fixtures seen by batch indexes." />
        <MetricTile
          label="State"
          value={summary.hasStale ? "Attention" : "Healthy"}
          detail={summary.hasStale ? "At least one polling layer is stale." : "Batch surfaces are currently fresh."}
        />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        {feeds.length === 0 ? (
          <Card variant="surface-1" className="p-5 xl:col-span-2">
            <p className="text-sm text-[var(--c-text-muted)]">
              No {config.title.toLowerCase()} feeds are configured yet.
            </p>
          </Card>
        ) : (
          feeds.map((feed) => <FeedPollingCard key={feed.id} feed={feed} sport={sport} />)
        )}
      </div>
    </Card>
  );
}

function FeedPollingCard({ feed, sport }: { feed: CompetitionFeed; sport: SportKey }) {
  const liveIndex = feed.metrics?.live_index ?? null;
  const liveOddsIndex = feed.metrics?.live_odds_index ?? null;
  const detailRefresh = feed.metrics?.detail_refresh ?? null;

  return (
    <Card variant="surface-1" className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-base font-semibold text-[var(--c-text)]">{feed.name}</div>
          <div className="mt-1 text-xs uppercase tracking-[0.16em] text-[var(--c-text-faint)]">
            {feed.provider?.name || "provider"} · {feed.competition_key}
          </div>
        </div>
        <StatePill stale={Boolean(liveIndex?.stale || liveOddsIndex?.stale)} />
      </div>

      <div className="mt-4 space-y-3 text-sm">
        <MetricRow label="Live Inventory" value={`${feed.metrics?.live_match_count ?? 0} live matches`} />
        {sport === "cricket" ? (
          <>
            <IndexBlock
              title="Batch Score Discovery"
              metrics={liveIndex}
              emptyText="No SportMonks live index metrics on this feed yet."
            />
            <DetailBlock metrics={detailRefresh} />
            <MetricRow
              label="Source Odds"
              value="1xBet remains targeted per mapped event, not one all-match batch request."
            />
          </>
        ) : null}

        {sport === "football" ? (
          <>
            <MetricRow
              label="Batch Live Scores"
              value={formatSyncTimestamp(feed.metrics?.last_live_sync?.inserted_at)}
            />
            <IndexBlock
              title="Batch Live Odds"
              metrics={liveOddsIndex}
              emptyText="No API-Football live odds cache metrics on this feed yet."
            />
          </>
        ) : null}

        {sport === "tennis" ? (
          <>
            <MetricRow
              label="Batch Live Scores"
              value={formatSyncTimestamp(feed.metrics?.last_live_sync?.inserted_at)}
            />
            <MetricRow
              label="Batch Live Odds"
              value={formatSyncTimestamp(feed.metrics?.last_provider_odds_fetch?.inserted_at)}
            />
          </>
        ) : null}
      </div>
    </Card>
  );
}

function IndexBlock({
  title,
  metrics,
  emptyText,
}: {
  title: string;
  metrics: CompetitionFeedLiveIndexMetrics | null;
  emptyText: string;
}) {
  if (!metrics) {
    return <MetricRow label={title} value={emptyText} />;
  }

  return (
    <div className="rounded-[var(--r-card)] border border-[var(--c-border)] bg-[color:color-mix(in_srgb,var(--c-surface-1)_90%,transparent)] p-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--c-text-faint)]">{title}</div>
      <div className="mt-2 space-y-1">
        <MetricRow label="Fixtures" value={String(metrics.active_fixture_count)} compact />
        <MetricRow label="State" value={metrics.stale ? "stale" : "fresh"} compact />
        <MetricRow label="Last success" value={formatSyncTimestamp(metrics.last_successful_refresh_at)} compact />
      </div>
    </div>
  );
}

function DetailBlock({ metrics }: { metrics: CompetitionFeedDetailRefreshMetrics | null }) {
  if (!metrics) {
    return <MetricRow label="Targeted Detail" value="No targeted detail scheduler metrics on this feed yet." />;
  }

  return (
    <div className="rounded-[var(--r-card)] border border-[var(--c-border)] bg-[color:color-mix(in_srgb,var(--c-surface-1)_90%,transparent)] p-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--c-text-faint)]">
        Targeted Detail Scheduler
      </div>
      <div className="mt-2 space-y-1">
        <MetricRow
          label="Tracked / Due / Selected"
          value={`${metrics.tracked_match_count} / ${metrics.due_count ?? 0} / ${metrics.selected_count ?? 0}`}
          compact
        />
        <MetricRow
          label="Hot / Warm"
          value={`${metrics.hot_target_count ?? 0} / ${metrics.warm_target_count ?? 0}`}
          compact
        />
        <MetricRow
          label="Throttled / Cooldown"
          value={`${metrics.throttled_count ?? 0} / ${metrics.cooldown_suppressed_count ?? 0}`}
          compact
        />
      </div>
    </div>
  );
}

function MetricTile({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return (
    <div className="rounded-[var(--r-card)] border border-[var(--c-border)] bg-[color:color-mix(in_srgb,var(--c-surface-1)_88%,transparent)] p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--c-text-faint)]">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-[var(--c-text)]">{value}</div>
      <div className="mt-2 text-sm leading-6 text-[var(--c-text-muted)]">{detail}</div>
    </div>
  );
}

function MetricRow({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: string;
  compact?: boolean;
}) {
  return (
    <div className={`flex ${compact ? "gap-2" : "items-start justify-between gap-4"}`}>
      <span className="text-[var(--c-text-faint)]">{label}</span>
      <span className="text-right text-[var(--c-text)]">{value}</span>
    </div>
  );
}

function StatePill({ stale }: { stale: boolean }) {
  return (
    <span
      className={`rounded-[var(--r-pill)] border px-2 py-1 text-xs ${
        stale
          ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
          : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
      }`}
    >
      {stale ? "Needs Attention" : "Healthy"}
    </span>
  );
}

function StatusLegend({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-[var(--r-card)] border border-[var(--c-border)] bg-[color:color-mix(in_srgb,var(--c-surface-1)_88%,transparent)] p-4">
      <div className="text-sm font-semibold text-[var(--c-text)]">{title}</div>
      <div className="mt-2 text-sm leading-6 text-[var(--c-text-muted)]">{description}</div>
    </div>
  );
}

function summarizeSport(feeds: CompetitionFeed[]) {
  return feeds.reduce(
    (acc, feed) => {
      acc.feedCount += 1;
      acc.liveMatches += feed.metrics?.live_match_count ?? 0;
      acc.batchFixtures +=
        feed.metrics?.live_index?.active_fixture_count ??
        feed.metrics?.live_odds_index?.active_fixture_count ??
        0;
      if (feed.metrics?.live_index?.stale || feed.metrics?.live_odds_index?.stale) {
        acc.hasStale = true;
      }
      return acc;
    },
    { feedCount: 0, liveMatches: 0, batchFixtures: 0, hasStale: false },
  );
}

function formatSyncTimestamp(value?: string | null) {
  if (!value) return "No successful refresh yet";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unknown";
  return date.toLocaleString();
}
