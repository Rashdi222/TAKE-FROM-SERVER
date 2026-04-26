"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AdminActionDeck } from "@/components/admin/AdminActionDeck";
import { SportControlShell } from "@/components/admin/SportControlShell";
import { TabGuidancePanel } from "@/components/admin/TabGuidancePanel";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TennisDeskTable } from "@/components/tennis/TennisDeskTable";
import { TennisFixtureTable } from "@/components/tennis/TennisFixtureTable";
import { TennisLiveDiscoveryTable } from "@/components/tennis/TennisLiveDiscoveryTable";
import { TennisLiveOpsCards } from "@/components/tennis/TennisLiveOpsCards";
import { TennisLiveTracker } from "@/components/tennis/TennisLiveTracker";
import {
  useInjectTennisSimulation,
  useStartTennisTracking,
  useStopTennisTracking,
  useTennisDeskMatches,
  useTennisFixtures,
  useTennisLiveDiscovery,
  useTennisLiveMatches,
  useUpdateTennisMargin,
  useUpdateTennisSimulation,
} from "@/hooks/useTennisAdmin";
import { useTennisSocket } from "@/hooks/useTennisSocket";
import {
  isApiError,
  type TennisDeskResponse,
  type TennisFixture,
  type TennisMatchState,
} from "@/lib/api";

type TabId = "upcoming" | "live_now" | "tracked" | "desk" | "live_cards";

const tabs: Array<{ id: TabId; label: string }> = [
  { id: "upcoming", label: "Upcoming Fixtures" },
  { id: "live_now", label: "Live Now" },
  { id: "tracked", label: "Managed Matches" },
  { id: "live_cards", label: "Live Ops Cards" },
  { id: "desk", label: "Live Margin Desk" },
];

const tabGuidance: Record<TabId, { title: string; summary: string; bullets: string[] }> = {
  upcoming: {
    title: "Upcoming Fixtures",
    summary:
      "Use this tab to decide which scheduled courts should enter the managed live workflow before the first serve. It is a preparation tab, not a pricing tab.",
    bullets: [
      "Track fixtures here when you want them promoted into the managed live pipeline before they go in-play.",
      "This tab is best for operational selection, not public odds review.",
      "Once a match becomes live, move to Managed Matches or Live Margin Desk instead of staying here.",
    ],
  },
  live_now: {
    title: "Provider Live Discovery",
    summary:
      "This tab shows what the provider says is live right now. It is your discovery surface for new live courts before they are promoted into managed control.",
    bullets: [
      "Use this to confirm API Tennis is surfacing live courts through the batch live feed.",
      "If a live match is missing here, the issue is usually provider-side or feed-side, not desk-side.",
      "Track a live court here when you want it to enter the managed tennis workflow.",
    ],
  },
  tracked: {
    title: "Managed Matches",
    summary:
      "This is the controlled live inventory. Courts shown here are already under Sixerbat management and should remain stable for operational decisions.",
    bullets: [
      "Use this tab to stop tracking or verify that a live court is still being managed correctly.",
      "Socket status here matters more than raw provider status because this is the managed runtime surface.",
      "If a match should be public but is not visible, compare this tab with Live Ops Cards and the Live Margin Desk.",
    ],
  },
  live_cards: {
    title: "Live Ops Cards",
    summary:
      "This tab gives a compact operational view of live tennis boards that are already being managed. It is intended for quick scanning, not deep control work.",
    bullets: [
      "Use this for fast monitoring of multiple live courts at once.",
      "If a card looks wrong, open the Live Margin Desk for the detailed publishing state.",
      "This tab is best for visual triage during a dense live window.",
    ],
  },
  desk: {
    title: "Live Margin Desk",
    summary:
      "This is the pricing and publishing tab. Use it when you need to change margin behavior, simulation state, or inspect public live output for managed courts.",
    bullets: [
      "Use this tab for actual trading and publishing decisions, not just discovery.",
      "Margin and simulation controls here affect the live tennis pricing desk behavior.",
      "If public cards look wrong, this is the first tab to inspect after confirming the match is tracked.",
    ],
  },
};

export default function AdminTennisCommandCenterPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const initialTab = tabs.some((tab) => tab.id === requestedTab) ? (requestedTab as TabId) : "upcoming";
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const [busyTrackEventKey, setBusyTrackEventKey] = useState<string | null>(null);
  const [busyStopEventKey, setBusyStopEventKey] = useState<string | null>(null);

  const fixturesQuery = useTennisFixtures();
  const liveDiscoveryQuery = useTennisLiveDiscovery();
  const liveQuery = useTennisLiveMatches();
  const deskQuery = useTennisDeskMatches();

  const startTracking = useStartTennisTracking();
  const stopTracking = useStopTennisTracking();
  const updateMargin = useUpdateTennisMargin();
  const updateSimulation = useUpdateTennisSimulation();
  const injectSimulation = useInjectTennisSimulation();

  const fixtures = useMemo(
    () => (((fixturesQuery.data as { data?: TennisFixture[] } | undefined)?.data ?? []) as TennisFixture[]),
    [fixturesQuery.data],
  );
  const liveDiscoveryBase = useMemo(
    () => (((liveDiscoveryQuery.data as { data?: TennisMatchState[] } | undefined)?.data ?? []) as TennisMatchState[]),
    [liveDiscoveryQuery.data],
  );
  const liveMatchesBase = useMemo(
    () => (((liveQuery.data as { data?: TennisMatchState[] } | undefined)?.data ?? []) as TennisMatchState[]),
    [liveQuery.data],
  );
  const deskData = useMemo(
    () =>
      (((deskQuery.data as { data?: TennisDeskResponse } | undefined)?.data ?? {
        matches: [],
        margin: "0.04",
        simulation: { enabled: false, scenario: null, scenarios: [] },
      }) as TennisDeskResponse),
    [deskQuery.data],
  );

  const trackedEventKeys = useMemo(
    () => liveMatchesBase.map((match) => match.event_key),
    [liveMatchesBase],
  );

  const upcomingFixtures = useMemo(() => {
    return fixtures.filter((fixture) => {
      const status = String(fixture.status ?? "").toLowerCase();
      if (status.includes("set") || status.includes("live") || status.includes("finished")) return false;
      return true;
    });
  }, [fixtures]);

  const { matches: liveDiscoveryMatches, status: liveDiscoverySocketStatus } = useTennisSocket(liveDiscoveryBase);
  const { matches: liveMatches, status: liveSocketStatus } = useTennisSocket(liveMatchesBase);
  const { matches: deskMatches, status: deskSocketStatus } = useTennisSocket(
    (deskData.matches as TennisMatchState[]) ?? [],
  );

  const publishedCount = useMemo(
    () => deskMatches.filter((match) => match.published).length,
    [deskMatches],
  );

  async function handleTrack(target: TennisFixture | TennisMatchState) {
    const eventKey = target.event_key;
    setBusyTrackEventKey(eventKey);
    try {
      await startTracking.mutateAsync({
        event_key: eventKey,
        tournament_name:
          "tournament_name" in target
            ? target.tournament_name
            : (target.fixture_snapshot?.tournament_name as string | undefined),
        player_1_name: target.player_1_name,
        player_2_name: target.player_2_name,
        start_time: "start_time" in target ? target.start_time : undefined,
      });
    } finally {
      setBusyTrackEventKey(null);
    }
  }

  async function handleStop(eventKey: string) {
    setBusyStopEventKey(eventKey);
    try {
      await stopTracking.mutateAsync({ event_key: eventKey });
    } finally {
      setBusyStopEventKey(null);
    }
  }

  const pageError =
    (isApiError(fixturesQuery.error) ? fixturesQuery.error.message : null) ||
    (isApiError(liveDiscoveryQuery.error) ? liveDiscoveryQuery.error.message : null) ||
    (isApiError(liveQuery.error) ? liveQuery.error.message : null) ||
    (isApiError(deskQuery.error) ? deskQuery.error.message : null);

  const setTab = (nextTab: TabId) => {
    setActiveTab(nextTab);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", nextTab);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  useEffect(() => {
    if (requestedTab && tabs.some((tab) => tab.id === requestedTab) && requestedTab !== activeTab) {
      setActiveTab(requestedTab as TabId);
    }
  }, [activeTab, requestedTab]);

  return (
    <SportControlShell
      eyebrow="Tennis Ops"
      title="Tennis Operations Desk"
      description="Run tennis from one page: upcoming fixtures, live discovery, tracked courts, public live cards, and the live pricing desk. The old deep links remain valid, but this page is now the primary control surface."
      actions={
        <>
          <Link href="/admin/providers">
            <Button variant="secondary">Providers</Button>
          </Link>
          <Link href="/admin/feeds">
            <Button variant="secondary">Feeds</Button>
          </Link>
        </>
      }
      metrics={[
        {
          label: "Upcoming Fixtures",
          value: upcomingFixtures.length,
          detail: "Scheduled courts ready to be tracked before they go live.",
        },
        {
          label: "Live Discovery",
          value: liveDiscoveryMatches.length,
          detail: "Provider-live tennis matches currently visible from the batch live feed.",
        },
        {
          label: "Tracked / Public",
          value: `${liveMatches.length} / ${publishedCount}`,
          detail: "Managed live courts versus currently public live tennis boards.",
        },
      ]}
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={(tabId) => setTab(tabId as TabId)}
    >
      <div className="space-y-4">
      <AdminActionDeck
        title="Operator Shortcuts"
        description="This page remains the tennis command center. These links keep related provider and polling surfaces one click away without splitting the tennis workflow again."
        actions={[
          {
            href: "/admin/live-polling",
            label: "Live Polling Ops",
            description: "Inspect batch score and batch odds freshness across tennis, cricket, and football.",
          },
          {
            href: "/admin/feeds",
            label: "All Feeds",
            description: "Review shared feed import metrics and live sync status without leaving admin.",
          },
          {
            href: "/admin/providers",
            label: "Providers",
            description: "Check API Tennis provider configuration and support readiness.",
          },
        ]}
      />
      <TabGuidancePanel {...tabGuidance[activeTab]} />

      <section className="rounded-3xl border border-emerald-400/15 bg-emerald-500/10 px-4 py-4 text-sm text-emerald-50">
        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-200/75">
          Public Visibility Rule
        </div>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-black/10 px-3 py-3">
            <div className="font-semibold text-white">Upcoming Fixtures</div>
            <div className="mt-1 text-xs leading-6 text-emerald-50/75">
              Upcoming tennis fixtures are visible automatically on the public `/tennis` lobby as schedule cards.
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/10 px-3 py-3">
            <div className="font-semibold text-white">Live Odds</div>
            <div className="mt-1 text-xs leading-6 text-emerald-50/75">
              Live tennis odds are visible publicly automatically once API Tennis supplies live odds and the margin engine produces public prices.
            </div>
          </div>
        </div>
      </section>

      {pageError ? <Alert variant="error">{pageError}</Alert> : null}

      {activeTab === "upcoming" ? (
        fixturesQuery.isLoading ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-white/65">Loading tennis fixtures…</div>
        ) : (
          <TennisFixtureTable
            fixtures={upcomingFixtures}
            busyEventKey={busyTrackEventKey}
            trackedEventKeys={trackedEventKeys}
            onTrack={handleTrack}
          />
        )
      ) : null}

      {activeTab === "live_now" ? (
        liveDiscoveryQuery.isLoading ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-white/65">Loading provider live tennis matches…</div>
        ) : (
          <TennisLiveDiscoveryTable
            matches={liveDiscoveryMatches}
            busyEventKey={busyTrackEventKey}
            trackedEventKeys={trackedEventKeys}
            onTrack={handleTrack}
          />
        )
      ) : null}

      {activeTab === "tracked" ? (
        liveQuery.isLoading ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-white/65">Loading tracked tennis matches…</div>
        ) : (
          <TennisLiveTracker
            matches={liveMatches}
            busyEventKey={busyStopEventKey}
            onStop={handleStop}
            connectionStatus={liveSocketStatus || liveDiscoverySocketStatus}
          />
        )
      ) : null}

      {activeTab === "live_cards" ? (
        deskQuery.isLoading ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-white/65">Loading live tennis ops cards…</div>
        ) : (
          <TennisLiveOpsCards matches={deskMatches} />
        )
      ) : null}

      {activeTab === "desk" ? (
        deskQuery.isLoading ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-white/65">Loading tennis desk…</div>
        ) : (
          <TennisDeskTable
            matches={deskMatches}
            connectionStatus={deskSocketStatus}
            margin={deskData.margin}
            simulationEnabled={!!deskData.simulation?.enabled}
            activeScenario={deskData.simulation?.scenario}
            scenarios={deskData.simulation?.scenarios ?? []}
            onMarginChange={async (margin) => {
              await updateMargin.mutateAsync({ margin });
            }}
            onSimulationToggle={async (enabled) => {
              await updateSimulation.mutateAsync({ enabled });
            }}
            onInjectScenario={async (scenario) => {
              await injectSimulation.mutateAsync({ scenario });
            }}
          />
        )
      ) : null}
      </div>
    </SportControlShell>
  );
}
