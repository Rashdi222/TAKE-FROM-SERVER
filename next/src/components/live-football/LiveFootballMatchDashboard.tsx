"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { publicApi, type Match, type Odds } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { connectMatchChannel } from "@/lib/live/phoenixMatchChannel";
import { createLiveMatchStore, useLiveMatchStoreSelector } from "@/lib/live/matchLiveStore";
import type { LiveMatchSelectionQuote } from "@/lib/live/types";
import { FootballMarketBoard } from "./FootballMarketBoard";
import { LiveFootballBetSlip } from "./LiveFootballBetSlip";
import { FootballLiveHud } from "@/components/football/live/FootballLiveHud";

export function LiveFootballMatchDashboard({
  match,
  initialOdds,
  embedded = false,
  displayMode = "full",
  oddsHydrationPending = false,
  oddsLoadFailed = false,
}: {
  match: Match;
  initialOdds: Odds[];
  embedded?: boolean;
  displayMode?: "full" | "hud-only" | "board-only";
  oddsHydrationPending?: boolean;
  oddsLoadFailed?: boolean;
}) {
  const [store] = useState(() => createLiveMatchStore(match, initialOdds));
  const [activeQuote, setActiveQuote] = useState<LiveMatchSelectionQuote | null>(null);
  const resyncInFlightRef = useRef(false);
  const lastResyncAtRef = useRef(0);

  useEffect(() => {
    const currentState = store.getState();
    const sameMatch = currentState.match.id === match.id;
    const currentStateVersion = Number(currentState.match.live_state_version || 0);
    const incomingStateVersion = Number(match.live_state_version || 0);

    if (sameMatch && incomingStateVersion < currentStateVersion) {
      return;
    }

    if (
      sameMatch &&
      currentState.match.status === "live" &&
      match.status !== "live" &&
      incomingStateVersion <= currentStateVersion
    ) {
      return;
    }

    const currentOdds = Object.values(currentState.oddsById);
    const snapshotOdds =
      initialOdds.length === 0 && sameMatch && currentOdds.length > 0 ? currentOdds : initialOdds;

    store.hydrateSnapshot(match, snapshotOdds);
  }, [initialOdds, match, store]);

  const resyncSnapshot = useCallback(async () => {
    const now = Date.now();
    if (resyncInFlightRef.current) return;
    if (now - lastResyncAtRef.current < 1500) return;
    resyncInFlightRef.current = true;
    lastResyncAtRef.current = now;

    try {
      const [matchResponse, oddsResponse] = await Promise.all([
        publicApi.matches.get(match.id),
        publicApi.matches.odds(match.id),
      ]);
      store.hydrateSnapshot(matchResponse.data, oddsResponse.data);
    } catch {
      // silent retry path: keep current board and recover on next reconnect/update
    } finally {
      resyncInFlightRef.current = false;
    }
  }, [match.id, store]);

  useEffect(() => {
    return connectMatchChannel(match.id, {
      onStatus: (status) => store.setConnectionStatus(status),
      onJoined: ({ rejoined }) => {
        if (rejoined) void resyncSnapshot();
      },
      onMatchStateUpdated: (payload) => store.applyMatchStateUpdated(payload),
      onOddsUpdated: (payload) => store.applyOddsUpdated(payload),
      onMarketSuspended: (payload) => store.applyMarketSuspended(payload),
      onMarketResumed: (payload) => store.applyMarketResumed(payload),
      onCanonicalMarketUpdated: (payload) => store.applyCanonicalMarketUpdated(payload),
      onCanonicalOddsUpdated: (payload) => store.applyCanonicalOddsUpdated(payload),
      onHealthDegraded: (payload) => {
        store.applyHealthDegraded(payload);
        if (payload.degraded === true) void resyncSnapshot();
      },
    });
  }, [match.id, resyncSnapshot, store]);

  useEffect(() => () => store.destroy(), [store]);

  useEffect(() => {
    const timer = window.setInterval(() => store.pruneExpiredOdds(), 300);
    return () => window.clearInterval(timer);
  }, [store]);

  const liveMatch = useLiveMatchStoreSelector(store, (state) => state.match);
  const connectionStatus = useLiveMatchStoreSelector(store, (state) => state.connectionStatus);
  const marketSuspended = useLiveMatchStoreSelector(store, (state) => state.marketSuspended);
  const visibleOddsCount = useLiveMatchStoreSelector(store, (state) => Object.keys(state.oddsById).length);
  const dataHealth = useLiveMatchStoreSelector(store, (state) => state.dataHealth);
  const showHud = displayMode !== "board-only";
  const showBoard = displayMode !== "hud-only";
  const shouldShowHydrationPending = oddsHydrationPending && visibleOddsCount === 0;
  const shouldShowLoadFailed = oddsLoadFailed && visibleOddsCount === 0;

  return (
    <div className={embedded ? "bg-transparent pb-0" : "bg-[var(--c-bg)] pb-24 lg:pb-8"}>
      <div
        className={
          embedded
            ? displayMode === "full"
              ? "space-y-4 px-4 py-4"
              : "px-4 py-4"
            : "mx-auto grid max-w-7xl gap-6 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-8 lg:py-8"
        }
        >
        {showHud ? (
        <div className="space-y-4">
          <FootballLiveHud
            match={liveMatch}
            connectionStatus={connectionStatus}
            marketSuspended={marketSuspended}
            compact={embedded && displayMode === "hud-only"}
            dataHealth={dataHealth}
          />
          {displayMode === "hud-only" ? (
            <Card variant="surface-1" className="p-4 text-sm leading-6 text-[var(--c-text-muted)]">
              This pane stays focused on live match intelligence while the odds board remains separate.
            </Card>
          ) : null}
        </div>
        ) : null}

        {showBoard ? (
        <div className="space-y-4">
          {shouldShowHydrationPending ? (
            <FootballMarketBoardSkeleton />
          ) : shouldShowLoadFailed ? (
            <Card variant="surface-1" className="p-6 text-sm text-[var(--c-text-muted)]">
              Live football markets could not be loaded right now. The score HUD will keep updating while the odds feed
              reconnects.
            </Card>
          ) : (
            <FootballMarketBoard store={store} onSelect={setActiveQuote} />
          )}
        </div>
        ) : null}

        {!embedded && showBoard ? (
        <div className="hidden lg:block">
          <Card variant="surface-1" className={embedded ? "sticky top-4 p-4 text-sm text-[var(--c-text-muted)]" : "sticky top-28 p-4 text-sm text-[var(--c-text-muted)]"}>
            Select a football live rate to load the atomic bet slip. The quote carries the current state version and odds version so stale lines are rejected safely.
          </Card>
        </div>
        ) : null}
      </div>

      <LiveFootballBetSlip
        key={activeQuote ? `${activeQuote.oddsId}:${activeQuote.oddsVersionNo}:${activeQuote.stateVersion}` : "closed"}
        store={store}
        quote={activeQuote}
        onClose={() => setActiveQuote(null)}
      />
    </div>
  );
}

function FootballMarketBoardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <div className="flex min-w-max gap-2 rounded-[var(--r-md)] border border-[var(--c-border)] bg-[rgba(255,255,255,0.03)] p-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={index}
              className="h-10 w-24 animate-pulse rounded-[var(--r-pill)] bg-[rgba(255,255,255,0.06)]"
            />
          ))}
        </div>
      </div>

      {Array.from({ length: 2 }).map((_, index) => (
        <Card key={index} variant="surface-1" className="overflow-hidden">
          <div className="border-b border-[var(--c-border)] px-4 py-3 sm:px-5">
            <div className="h-3 w-16 animate-pulse rounded bg-[rgba(255,255,255,0.06)]" />
            <div className="mt-3 h-6 w-40 animate-pulse rounded bg-[rgba(255,255,255,0.08)]" />
          </div>
          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((__, rowIndex) => (
              <div
                key={rowIndex}
                className="rounded-[var(--r-md)] border border-[var(--c-border)] bg-[rgba(255,255,255,0.02)] p-4"
              >
                <div className="h-4 w-24 animate-pulse rounded bg-[rgba(255,255,255,0.06)]" />
                <div className="mt-4 h-10 w-full animate-pulse rounded bg-[rgba(255,255,255,0.08)]" />
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
