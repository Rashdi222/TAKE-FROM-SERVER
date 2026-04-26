"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AdminActionDeck } from "@/components/admin/AdminActionDeck";
import { SportControlShell } from "@/components/admin/SportControlShell";
import { TabGuidancePanel } from "@/components/admin/TabGuidancePanel";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CompetitionFeedForm } from "@/components/providers/CompetitionFeedForm";
import { CompetitionFeedTable } from "@/components/providers/CompetitionFeedTable";
import { FootballFeedAutomationPanel } from "@/components/football/FootballFeedAutomationPanel";
import { FootballCompetitionDiscoveryPanel } from "@/components/football/FootballCompetitionDiscoveryPanel";
import { FootballMatchOpsCard } from "@/components/football/FootballMatchOpsCard";
import { FootballPricingStrategyPanel } from "@/components/football/FootballPricingStrategyPanel";
import { FootballMatchWorkspacePanel } from "@/components/football/FootballMatchWorkspacePanel";
import {
  useCompetitionFeeds,
  useCreateCompetitionFeed,
  useDeleteCompetitionFeed,
  useFootballAutomationRuns,
  useFootballCompetitionDiscovery,
  useEnableCompetitionFeed,
  useImportCompetitionFeed,
  useOpenRouterSettings,
  useRefreshCompetitionFeedLive,
  useRefreshCompetitionFeedUpcoming,
  useRefreshFootballCompetitionDiscovery,
  useSuperAdminProviders,
  useUpdateCompetitionFeed,
} from "@/hooks/useSuperAdmin";
import { useAdminMatches } from "@/hooks/useMatches";
import { useSportMarketConfigs } from "@/hooks/useOdds";
import { isApiError } from "@/lib/api";
import type { CompetitionFeed, FootballCompetitionDiscoveryItem, Match, Provider } from "@/lib/api";

const tabs = [
  { id: "competitions", label: "Competitions" },
  { id: "upcoming", label: "Upcoming" },
  { id: "live", label: "Live" },
  { id: "drafts", label: "Draft Odds" },
  { id: "published", label: "Published Odds" },
  { id: "closed", label: "Closed" },
  { id: "settled", label: "Settled" },
  { id: "cancelled", label: "Cancelled" },
] as const;

const tabGuidance: Record<(typeof tabs)[number]["id"], { title: string; summary: string; bullets: string[] }> = {
  competitions: {
    title: "Competitions",
    summary:
      "This is the football setup tab. Use it to onboard competitions, inspect discovery coverage, and control how provider and platform pricing should operate for each feed.",
    bullets: [
      "Create or import competitions here before expecting matches to appear in the operational tabs.",
      "Use this tab to verify provider coverage, pricing mode, and feed-level automation settings.",
      "If a league is missing from live operations, fix it here first rather than inside the match workspace.",
    ],
  },
  upcoming: {
    title: "Upcoming Matches",
    summary:
      "This tab is for pre-live operational readiness. It surfaces scheduled football matches before they move into live trading or settlement states.",
    bullets: [
      "Use this tab to inspect the upcoming match pipeline and open the workspace before kickoff.",
      "This is the right place to verify expected inventory, not emergency live behavior.",
      "If a match is near kickoff but missing, start from Competitions and feed import status.",
    ],
  },
  live: {
    title: "Live Matches",
    summary:
      "This tab is the active live trading board for football. It prioritizes live competitions and opens the workspace for detailed market review.",
    bullets: [
      "Use the workspace panel here for live provider-reference review, generation, rewrite, and publish decisions.",
      "Risk summary cards at the top tell you where provider disconnect or manual review is blocking clean live operation.",
      "This is the main operational tab during active football trading windows.",
    ],
  },
  drafts: {
    title: "Draft Odds",
    summary:
      "This tab isolates draft football prices before they are promoted publicly. Use it when the board exists but is not yet in its public state.",
    bullets: [
      "Use this tab to inspect draft-only market output without the noise of already published boards.",
      "If operators are rewriting or staging a board, keep that work here before public publication.",
      "This is a controlled review surface, not a provider discovery surface.",
    ],
  },
  published: {
    title: "Published Odds",
    summary:
      "This tab focuses on what is already public. It is best for verifying the final operator-facing football output rather than preparing it.",
    bullets: [
      "Use this tab to confirm the public board is aligned with the latest intended pricing state.",
      "If users report bad odds, compare this tab against Draft Odds and the match workspace.",
      "Published state should be stable; large differences here usually point to workflow or provider issues.",
    ],
  },
  closed: {
    title: "Closed Matches",
    summary:
      "This tab shows football matches that are no longer actively tradable but are not yet fully settled in the final archive sense.",
    bullets: [
      "Use this tab for post-live operational review when a match is done but still part of the active admin trail.",
      "It helps verify that closures happened cleanly before settlement is final.",
      "This is not a live trading tab and should stay quieter than the live board.",
    ],
  },
  settled: {
    title: "Settled Matches",
    summary:
      "This tab is the finished football archive for settled events. It is for confirmation and review, not active control.",
    bullets: [
      "Use this tab to confirm the end-to-end lifecycle reached settlement cleanly.",
      "If something should still be tradable, it should not be in this tab.",
      "This is mainly for audit confidence and post-event operations.",
    ],
  },
  cancelled: {
    title: "Cancelled Matches",
    summary:
      "This tab isolates cancelled football events so they do not pollute the live or settlement workflow.",
    bullets: [
      "Use this tab when checking how cancelled fixtures were classified and removed from active control.",
      "It helps operators separate cancellations from normal closures and settlements.",
      "If a live board disappears incorrectly, check whether the match was moved here by mistake.",
    ],
  },
};

const competitionIdeas = [
  { label: "Top Leagues", value: "Premier League, La Liga, Serie A, Bundesliga, Ligue 1" },
  { label: "Europe", value: "Champions League, Europa League, Conference League" },
  { label: "International", value: "World Cup, Euro, Copa America, qualifiers and friendlies" },
] as const;

const featuredLeaguePriority = [
  "premier league",
  "champions league",
  "la liga",
  "serie a",
  "bundesliga",
  "ligue 1",
  "europa league",
  "conference league",
] as const;

export default function AdminFootballPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const initialTab = tabs.some((tab) => tab.id === requestedTab) ? (requestedTab as (typeof tabs)[number]["id"]) : "competitions";
  const [tab, setTab] = useState<(typeof tabs)[number]["id"]>(initialTab);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const { data: providersData } = useSuperAdminProviders();
  const { data: feedsData, isLoading: feedsLoading } = useCompetitionFeeds({
    include_metrics: true,
    sport: "football",
  });
  const { data: matchesData, isLoading: matchesLoading } = useAdminMatches({ sport: "football" });
  const { data: marketConfigs = [] } = useSportMarketConfigs({
    sport: "football",
    enabled_only: "true",
  });
  const { data: openRouterSettingsData } = useOpenRouterSettings();

  const createFeed = useCreateCompetitionFeed();
  const deleteFeed = useDeleteCompetitionFeed();
  const enableFeed = useEnableCompetitionFeed();
  const updateFeed = useUpdateCompetitionFeed();
  const importFeed = useImportCompetitionFeed();
  const refreshUpcoming = useRefreshCompetitionFeedUpcoming();
  const refreshLive = useRefreshCompetitionFeedLive();
  const refreshDiscovery = useRefreshFootballCompetitionDiscovery({ provider: "api_sports" });

  const providers = useMemo(
    () => (((providersData as { data?: Provider[] } | undefined)?.data ?? []) as Provider[]).filter(
      (provider) => provider.name === "api_sports" || provider.name === "allsports",
    ),
    [providersData],
  );

  const defaultFootballProviderId = useMemo(
    () => providers.find((provider) => provider.name === "api_sports")?.id ?? providers[0]?.id ?? "",
    [providers],
  );
  const footballDiscoveryEnabled = defaultFootballProviderId !== "";

  const {
    data: discoveryData,
    isLoading: discoveryLoading,
    error: discoveryError,
  } = useFootballCompetitionDiscovery(
    { provider: "api_sports" },
    { enabled: footballDiscoveryEnabled },
  );

  const feeds = useMemo(
    () => (((feedsData as { data?: CompetitionFeed[] } | undefined)?.data ?? []) as CompetitionFeed[]),
    [feedsData],
  );

  const openRouterSettings = useMemo(
    () =>
      ((openRouterSettingsData as {
        data?: { openrouter_active_model?: string | null; openrouter_api_key_configured?: boolean };
      } | undefined)?.data ?? {}) as {
        openrouter_active_model?: string | null;
        openrouter_api_key_configured?: boolean;
      },
    [openRouterSettingsData],
  );

  const discoveredCompetitions = useMemo(
    () => (((discoveryData as { data?: FootballCompetitionDiscoveryItem[] } | undefined)?.data ?? []) as FootballCompetitionDiscoveryItem[]).filter((item) => item.provider === "api_sports"),
    [discoveryData],
  );

  const discoveryErrorMessage = useMemo(() => {
    if (!footballDiscoveryEnabled) {
      return "Enable the `api_sports` provider first. Football catalog discovery is disabled until that provider is configured.";
    }

    if (!discoveryError) return "";
    if (isApiError(discoveryError)) return discoveryError.message || "Unable to load the football catalog right now.";
    return "Unable to load the football catalog right now.";
  }, [discoveryError, footballDiscoveryEnabled]);

  const allMatches = useMemo(
    () => (((matchesData as { data?: Match[] } | undefined)?.data ?? []) as Match[]).filter(
      (match) => match.sport === "football",
    ),
    [matchesData],
  );

  const filteredMatches = useMemo(() => {
    if (tab === "competitions") return [];
    if (tab === "drafts" || tab === "published") {
      return allMatches;
    }

    return allMatches.filter((match) => match.status === tab);
  }, [allMatches, tab]);

  const rankCompetition = useCallback((name: string) => {
    const normalized = name.toLowerCase();
    const index = featuredLeaguePriority.findIndex((item) => normalized.includes(item));
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  }, []);

  const liveRank = useCallback((match: Match) => {
    const elapsed =
      Number(
        (match.raw_data as { fixture?: { status?: { elapsed?: number | string } } } | undefined)?.fixture?.status?.elapsed ??
          0,
      ) || 0;

    const importance = rankCompetition(
      (match.competition?.name as string | undefined) ||
        (match.season_name as string | undefined) ||
        ((match.raw_data as { _competition_feed?: { name?: string } } | undefined)?._competition_feed?.name) ||
        "",
    );

    return { elapsed, importance };
  }, [rankCompetition]);

  const groupedMatches = useMemo(() => {
    const groups = filteredMatches.reduce<Record<string, Match[]>>((acc, match) => {
      const key =
        (match.competition?.name as string | undefined) ||
        (match.season_name as string | undefined) ||
        ((match.raw_data as { _competition_feed?: { name?: string } } | undefined)?._competition_feed?.name) ||
        "Other Football Matches";

      acc[key] = acc[key] ?? [];
      acc[key].push(match);
      return acc;
    }, {});

    return Object.entries(groups)
      .map(([competitionName, matches]) => [
        competitionName,
        [...matches].sort((a, b) => {
          if (tab === "live") {
            const aRank = liveRank(a);
            const bRank = liveRank(b);

            return (
              aRank.importance - bRank.importance ||
              bRank.elapsed - aRank.elapsed ||
              ((a.start_time ? new Date(a.start_time).getTime() : Number.MAX_SAFE_INTEGER) -
                (b.start_time ? new Date(b.start_time).getTime() : Number.MAX_SAFE_INTEGER))
            );
          }

          const aTime = a.start_time ? new Date(a.start_time).getTime() : Number.MAX_SAFE_INTEGER;
          const bTime = b.start_time ? new Date(b.start_time).getTime() : Number.MAX_SAFE_INTEGER;
          return aTime - bTime;
        }),
      ] as const)
      .sort((a, b) => {
        if (tab === "live") {
          return rankCompetition(a[0]) - rankCompetition(b[0]) || a[0].localeCompare(b[0]);
        }

        const aTime = a[1][0]?.start_time ? new Date(a[1][0].start_time as string).getTime() : Number.MAX_SAFE_INTEGER;
        const bTime = b[1][0]?.start_time ? new Date(b[1][0].start_time as string).getTime() : Number.MAX_SAFE_INTEGER;
        return aTime - bTime || a[0].localeCompare(b[0]);
      });
  }, [filteredMatches, liveRank, rankCompetition, tab]);

  const selectedMatch = useMemo(
    () => (selectedMatchId ? allMatches.find((match) => String(match.id) === selectedMatchId) ?? null : null),
    [allMatches, selectedMatchId],
  );

  const automationMatchIds = useMemo(() => filteredMatches.map((match) => String(match.id)), [filteredMatches]);
  const { data: automationRunsData } = useFootballAutomationRuns(automationMatchIds);

  const automationRunsByMatch = useMemo(
    () =>
      ((automationRunsData as {
        data?: Record<string, { prematch?: { status?: string; inserted_at?: string; reason?: string }; inplay?: { status?: string; inserted_at?: string; reason?: string } }>;
      } | undefined)?.data ?? {}) as Record<
        string,
        { prematch?: { status?: string; inserted_at?: string; reason?: string }; inplay?: { status?: string; inserted_at?: string; reason?: string } }
      >,
    [automationRunsData],
  );

  const liveRiskSummary = useMemo(() => {
    const liveMatches = allMatches.filter((match) => match.status === "live");

    return liveMatches.reduce(
      (acc, match) => {
        acc.total += 1;
        if (match.suspended_at) acc.suspended += 1;
        if (match.suspension_reason === "provider_disconnect") acc.providerDisconnect += 1;
        if (match.suspension_reason === "provider_import_failure") acc.importFailure += 1;
        if (match.suspension_reason === "manual_admin_review") acc.manualReview += 1;
        return acc;
      },
      { total: 0, suspended: 0, providerDisconnect: 0, importFailure: 0, manualReview: 0 },
    );
  }, [allMatches]);

  useEffect(() => {
    if (tab === "competitions") {
      setSelectedMatchId(null);
      return;
    }

    if (!filteredMatches.length) {
      setSelectedMatchId(null);
      return;
    }

    if (selectedMatchId && filteredMatches.some((match) => String(match.id) === selectedMatchId)) {
      return;
    }

    const preferred =
      filteredMatches.find((match) => match.status === "live") ??
      filteredMatches[0];

    setSelectedMatchId(String(preferred.id));
  }, [filteredMatches, selectedMatchId, tab]);

  const boardCounts = useMemo(
    () => ({
      competitions: feeds.length,
      upcoming: allMatches.filter((match) => match.status === "upcoming").length,
      live: allMatches.filter((match) => match.status === "live").length,
      drafts: allMatches.length,
      published: allMatches.length,
      closed: allMatches.filter((match) => match.status === "closed").length,
      settled: allMatches.filter((match) => match.status === "settled").length,
      cancelled: allMatches.filter((match) => match.status === "cancelled").length,
    }),
    [allMatches, feeds.length],
  );

  const handleCreateAndImportDiscoveredCompetition = async (competition: FootballCompetitionDiscoveryItem) => {
    const created = (await createFeed.mutateAsync({
      name: competition.display_name ?? `${competition.name} ${competition.season_label ?? competition.season_id ?? ""}`.trim(),
      sport: "football",
      provider_id: defaultFootballProviderId,
      competition_key: competition.competition_key,
      league_id: competition.league_id,
      season_id: competition.season_id ?? "",
      import_mode: "season",
      enabled: true,
      live_sync_enabled: true,
      import_provider_odds: false,
      generate_platform_odds: true,
      upcoming_window_days: 14,
      live_start_offset_minutes: 30,
      live_poll_interval_seconds: 30,
      live_stop_offset_minutes: 15,
      config: {
        discovery_context: competition.raw_context ?? {},
      },
    })) as { data?: CompetitionFeed };

    const feedId = created?.data?.id;

    if (feedId) {
      await importFeed.mutateAsync(feedId);
    }
  };

  const handleWithBusy = async (id: string, action: () => Promise<unknown>) => {
    setBusyId(id);
    try {
      await action();
    } finally {
      setBusyId(null);
    }
  };

  const handlePricingModeSave = async (
    feed: CompetitionFeed,
    mode: "provider_only" | "ai_only" | "hybrid",
  ) => {
    await handleWithBusy(String(feed.id), () =>
      updateFeed.mutateAsync({
        id: String(feed.id),
        body: {
          import_provider_odds: mode === "provider_only" || mode === "hybrid",
          generate_platform_odds: mode === "ai_only" || mode === "hybrid",
          config: {
            ...(feed.config || {}),
            football_pricing_mode: mode,
            football_langgraph_enabled: mode !== "provider_only",
            football_reference_odds_enabled: mode !== "ai_only",
            football_ai_model: openRouterSettings.openrouter_active_model || null,
          },
        },
      }),
    );
  };

  const setQueryTab = (nextTab: (typeof tabs)[number]["id"]) => {
    setTab(nextTab);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", nextTab);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  useEffect(() => {
    if (requestedTab && tabs.some((item) => item.id === requestedTab) && requestedTab !== tab) {
      setTab(requestedTab as (typeof tabs)[number]["id"]);
    }
  }, [requestedTab, tab]);

  return (
    <SportControlShell
      eyebrow="Football Ops"
      title="Football Operations Desk"
      description="Manage football discovery, feeds, provider-reference odds, platform pricing, and live match control from one workspace. Every major state is now URL-tabbed so operators can share the exact view they are using."
      actions={
        <>
          <Link href="/admin/feeds">
            <Button variant="secondary">All Feeds</Button>
          </Link>
          <Link href="/admin/matches?sport=football">
            <Button variant="secondary">All Football Matches</Button>
          </Link>
        </>
      }
      metrics={[
        {
          label: "Competitions",
          value: feeds.length,
          detail: "Configured football competition feeds under operational control.",
        },
        {
          label: "Live Matches",
          value: liveRiskSummary.total,
          detail: "Current in-play football matches in the admin inventory.",
        },
        {
          label: "Suspended / Review",
          value: `${liveRiskSummary.suspended} / ${liveRiskSummary.manualReview + liveRiskSummary.importFailure}`,
          detail: "Live boards needing attention because of suspension, review, or provider issues.",
        },
      ]}
      tabs={tabs.map((item) => ({ id: item.id, label: item.label, count: boardCounts[item.id] }))}
      activeTab={tab}
      onTabChange={(tabId) => setQueryTab(tabId as (typeof tabs)[number]["id"])}
    >
      <div className="space-y-6">
        <AdminActionDeck
          title="Operator Shortcuts"
          description="Football stays managed from this page, but the linked surfaces remain useful for provider health, cross-sport feed review, and the new live polling summary."
          actions={[
            {
              href: "/admin/live-polling",
              label: "Live Polling Ops",
              description: "Inspect API-Football batch live scores and batch live odds from one operational page.",
            },
            {
              href: "/admin/feeds",
              label: "All Feeds",
              description: "Review cross-sport feed metrics and shared sync controls.",
            },
            {
              href: "/admin/providers",
              label: "Providers",
              description: "Check provider credentials, availability, and transport-level status.",
            },
          ]}
        />
        <TabGuidancePanel {...tabGuidance[tab]} />
        <div className="grid gap-4 md:grid-cols-3">
          {competitionIdeas.map((item) => (
            <Card key={item.label} variant="surface-2" className="p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--c-text-faint)]">{item.label}</p>
              <p className="mt-3 text-sm leading-6 text-[var(--c-text-muted)]">{item.value}</p>
            </Card>
          ))}
        </div>

        <Alert variant="info">
          This football desk uses the existing feed, match, and odds infrastructure with API-Football league discovery layered on top. Provider-reference odds are enabled where the provider actually returns them for that competition and match, while platform AI odds remain the core trading workflow.
        </Alert>

      {tab === "competitions" ? (
        <div className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
            <CompetitionFeedForm
              providers={providers}
              initialData={{
                sport: "football",
                provider_id: defaultFootballProviderId,
                import_mode: "season",
                enabled: true,
                live_sync_enabled: true,
                import_provider_odds: false,
                generate_platform_odds: true,
                upcoming_window_days: 14,
              }}
              onSubmit={(body) => createFeed.mutateAsync({ ...body, sport: "football" }).then(() => undefined)}
            />

            {discoveryLoading ? (
              <Card variant="surface-2" className="p-6">
                <p className="text-sm text-[var(--c-text-muted)]">Loading football league catalog...</p>
              </Card>
            ) : discoveryErrorMessage ? (
              <Card variant="surface-2" className="p-6">
                <Alert variant="error">{discoveryErrorMessage}</Alert>
              </Card>
            ) : (
              <FootballCompetitionDiscoveryPanel
                competitions={discoveredCompetitions}
                existingFeeds={feeds}
                refreshing={refreshDiscovery.isPending}
                onRefresh={() => refreshDiscovery.mutateAsync().then(() => undefined)}
                onCreateAndImport={handleCreateAndImportDiscoveredCompetition}
              />
            )}
          </div>

          <FootballFeedAutomationPanel
            feeds={feeds}
            busyId={busyId}
            onSave={(id, body) => handleWithBusy(id, () => updateFeed.mutateAsync({ id, body }))}
          />

          <FootballPricingStrategyPanel
            feeds={feeds}
            activeModel={openRouterSettings.openrouter_active_model}
            apiKeyConfigured={openRouterSettings.openrouter_api_key_configured}
            busyId={busyId}
            onSave={handlePricingModeSave}
          />

          {feedsLoading ? (
            <p className="text-[var(--c-text-muted)]">Loading football feeds...</p>
          ) : (
            <CompetitionFeedTable
              feeds={feeds}
              busyId={busyId}
              onToggleEnabled={(id, enabled) => void handleWithBusy(id, () => enableFeed.mutateAsync({ id, enabled }))}
              onImport={(id) => void handleWithBusy(id, () => importFeed.mutateAsync(id))}
              onRefreshUpcoming={(id) => void handleWithBusy(id, () => refreshUpcoming.mutateAsync(id))}
              onRefreshLive={(id) => void handleWithBusy(id, () => refreshLive.mutateAsync(id))}
              onDelete={(id) => void handleWithBusy(id, () => deleteFeed.mutateAsync(id))}
            />
          )}
        </div>
      ) : matchesLoading ? (
        <p className="text-[var(--c-text-muted)]">Loading football matches...</p>
      ) : filteredMatches.length === 0 ? (
        <Card variant="surface-1" className="p-6">
          <p className="text-sm text-[var(--c-text-muted)]">
            No football matches found in the <span className="font-medium text-[var(--c-text)]">{tab}</span> tab yet.
          </p>
        </Card>
      ) : (
        <div className="space-y-6">
          {tab === "live" ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <RiskSummaryCard label="Live Matches" value={liveRiskSummary.total} tone="neutral" />
              <RiskSummaryCard label="Suspended" value={liveRiskSummary.suspended} tone="warning" />
              <RiskSummaryCard label="Provider Disconnect" value={liveRiskSummary.providerDisconnect} tone="warning" />
              <RiskSummaryCard
                label="Manual Review"
                value={liveRiskSummary.manualReview + liveRiskSummary.importFailure}
                tone="danger"
              />
            </div>
          ) : null}

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_30rem]">
          <div className="space-y-6">
            {selectedMatch ? (
              <div className="xl:hidden">
                <FootballMatchWorkspacePanel
                  match={selectedMatch}
                  marketConfigs={marketConfigs}
                  automation={automationRunsByMatch[String(selectedMatch.id)]}
                  onClose={() => setSelectedMatchId(null)}
                />
              </div>
            ) : null}

            {groupedMatches.map(([competitionName, matches]) => (
              <section key={competitionName} className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-[var(--c-text)]">{competitionName}</h2>
                    <p className="text-xs uppercase tracking-[0.16em] text-[var(--c-text-faint)]">
                      {matches.length} match{matches.length === 1 ? "" : "es"}
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-1 2xl:grid-cols-2">
                  {matches.map((match) => (
                    <FootballMatchOpsCard
                      key={String(match.id)}
                      match={match}
                      marketConfigs={marketConfigs}
                      automation={automationRunsByMatch[String(match.id)]}
                      selected={String(match.id) === String(selectedMatch?.id ?? "")}
                      onOpenPanel={(currentMatch) => setSelectedMatchId(String(currentMatch.id))}
                      showOddsPanel={false}
                      oddsMode={
                        tab === "drafts"
                          ? "draft"
                          : tab === "published"
                            ? "published"
                            : tab === "live"
                              ? "live"
                              : "all"
                      }
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>

          <div className="hidden xl:block">
            {selectedMatch ? (
              <FootballMatchWorkspacePanel
                match={selectedMatch}
                marketConfigs={marketConfigs}
                automation={automationRunsByMatch[String(selectedMatch.id)]}
                onClose={() => setSelectedMatchId(null)}
              />
            ) : (
              <Card variant="surface-2" className="sticky top-4 p-6">
                <h2 className="text-lg font-semibold text-[var(--c-text)]">Match Workspace</h2>
                <p className="mt-3 text-sm leading-6 text-[var(--c-text-muted)]">
                  Select a football match from the board to open the side workspace. From there you can generate odds, run the AI orchestrator, rewrite drafts with your own note, and review live, draft, or published odds without leaving this page.
                </p>
              </Card>
            )}
          </div>
        </div>
        </div>
      )}
      </div>
    </SportControlShell>
  );
}

function RiskSummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "neutral" | "warning" | "danger";
}) {
  const toneClass =
    tone === "danger"
      ? "border-red-500/25 bg-red-500/10"
      : tone === "warning"
        ? "border-amber-500/25 bg-amber-500/10"
        : "border-[var(--c-border)] bg-[color:color-mix(in_srgb,var(--c-surface-1)_88%,transparent)]";

  return (
    <Card variant="surface-1" className={`p-4 ${toneClass}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--c-text-faint)]">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-[var(--c-text)]">{value}</p>
    </Card>
  );
}
