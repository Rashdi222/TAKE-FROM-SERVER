"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AdminActionDeck } from "@/components/admin/AdminActionDeck";
import { SportControlShell } from "@/components/admin/SportControlShell";
import { TabGuidancePanel } from "@/components/admin/TabGuidancePanel";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { CompetitionFeedForm } from "@/components/providers/CompetitionFeedForm";
import { CompetitionFeedTable } from "@/components/providers/CompetitionFeedTable";
import { CricketMatchOpsCard } from "@/components/cricket/CricketMatchOpsCard";
import { CricketCompetitionDiscoveryPanel } from "@/components/cricket/CricketCompetitionDiscoveryPanel";
import { CricketFeedAutomationPanel } from "@/components/cricket/CricketFeedAutomationPanel";
import { CricketIncidentsPanel } from "@/components/cricket/CricketIncidentsPanel";
import { CricketLiveMarketControlPanel } from "@/components/cricket/CricketLiveMarketControlPanel";
import { CricketSimulationPanel } from "@/components/cricket/CricketSimulationPanel";
import { CricketAiObservabilityPanel } from "@/components/cricket/CricketAiObservabilityPanel";
import {
  useCricketAiObservability,
  useCompetitionFeeds,
  useCricketCompetitionDiscovery,
  useCricketAutomationRuns,
  useCreateCompetitionFeed,
  useDeleteCompetitionFeed,
  useEmergencyResumeMatch,
  useEmergencySuspendAllCricket,
  useEmergencySuspendMatch,
  useEnableCompetitionFeed,
  useForceCricketReprice,
  useImportCompetitionFeed,
  useManualOverridePublish,
  useRefreshCricketCompetitionDiscovery,
  useRefreshCompetitionFeedLive,
  useRefreshCompetitionFeedUpcoming,
  useResumeCricketMarket,
  useSuperAdminProviders,
  useSuspendCricketMarket,
  useUpdateCompetitionFeed,
} from "@/hooks/useSuperAdmin";
import { useAdminMatches } from "@/hooks/useMatches";
import { useSportMarketConfigs } from "@/hooks/useOdds";
import { formatDateTime } from "@/lib/format";
import type { CompetitionFeed, CricketCompetitionDiscoveryItem, Match, Provider } from "@/lib/api";

const topTabs = [
  { id: "feeds", label: "Feeds & Setup" },
  { id: "command", label: "Live Command Center" },
  { id: "incidents", label: "Incidents & Audit" },
] as const;

const boardTabs = [
  { id: "upcoming", label: "Upcoming" },
  { id: "live", label: "Live" },
  { id: "observability", label: "AI Observability" },
  { id: "simulation", label: "Simulation" },
  { id: "drafts", label: "Draft Odds" },
  { id: "published", label: "Published Odds" },
  { id: "closed", label: "Closed" },
  { id: "settled", label: "Settled" },
  { id: "cancelled", label: "Cancelled" },
] as const;

const topTabGuidance: Record<(typeof topTabs)[number]["id"], { title: string; summary: string; bullets: string[] }> = {
  feeds: {
    title: "Feeds and Setup",
    summary:
      "This tab is the cricket onboarding and automation layer. Use it for feed profiles, discovery, batch polling readiness, and competition-level operating rules.",
    bullets: [
      "Create, import, and configure cricket feeds here before expecting live boards to behave correctly.",
      "Use this tab to verify SportMonks discovery and feed automation rules, not match-level emergency control.",
      "If a competition is missing from cricket operations, this is the first place to fix it.",
    ],
  },
  command: {
    title: "Live Command Center",
    summary:
      "This is the active cricket trading and protection surface. It combines emergency controls, board filtering, per-market actions, and the live/simulation workflow.",
    bullets: [
      "Use this tab during live matches when you need fast operational control, not feed setup work.",
      "Emergency suspension, market suspend/resume, and manual override publishing all belong here.",
      "The board sub-tabs below split the match lifecycle so operators can work without mixing live and archive states.",
    ],
  },
  incidents: {
    title: "Incidents and Audit",
    summary:
      "This tab is for exception handling only. Use it when provider disconnects, manual review flags, or suspended states need focused recovery work.",
    bullets: [
      "Use this tab after an alert, not as the default live trading view.",
      "It isolates matches with operational problems so they do not hide inside the normal live board.",
      "Force reprice and recovery actions from here after understanding the incident reason.",
    ],
  },
};

const boardTabGuidance: Record<(typeof boardTabs)[number]["id"], { title: string; summary: string; bullets: string[] }> = {
  upcoming: {
    title: "Upcoming Board",
    summary:
      "This board shows pre-live cricket inventory that is close enough to matter operationally but not yet in the true live book.",
    bullets: [
      "Use this board to monitor match runway before the first ball.",
      "It is for readiness and expected transitions, not live market intervention.",
      "If a match should already be live, move back to the Live board and verify its state there.",
    ],
  },
  live: {
    title: "Live Board",
    summary:
      "This is the core in-play board for cricket. It keeps live matches, market controls, and next-three-hours runway together because cricket operations need both views side by side.",
    bullets: [
      "Use this board for current in-play matches and per-market control panels.",
      "This is the highest-priority sub-tab during active cricket sessions.",
      "If users see bad live behavior, start here before moving into incidents or matchmaker.",
    ],
  },
  simulation: {
    title: "Simulation",
    summary:
      "This board is for controlled scenario work. Use it when you need to test cricket behavior without confusing it with the live production flow.",
    bullets: [
      "Use simulation to inspect behavior safely without treating it as a real live board.",
      "This tab should remain operationally separate from actual in-play controls.",
      "If you are making live trading decisions, return to the Live board first.",
    ],
  },
  observability: {
    title: "AI Observability",
    summary:
      "This board is the cricket model health view. It tracks latency, retries, suspension causes, outlier jumps, and repricing rate per match.",
    bullets: [
      "Use this board during incidents before changing market controls.",
      "Retry storms and outlier jumps should be handled here first, then in incidents tab if needed.",
      "This board is for diagnosis and confidence, not direct publish/suspend actions.",
    ],
  },
  drafts: {
    title: "Draft Odds",
    summary:
      "This board isolates cricket draft output before public publication. It helps operators review pricing without mixing it with already public lines.",
    bullets: [
      "Use this board when reviewing generated prices before they are trusted for public output.",
      "Draft state is for review and correction, not for interpreting current public user experience.",
      "If a board is public already, use Published Odds instead.",
    ],
  },
  published: {
    title: "Published Odds",
    summary:
      "This board shows the cricket prices already live to users. Use it to validate current public output and compare it with draft or live operational states.",
    bullets: [
      "This is the correct place to inspect what users should currently see.",
      "If the public board looks wrong, compare here against Draft Odds and source recovery surfaces.",
      "Published boards should remain stable outside of real live repricing changes.",
    ],
  },
  closed: {
    title: "Closed Matches",
    summary:
      "This board captures cricket matches that are no longer open for trading but are not yet fully settled in the archive lifecycle.",
    bullets: [
      "Use this state for post-live control checks before settlement is finalized.",
      "It helps separate operational closure from final settlement.",
      "This board should not carry active in-play intervention work.",
    ],
  },
  settled: {
    title: "Settled Matches",
    summary:
      "This board is the settled cricket archive. It exists for confirmation and audit, not active management.",
    bullets: [
      "Use this board to confirm final lifecycle completion.",
      "If a match still needs operator attention, it should not be here.",
      "This is mainly useful for review and confidence, not live control.",
    ],
  },
  cancelled: {
    title: "Cancelled Matches",
    summary:
      "This board isolates cancelled cricket events so they stay separate from normal closure and settlement flows.",
    bullets: [
      "Use this board when checking that cancellations were classified correctly.",
      "It helps keep cancellations from being confused with normal match endings.",
      "If a live match vanished incorrectly, confirm it was not sent here by mistake.",
    ],
  },
};

const competitionIdeas = [
  { label: "Franchise T20", value: "IPL, PSL, BBL, CPL, SA20, The Hundred" },
  { label: "International", value: "ICC events, bilateral series, Asia Cup" },
  { label: "Domestic", value: "County, Ranji, regional and seasonal tournaments" },
] as const;

export default function AdminCricketPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const requestedBoardTab = searchParams.get("board");
  const initialTab = topTabs.some((item) => item.id === requestedTab) ? (requestedTab as (typeof topTabs)[number]["id"]) : "feeds";
  const initialBoardTab = boardTabs.some((item) => item.id === requestedBoardTab) ? (requestedBoardTab as (typeof boardTabs)[number]["id"]) : "live";
  const [tab, setTab] = useState<(typeof topTabs)[number]["id"]>(initialTab);
  const [boardTab, setBoardTab] = useState<(typeof boardTabs)[number]["id"]>(initialBoardTab);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [observabilityMatchId, setObservabilityMatchId] = useState("");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [emergencyNote, setEmergencyNote] = useState("");
  const [override, setOverride] = useState({
    matchId: "",
    marketKey: "match_winner",
    betType: "match_winner",
    selectionKey: "team1",
    label: "",
    oddsValue: "",
    adminNote: "",
  });
  const { showToast } = useToast();

  const { data: providersData } = useSuperAdminProviders();
  const { data: discoveryData, isLoading: discoveryLoading } = useCricketCompetitionDiscovery();
  const { data: feedsData, isLoading: feedsLoading } = useCompetitionFeeds({
    include_metrics: true,
    sport: "cricket",
  });
  const { data: matchesData, isLoading: matchesLoading } = useAdminMatches(
    { sport: "cricket" },
    {
      refetchInterval: 15_000,
      refetchOnWindowFocus: true,
      staleTime: 5_000,
    },
  );
  const { data: marketConfigs = [] } = useSportMarketConfigs({
    sport: "cricket",
    enabled_only: "true",
  });

  const createFeed = useCreateCompetitionFeed();
  const deleteFeed = useDeleteCompetitionFeed();
  const updateFeed = useUpdateCompetitionFeed();
  const enableFeed = useEnableCompetitionFeed();
  const importFeed = useImportCompetitionFeed();
  const emergencySuspendMatch = useEmergencySuspendMatch();
  const emergencyResumeMatch = useEmergencyResumeMatch();
  const emergencySuspendAll = useEmergencySuspendAllCricket();
  const suspendMarket = useSuspendCricketMarket();
  const resumeMarket = useResumeCricketMarket();
  const forceReprice = useForceCricketReprice();
  const manualOverridePublish = useManualOverridePublish();
  const refreshDiscovery = useRefreshCricketCompetitionDiscovery();
  const refreshUpcoming = useRefreshCompetitionFeedUpcoming();
  const refreshLive = useRefreshCompetitionFeedLive();

  const providers = useMemo(
    () => (((providersData as { data?: Provider[] } | undefined)?.data ?? []) as Provider[]).filter(
      (provider) => provider.name === "sportmonks" || provider.name === "cricketdata" || provider.name === "entitysport",
    ),
    [providersData],
  );

  const defaultCricketProviderId = useMemo(
    () => providers.find((provider) => provider.name === "sportmonks")?.id ?? providers[0]?.id ?? "",
    [providers],
  );

  const feeds = useMemo(
    () => (((feedsData as { data?: CompetitionFeed[] } | undefined)?.data ?? []) as CompetitionFeed[]),
    [feedsData],
  );

  const discoveredCompetitions = useMemo(
    () =>
      (((discoveryData as { data?: CricketCompetitionDiscoveryItem[] } | undefined)?.data ??
        []) as CricketCompetitionDiscoveryItem[]).filter((item) => item.provider === "sportmonks"),
    [discoveryData],
  );

  const allMatches = useMemo(
    () => (((matchesData as { data?: Match[] } | undefined)?.data ?? []) as Match[]).filter(
      (match) => match.sport === "cricket",
    ),
    [matchesData],
  );

  const { data: automationRunsData } = useCricketAutomationRuns(
    allMatches.map((match) => String(match.id)),
  );
  const {
    data: aiObservabilityData,
    isLoading: observabilityLoading,
    error: observabilityError,
    refetch: refetchObservability,
  } = useCricketAiObservability(observabilityMatchId || undefined, {
    enabled: tab === "command" && boardTab === "observability",
    refetchInterval: 10_000,
  });

  const automationRunsByMatch = useMemo(
    () =>
      (((automationRunsData as { data?: Record<string, unknown> } | undefined)?.data ??
        {}) as Record<string, { prematch?: import("@/lib/api/types/providers").CricketAutomationRun; inplay?: import("@/lib/api/types/providers").CricketAutomationRun }>),
    [automationRunsData],
  );

  const liveMatches = useMemo(
    () => allMatches.filter((match) => match.status === "live"),
    [allMatches],
  );

  const simulationMatches = useMemo(
    () => allMatches.filter((match) => match.status === "upcoming" || match.status === "live"),
    [allMatches],
  );

  const boardCounts = useMemo(
    () => ({
      upcoming: allMatches.filter((match) => match.status === "upcoming").length,
      live: allMatches.filter((match) => match.status === "live").length,
      simulation: simulationMatches.length,
      observability: Number((aiObservabilityData as { data?: { match_count?: number } } | undefined)?.data?.match_count ?? 0),
      closed: allMatches.filter((match) => match.status === "closed").length,
      settled: allMatches.filter((match) => match.status === "settled").length,
      cancelled: allMatches.filter((match) => match.status === "cancelled").length,
      drafts: allMatches.length,
      published: allMatches.length,
    }),
    [aiObservabilityData, allMatches, simulationMatches.length],
  );

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (requestedTab && topTabs.some((item) => item.id === requestedTab) && requestedTab !== tab) {
      setTab(requestedTab as (typeof topTabs)[number]["id"]);
    }

    if (requestedBoardTab && boardTabs.some((item) => item.id === requestedBoardTab) && requestedBoardTab !== boardTab) {
      setBoardTab(requestedBoardTab as (typeof boardTabs)[number]["id"]);
    }
  }, [boardTab, requestedBoardTab, requestedTab, tab]);

  const startingSoonMatches = useMemo(() => {
    const windowEnd = nowMs + 3 * 60 * 60 * 1000;

    return allMatches
      .filter((match) => {
        if (match.status === "live" || match.status === "closed" || match.status === "settled" || match.status === "cancelled") {
          return false;
        }

        if (!match.start_time) return false;
        const startAt = new Date(match.start_time).getTime();
        if (!Number.isFinite(startAt)) return false;

        return startAt >= nowMs && startAt <= windowEnd;
      })
      .sort((a, b) => {
        const aTime = a.start_time ? new Date(a.start_time).getTime() : Number.POSITIVE_INFINITY;
        const bTime = b.start_time ? new Date(b.start_time).getTime() : Number.POSITIVE_INFINITY;
        return aTime - bTime;
      });
  }, [allMatches, nowMs]);

  const overrideMatches = useMemo(
    () =>
      allMatches.filter(
        (match) =>
          match.status === "live" ||
          (match.status === "upcoming" && Boolean(match.in_play_enabled || match.suspended_at)),
      ),
    [allMatches],
  );

  const incidentMatches = useMemo(
    () =>
      allMatches.filter((match) => {
        const reason = match.suspension_reason || "";
        const manualReview =
          ((match.market_state as Record<string, unknown> | undefined)?.manual_admin_review as boolean | undefined) === true;

        return reason === "provider_disconnect" || reason === "manual_admin_review" || manualReview;
      }),
    [allMatches],
  );

  const filteredMatches = useMemo(() => {
    if (boardTab === "drafts" || boardTab === "published") {
      return allMatches;
    }
    if (boardTab === "observability") {
      return [];
    }

    return allMatches.filter((match) => match.status === boardTab);
  }, [allMatches, boardTab]);

  const groupedMatches = useMemo(() => {
    return filteredMatches.reduce<Record<string, Match[]>>((acc, match) => {
      const key =
        (match.competition?.name as string | undefined) ||
        (match.season_name as string | undefined) ||
        ((match.raw_data as { _competition_feed?: { name?: string } } | undefined)?._competition_feed?.name) ||
        "Other Cricket Matches";

      acc[key] = acc[key] ?? [];
      acc[key].push(match);
      return acc;
    }, {});
  }, [filteredMatches]);

  const handleWithBusy = async (id: string, action: () => Promise<unknown>) => {
    setBusyId(id);
    try {
      await action();
    } finally {
      setBusyId(null);
    }
  };

  const syncTabs = (
    nextTab: (typeof topTabs)[number]["id"],
    nextBoardTab: (typeof boardTabs)[number]["id"] = boardTab,
  ) => {
    setTab(nextTab);
    setBoardTab(nextBoardTab);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", nextTab);
    params.set("board", nextBoardTab);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const handleCreateAndImportDiscoveredCompetition = async (
    competition: CricketCompetitionDiscoveryItem,
  ) => {
    const created = (await createFeed.mutateAsync({
      name: `${competition.display_name ?? competition.name} ${competition.season_name ?? competition.season_id} via SportMonks`,
      sport: "cricket",
      provider_id: defaultCricketProviderId,
      competition_key: competition.competition_key,
      league_id: competition.league_id,
      season_id: competition.season_id,
      import_mode: "season",
      enabled: true,
      live_sync_enabled: true,
      import_provider_odds: false,
      generate_platform_odds: true,
      upcoming_window_days: 7,
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

  const handleEmergencySuspendAll = async () => {
    try {
      const result = (await emergencySuspendAll.mutateAsync({
        note: emergencyNote || "Emergency suspend from cricket desk",
      })) as { data?: { suspended_count?: number } };

      showToast(
        `Suspended ${result?.data?.suspended_count ?? liveMatches.length} live cricket match${(result?.data?.suspended_count ?? liveMatches.length) === 1 ? "" : "es"}.`,
        "success",
      );
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Emergency suspend failed", "error");
    }
  };

  const handleOverrideSubmit = async () => {
    if (!override.matchId || !override.oddsValue || !override.label) {
      showToast("Match, selection label, and odds value are required.", "error");
      return;
    }

    try {
      await manualOverridePublish.mutateAsync({
        id: override.matchId,
        body: {
          market_key: override.marketKey,
          bet_type: override.betType,
          selection_key: override.selectionKey,
          label: override.label,
          odds_value: override.oddsValue,
          admin_note: override.adminNote || "Manual override publish",
        },
      });

      showToast("Manual override published and market resumed.", "success");
      setOverride((current) => ({ ...current, oddsValue: "", adminNote: "" }));
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Manual override failed", "error");
    }
  };

  const handleIncidentResume = async (match: Match) => {
    await handleWithBusy(String(match.id), async () => {
      await emergencyResumeMatch.mutateAsync({
        id: String(match.id),
        body: { note: "Incident acknowledged and resumed" },
      });
      showToast("Match resumed.", "success");
    });
  };

  const handleIncidentReprice = async (match: Match) => {
    await handleWithBusy(String(match.id), async () => {
      await forceReprice.mutateAsync(String(match.id));
      showToast("Force reprice queued.", "success");
    });
  };

  const renderBoard = () => {
    if (matchesLoading) {
      return <p className="text-[var(--c-text-muted)]">Loading cricket matches...</p>;
    }

    if (filteredMatches.length === 0) {
      return (
        <Card variant="surface-1" className="p-6">
          <p className="text-sm text-[var(--c-text-muted)]">
            No cricket matches found in the <span className="font-medium text-[var(--c-text)]">{boardTab}</span> board yet.
          </p>
        </Card>
      );
    }

    return (
      <div className="space-y-6">
        {Object.entries(groupedMatches).map(([competitionName, matches]) => (
          <section key={competitionName} className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-[var(--c-text)]">{competitionName}</h2>
                <p className="text-xs uppercase tracking-[0.16em] text-[var(--c-text-faint)]">
                  {matches.length} match{matches.length === 1 ? "" : "es"}
                </p>
              </div>
              {boardTab === "live" ? (
                <div className="flex flex-wrap gap-2">
                  {matches.some((match) => Boolean(match.suspended_at)) ? (
                    <Button
                      variant="secondary"
                      onClick={() =>
                        void Promise.all(
                          matches
                            .filter((match) => Boolean(match.suspended_at))
                            .map((match) =>
                              emergencyResumeMatch.mutateAsync({
                                id: String(match.id),
                                body: { note: "Resume suspended competition section" },
                              }),
                            ),
                        )
                      }
                      disabled={emergencyResumeMatch.isPending}
                    >
                      Resume Suspended
                    </Button>
                  ) : null}
                  <Button
                    variant="destructive"
                    onClick={() =>
                      void Promise.all(
                        matches.map((match) =>
                          emergencySuspendMatch.mutateAsync({
                            id: String(match.id),
                            body: { note: "Competition section emergency suspend" },
                          }),
                        ),
                      )
                    }
                    disabled={emergencySuspendMatch.isPending}
                  >
                    Suspend Section
                  </Button>
                </div>
              ) : null}
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              {matches.map((match) => (
                <CricketMatchOpsCard
                  key={String(match.id)}
                  match={match}
                  marketConfigs={marketConfigs}
                  automationRuns={automationRunsByMatch[String(match.id)]}
                  showOddsPanel={boardTab === "live" || boardTab === "drafts" || boardTab === "published"}
                  oddsMode={
                    boardTab === "drafts"
                      ? "draft"
                      : boardTab === "published"
                        ? "published"
                        : boardTab === "live"
                          ? "live"
                          : "all"
                  }
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    );
  };

  return (
    <SportControlShell
      eyebrow="Cricket Ops"
      title="Cricket Operations Desk"
      description="Manage cricket feeds, batch live discovery, live command controls, manual overrides, and incident response from one workspace. The command board remains dense, but the top-level navigation is now clearer and shareable through URL tabs."
      actions={
        <>
          <Link href="/admin/feeds">
            <Button variant="secondary">All Feeds</Button>
          </Link>
          <Link href="/admin/matches?sport=cricket">
            <Button variant="secondary">All Cricket Matches</Button>
          </Link>
        </>
      }
      metrics={[
        {
          label: "Live Now",
          value: liveMatches.length,
          detail: "Matches already in-play and eligible for live controls.",
        },
        {
          label: "Starting Soon",
          value: startingSoonMatches.length,
          detail: "Upcoming cricket matches inside the next 3 hours.",
        },
        {
          label: "Auto Refresh",
          value: "15s",
          detail: "The cricket desk keeps live state moving without manual refresh.",
        },
      ]}
      tabs={topTabs.map((item) => ({ id: item.id, label: item.label }))}
      activeTab={tab}
      onTabChange={(tabId) => syncTabs(tabId as (typeof topTabs)[number]["id"])}
    >
      <div className="space-y-6">
      <AdminActionDeck
        title="Operator Shortcuts"
        description="Keep the cricket desk as the main control surface, but jump directly into supporting operational pages when you need deeper feed, polling, or mapping visibility."
        actions={[
          {
            href: "/admin/live-polling",
            label: "Live Polling Ops",
            description: "Inspect SportMonks batch discovery, targeted detail refresh, and cross-sport polling health.",
          },
          {
            href: "/admin/multi-source/matchmaker",
            label: "Matchmaker",
            description: "Review 1xBet mapping, scraper automation, source refresh advice, and fetch outcomes.",
          },
          {
            href: "/admin/feeds",
            label: "All Feeds",
            description: "Manage cross-sport feed inventory without leaving the admin workspace.",
          },
        ]}
      />
      <TabGuidancePanel
        {...(tab === "command" ? boardTabGuidance[boardTab] : topTabGuidance[tab])}
      />
      <div className="grid gap-4 md:grid-cols-3">
        <Card variant="surface-2" className="p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--c-text-faint)]">Live Now</p>
          <p className="mt-3 text-3xl font-semibold text-[var(--c-text)]">{liveMatches.length}</p>
          <p className="mt-2 text-sm text-[var(--c-text-muted)]">Matches already in-play and eligible for live controls.</p>
          <div className="mt-4">
            <Button
              variant="secondary"
              onClick={() => syncTabs("command", "live")}
            >
              Open Live Command Center
            </Button>
          </div>
        </Card>

        <Card variant="surface-2" className="p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--c-text-faint)]">Starting Soon</p>
          <p className="mt-3 text-3xl font-semibold text-[var(--c-text)]">{startingSoonMatches.length}</p>
          <p className="mt-2 text-sm text-[var(--c-text-muted)]">Upcoming cricket matches inside the next 3 hours.</p>
          <div className="mt-4">
            <Button
              variant="secondary"
              onClick={() => syncTabs("command", "live")}
            >
              View Runway
            </Button>
          </div>
        </Card>

        <Card variant="surface-2" className="p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--c-text-faint)]">Auto Refresh</p>
          <p className="mt-3 text-lg font-semibold text-[var(--c-text)]">Every 15 seconds</p>
          <p className="mt-2 text-sm text-[var(--c-text-muted)]">
            The cricket desk now polls match state so live transitions appear without manual refresh.
          </p>
        </Card>
      </div>

      {tab === "feeds" ? (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            {competitionIdeas.map((item) => (
              <Card key={item.label} variant="surface-2" className="p-5">
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--c-text-faint)]">{item.label}</p>
                <p className="mt-3 text-sm leading-6 text-[var(--c-text-muted)]">{item.value}</p>
              </Card>
            ))}
          </div>

          <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
            <CompetitionFeedForm
              providers={providers}
              initialData={{
                sport: "cricket",
                provider_id: defaultCricketProviderId,
                import_mode: "season",
                enabled: true,
                live_sync_enabled: true,
                import_provider_odds: false,
                generate_platform_odds: true,
              }}
              onSubmit={(body) => createFeed.mutateAsync({ ...body, sport: "cricket" }).then(() => undefined)}
            />

            {discoveryLoading ? (
              <Card variant="surface-2" className="p-6">
                <p className="text-sm text-[var(--c-text-muted)]">Loading SportMonks cricket catalog...</p>
              </Card>
            ) : (
              <CricketCompetitionDiscoveryPanel
                competitions={discoveredCompetitions}
                existingFeeds={feeds}
                refreshing={refreshDiscovery.isPending}
                onRefresh={() => refreshDiscovery.mutateAsync().then(() => undefined)}
                onCreateAndImport={handleCreateAndImportDiscoveredCompetition}
              />
            )}
          </div>

          <CricketFeedAutomationPanel
            feeds={feeds}
            busyId={busyId}
            onSave={(id, body) =>
              handleWithBusy(id, () => updateFeed.mutateAsync({ id, body })).then(() => undefined)
            }
          />

          {feedsLoading ? (
            <p className="text-[var(--c-text-muted)]">Loading cricket feeds...</p>
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
      ) : null}

      {tab === "command" ? (
        <div className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <Card variant="surface-2" className="border-[rgba(255,60,60,0.28)] p-5">
              <p className="text-xs uppercase tracking-[0.24em] text-[var(--c-danger)]">Emergency Control</p>
              <h2 className="mt-2 text-xl font-semibold text-[var(--c-text)]">Kill Switch</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--c-text-muted)]">
                Suspend every live cricket market immediately if the feed drops, pricing becomes unsafe, or the operator desk needs a hard freeze.
              </p>
              <div className="mt-4 grid gap-3">
                <Input
                  label="Operator Note"
                  value={emergencyNote}
                  onChange={(event) => setEmergencyNote(event.target.value)}
                  placeholder="Reason for emergency suspension"
                />
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--r-md)] border border-[rgba(255,60,60,0.22)] bg-[rgba(255,60,60,0.08)] px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-[var(--c-text)]">Live cricket matches at risk</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.16em] text-[var(--c-text-faint)]">
                      {liveMatches.length} live match{liveMatches.length === 1 ? "" : "es"}
                    </p>
                  </div>
                  <Button
                    variant="destructive"
                    onClick={() => void handleEmergencySuspendAll()}
                    disabled={liveMatches.length === 0 || emergencySuspendAll.isPending}
                  >
                    {emergencySuspendAll.isPending ? "Suspending..." : "Emergency Suspend All"}
                  </Button>
                </div>
              </div>
            </Card>

            <Card variant="surface-2" className="p-5">
              <p className="text-xs uppercase tracking-[0.24em] text-[var(--c-accent)]">Manual Override</p>
              <h2 className="mt-2 text-xl font-semibold text-[var(--c-text)]">Publish A Safe Fallback Rate</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--c-text-muted)]">
                Use this when the AI engine is down or an incident requires a manual line before reopening the market.
              </p>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium tracking-[0.01em] text-[var(--c-text)]">Match</label>
                  <select
                    value={override.matchId}
                    onChange={(event) => {
                      const nextId = event.target.value;
                      const selectedMatch = overrideMatches.find((match) => String(match.id) === nextId);

                      setOverride((current) => ({
                        ...current,
                        matchId: nextId,
                        label: current.label || selectedMatch?.team1 || current.label,
                      }));
                    }}
                    className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-2.5 text-[var(--c-text)] focus:border-[var(--c-accent)] focus:outline-none"
                  >
                    <option value="">Select live/suspended match</option>
                    {overrideMatches.map((match) => (
                      <option key={String(match.id)} value={String(match.id)}>
                        {match.team1 || "Team 1"} vs {match.team2 || "Team 2"} · {match.status}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium tracking-[0.01em] text-[var(--c-text)]">Market</label>
                  <select
                    value={override.marketKey}
                    onChange={(event) =>
                      setOverride((current) => ({
                        ...current,
                        marketKey: event.target.value,
                        betType: event.target.value,
                      }))
                    }
                    className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-2.5 text-[var(--c-text)] focus:border-[var(--c-accent)] focus:outline-none"
                  >
                    <option value="match_winner">Match Winner</option>
                    <option value="over_under">Runs Line</option>
                    <option value="in_play">In-Play</option>
                  </select>
                </div>

                <Input
                  label="Selection Key"
                  value={override.selectionKey}
                  onChange={(event) => setOverride((current) => ({ ...current, selectionKey: event.target.value }))}
                  placeholder="team1 / team2 / over / under"
                />
                <Input
                  label="Selection Label"
                  value={override.label}
                  onChange={(event) => setOverride((current) => ({ ...current, label: event.target.value }))}
                  placeholder="e.g. Lahore Qalandars"
                />
                <Input
                  label="Decimal Odds"
                  type="number"
                  step="0.01"
                  min="1.01"
                  value={override.oddsValue}
                  onChange={(event) => setOverride((current) => ({ ...current, oddsValue: event.target.value }))}
                  placeholder="1.84"
                />
                <div className="flex flex-col gap-2 md:col-span-2">
                  <label className="text-sm font-medium tracking-[0.01em] text-[var(--c-text)]">Admin Note</label>
                  <textarea
                    value={override.adminNote}
                    onChange={(event) => setOverride((current) => ({ ...current, adminNote: event.target.value }))}
                    rows={3}
                    placeholder="Why this manual price is safe to publish"
                    className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-3 text-[var(--c-text)] focus:border-[var(--c-accent)] focus:outline-none"
                  />
                </div>
              </div>

              <div className="mt-4 flex justify-end">
                <Button onClick={() => void handleOverrideSubmit()} disabled={manualOverridePublish.isPending}>
                  {manualOverridePublish.isPending ? "Publishing..." : "Publish Manual Override"}
                </Button>
              </div>
            </Card>
          </div>

          <Card variant="surface-2" className="p-4">
            <div className="flex flex-wrap gap-2">
              {boardTabs.map((item) => {
                const count = boardCounts[item.id];

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => syncTabs("command", item.id)}
                    className={`rounded-[var(--r-pill)] border px-3 py-2 text-sm ${
                      boardTab === item.id
                        ? "border-[var(--c-accent)] bg-[var(--c-accent-soft)] text-[var(--c-text)]"
                        : "border-[var(--c-border)] text-[var(--c-text-muted)]"
                    }`}
                  >
                    {item.label} <span className="ml-2 text-[var(--c-text-faint)]">{count}</span>
                  </button>
                );
              })}
            </div>
          </Card>

          {boardTab === "live" ? (
            <Card variant="surface-2" className="overflow-hidden p-0">
              <div className="border-b border-[var(--c-border)] bg-[linear-gradient(135deg,rgba(255,184,77,0.14),rgba(255,120,60,0.04))] px-5 py-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.22em] text-[var(--c-warning)]">Starting Soon</p>
                    <h2 className="mt-1 text-lg font-semibold text-[var(--c-text)]">Next 3 Hours Runway</h2>
                    <p className="mt-1 text-sm text-[var(--c-text-muted)]">
                      Upcoming matches close to start time, separated from the true live board.
                    </p>
                  </div>
                  <div className="text-xs uppercase tracking-[0.16em] text-[var(--c-text-faint)]">
                    {startingSoonMatches.length} match{startingSoonMatches.length === 1 ? "" : "es"}
                  </div>
                </div>
              </div>

              {startingSoonMatches.length > 0 ? (
                <div className="grid gap-4 p-5 xl:grid-cols-2">
                  {startingSoonMatches.map((match) => (
                    <div
                      key={`soon-${String(match.id)}`}
                      className="rounded-[var(--r-card)] border border-[rgba(255,184,77,0.22)] bg-[color:color-mix(in_srgb,var(--c-surface-1)_88%,transparent)] p-4"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-[var(--c-text)]">
                            {(match.team1 || "Team 1")} vs {(match.team2 || "Team 2")}
                          </p>
                          <p className="mt-1 text-xs uppercase tracking-[0.16em] text-[var(--c-text-faint)]">
                            {((match.competition?.name as string | undefined) ||
                              (match.season_name as string | undefined) ||
                              ((match.raw_data as { _competition_feed?: { name?: string } } | undefined)?._competition_feed?.name ??
                                "Cricket"))}
                          </p>
                          <p className="mt-3 text-sm text-[var(--c-text-muted)]">
                            Starts {formatDateTime(match.start_time ?? undefined)}
                          </p>
                        </div>
                        <div className="rounded-[var(--r-pill)] border border-[rgba(255,184,77,0.26)] bg-[rgba(255,184,77,0.12)] px-3 py-2 text-right">
                          <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--c-text-faint)]">Countdown</p>
                          <p className="mt-1 text-sm font-semibold text-[var(--c-text)]">
                            {formatCountdown(match.start_time, nowMs)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-5 text-sm text-[var(--c-text-muted)]">
                  No upcoming cricket matches in the next 3 hours.
                </div>
              )}
            </Card>
          ) : null}

          {boardTab === "live" && liveMatches.length > 0 ? (
            <div className="grid gap-4 xl:grid-cols-2">
              {liveMatches.map((match) => (
                <CricketLiveMarketControlPanel
                  key={`market-control-${String(match.id)}`}
                  match={match}
                  busyKey={busyId}
                  onSuspend={(currentMatch, marketKey) =>
                    handleWithBusy(`${currentMatch.id}:${marketKey}`, () =>
                      suspendMarket.mutateAsync({
                        id: String(currentMatch.id),
                        marketKey,
                        body: { reason: "manual_admin_review", note: "Market suspended from live command center" },
                      }),
                    )
                  }
                  onResume={(currentMatch, marketKey) =>
                    handleWithBusy(`${currentMatch.id}:${marketKey}`, () =>
                      resumeMarket.mutateAsync({
                        id: String(currentMatch.id),
                        marketKey,
                        body: { note: "Market resumed from live command center" },
                      }),
                    )
                  }
                />
              ))}
            </div>
          ) : null}

          {boardTab === "simulation" ? (
            <CricketSimulationPanel matches={simulationMatches} />
          ) : null}

          {boardTab === "observability" ? (
            <CricketAiObservabilityPanel
              snapshot={((aiObservabilityData as { data?: unknown } | undefined)?.data as Record<string, unknown> | undefined) ?? null}
              loading={observabilityLoading}
              error={observabilityError instanceof Error ? observabilityError.message : null}
              selectedMatchId={observabilityMatchId}
              onSelectMatchId={setObservabilityMatchId}
              onRefresh={() => {
                void refetchObservability();
              }}
              matches={liveMatches}
            />
          ) : null}

          {boardTab !== "simulation" && boardTab !== "observability" ? renderBoard() : null}
        </div>
      ) : null}

      {tab === "incidents" ? (
        <CricketIncidentsPanel
          incidents={incidentMatches}
          busyId={busyId}
          onResume={handleIncidentResume}
          onForceReprice={handleIncidentReprice}
        />
      ) : null}
      </div>
    </SportControlShell>
  );
}

function formatCountdown(startTime: string | null | undefined, nowMs: number) {
  if (!startTime) return "-";

  const startAt = new Date(startTime).getTime();
  if (!Number.isFinite(startAt)) return "-";

  const diff = startAt - nowMs;
  if (diff <= 0) return "Starting";

  const totalSeconds = Math.floor(diff / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  return `${minutes}m ${seconds}s`;
}
