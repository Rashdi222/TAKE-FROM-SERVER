"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Zap } from "lucide-react";
import { ApiError, isApiError, publicApi, type Match, type Odds, userApi } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { useBalance } from "@/hooks/useProfile";
import { toNumber } from "@/lib/format";
import { connectMatchChannel } from "@/lib/live/phoenixMatchChannel";
import { createLiveMatchStore, useLiveMatchStoreSelector } from "@/lib/live/matchLiveStore";
import type { LiveMatchSelectionQuote } from "@/lib/live/types";
import { CricketLiveHud } from "@/components/cricket/live/CricketLiveHud";
import { MarketBoard } from "./MarketBoard";
import { LiveBetSlip } from "./LiveBetSlip";

type QuickStakePreset = 100 | 500 | 1000 | "max";

export function LiveCricketMatchDashboard({
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
  const queryClient = useQueryClient();
  const [store] = useState(() => createLiveMatchStore(match, initialOdds));
  const [activeQuote, setActiveQuote] = useState<LiveMatchSelectionQuote | null>(null);
  const [quickStake] = useState<QuickStakePreset>(500);
  const [quickBetEnabled] = useState(false);
  const [quickMessage, setQuickMessage] = useState<string | null>(null);
  const [quickMessageTone, setQuickMessageTone] = useState<"success" | "warning">("success");
  const resyncInFlightRef = useRef(false);
  const lastResyncAtRef = useRef(0);
  const suspended = useLiveMatchStoreSelector(store, (state) => state.marketSuspended);
  const visibleOddsCount = useLiveMatchStoreSelector(store, (state) => Object.keys(state.oddsById).length);
  const { data: balanceData } = useBalance();
  const showHud = displayMode !== "board-only";
  const showBoard = displayMode !== "hud-only";
  const showCompactHeader = embedded && displayMode === "board-only";
  const shouldShowHydrationPending = oddsHydrationPending && visibleOddsCount === 0;
  const shouldShowLoadFailed = oddsLoadFailed && visibleOddsCount === 0;

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
      // silent retry path: keep existing board and recover on subsequent reconnect/updates
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

  useEffect(() => {
    if (!quickMessage) return;
    const timer = window.setTimeout(() => setQuickMessage(null), 3200);
    return () => window.clearTimeout(timer);
  }, [quickMessage]);

  const balance = Number(balanceData?.balance || 0);

  const createBet = useMutation({
    mutationFn: async (payload: LiveMatchSelectionQuote & { stake: number }) => {
      return userApi.bets.create({
        match_id: payload.matchId,
        odds_id: payload.oddsId,
        stake: payload.stake,
        in_play: true,
        match_state_version: payload.stateVersion,
        odds_version_no: payload.oddsVersionNo,
        market_key: payload.marketKey,
        selection_key: payload.selectionKey,
        quoted_odds_value: payload.quotedPrice,
        client_snapshot: {
          source: "cricket_command_center_quick_bet",
          accepted_at: new Date().toISOString(),
          quick_bet: true,
        },
      });
    },
    onSuccess: (_response, variables) => {
      setQuickMessageTone("success");
      setQuickMessage(`Quick bet accepted: ${variables.label} at ${variables.quotedPrice.toFixed(2)}`);
      queryClient.invalidateQueries({ queryKey: ["user", "balance"] });
      queryClient.invalidateQueries({ queryKey: ["user", "profile"] });
      queryClient.invalidateQueries({ queryKey: ["bets"] });
    },
  });

  const executeQuickBet = useCallback(
    async (quote: LiveMatchSelectionQuote, odds: Odds) => {
      if (createBet.isPending) return;
      if (suspended) {
        setQuickMessageTone("warning");
        setQuickMessage("The live board is temporarily paused. Quick-bet is blocked until prices reopen.");
        return;
      }

      const resolvedStake = resolveStakeAmount(quickStake, balance, odds);
      if (!resolvedStake || resolvedStake < 100) {
        setQuickMessageTone("warning");
        setQuickMessage("Choose a valid quick stake before using one-tap betting.");
        return;
      }

      if (resolvedStake > balance) {
        setQuickMessageTone("warning");
        setQuickMessage("Insufficient balance for the selected quick stake.");
        return;
      }

      triggerHaptic(18);

      try {
        await createBet.mutateAsync({ ...quote, stake: resolvedStake });
      } catch (error) {
        if (isApiError(error)) {
          setQuickMessageTone("warning");
          if (error.message === "stale quote") {
            setQuickMessage("Price changed before execution. Review the refreshed quote in the slip.");
            setActiveQuote(quote);
            return;
          }
          if (error.message === "market suspended") {
            setQuickMessage("This market is temporarily unavailable while live prices update. Quick-bet was not placed.");
            return;
          }
          setQuickMessage(error.message || "Quick-bet failed. Review the slip and try again.");
          return;
        }

        if (error instanceof ApiError) {
          setQuickMessageTone("warning");
          setQuickMessage(error.message || "Quick-bet failed. Review the slip and try again.");
          return;
        }

        setQuickMessageTone("warning");
        setQuickMessage("Quick-bet failed. Review the slip and try again.");
      }
    },
    [balance, createBet, quickStake, suspended],
  );

  const handleQuoteAction = useCallback(
    (quote: LiveMatchSelectionQuote, odds: Odds) => {
      if (quickBetEnabled) {
        void executeQuickBet(quote, odds);
        return;
      }

      setActiveQuote(quote);
    },
    [executeQuickBet, quickBetEnabled],
  );

  const layoutClass = embedded
    ? displayMode === "full"
      ? "grid gap-4 px-4 py-4"
      : "px-4 py-4"
    : "mx-auto grid max-w-7xl gap-4 px-4 py-5 sm:px-6 lg:gap-5 lg:px-8 lg:py-8";

  return (
    <div className={embedded ? "bg-transparent pb-8" : "bg-[var(--c-bg)] pb-8"}>
      {showHud ? <CricketLiveHud store={store} embedded={embedded} /> : null}
      {showCompactHeader ? <CricketLiveHud store={store} embedded compact /> : null}

      <div className={layoutClass}>
        <div className="space-y-4">
          {showHud && displayMode === "hud-only" ? (
            <Card variant="surface-1" className="p-4 text-sm leading-6 text-[var(--c-text-muted)]">
              This pane stays focused on live cricket intelligence while the odds board remains separate.
            </Card>
          ) : null}

          {quickMessage ? (
            <Card
              variant="surface-1"
              className={[
                "p-4 text-sm",
                quickMessageTone === "success"
                  ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-100"
                  : "border-amber-500/25 bg-amber-500/10 text-amber-100",
              ].join(" ")}
            >
              <div className="flex items-start gap-2">
                {quickMessageTone === "success" ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                ) : (
                  <Zap className="mt-0.5 h-4 w-4 shrink-0" />
                )}
                <div>{quickMessage}</div>
              </div>
            </Card>
          ) : null}

          {showBoard ? (
            shouldShowHydrationPending ? (
              <CricketMarketBoardSkeleton />
            ) : shouldShowLoadFailed ? (
              <Card variant="surface-1" className="p-6 text-sm text-[var(--c-text-muted)]">
                Live cricket markets could not be loaded right now. The score panel will keep updating while the odds feed reconnects.
              </Card>
            ) : (
              <MarketBoard store={store} onSelect={handleQuoteAction} />
            )
          ) : null}
        </div>
      </div>

      <LiveBetSlip
        key={activeQuote ? `${activeQuote.oddsId}:${activeQuote.oddsVersionNo}:${activeQuote.stateVersion}` : "closed"}
        store={store}
        quote={activeQuote}
        onClose={() => setActiveQuote(null)}
      />
    </div>
  );
}

function CricketMarketBoardSkeleton() {
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <div className="flex min-w-max gap-2 rounded-[1.25rem] border border-white/10 bg-white/[0.04] p-2 backdrop-blur-xl">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-10 w-24 animate-pulse rounded-full bg-white/[0.08]" />
          ))}
        </div>
      </div>

      {Array.from({ length: 4 }).map((_, index) => (
        <Card
          key={index}
          variant="surface-1"
          className="rounded-[1rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.035),rgba(255,255,255,0.012))] p-4"
        >
          <div className="h-4 w-40 animate-pulse rounded bg-white/[0.08]" />
          <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(112px,1fr))] gap-2">
            {Array.from({ length: 4 }).map((__, rowIndex) => (
              <div key={rowIndex} className="rounded-[0.9rem] border border-white/10 bg-white/[0.04] p-3">
                <div className="h-3 w-16 animate-pulse rounded bg-white/[0.08]" />
                <div className="mt-3 h-6 w-14 animate-pulse rounded bg-white/[0.1]" />
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

function resolveStakeAmount(preset: QuickStakePreset, balance: number, odds: Odds) {
  const maxStake = toNumber(odds.max_stake_amount) || balance;
  const hardCap = Math.min(balance, maxStake);
  if (preset === "max") return hardCap;
  return Math.min(preset, hardCap);
}

function triggerHaptic(duration: number) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(duration);
  }
}
