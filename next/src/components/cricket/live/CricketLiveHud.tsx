"use client";

import { memo, useMemo, useSyncExternalStore } from "react";
import { AlertTriangle, RadioTower, WifiOff } from "lucide-react";
import type { LiveMatchStore } from "@/lib/live/matchLiveStore";
import { useLiveMatchStoreSelector } from "@/lib/live/matchLiveStore";
import { toNumber } from "@/lib/format";
import {
  extractCommentary,
  extractLineupBenchmarks,
  extractLiveBatters,
  extractLiveBowler,
  extractLiveRates,
  extractRecentBalls,
} from "@/lib/cricket/liveData";
import { CricketActivePlayers } from "./CricketActivePlayers";
import { CricketLiveCommentary } from "./CricketLiveCommentary";
import { CricketLiveScorecard } from "./CricketLiveScorecard";
import { CricketMomentumWave } from "./CricketMomentumWave";
import { CricketRecentAction } from "./CricketRecentAction";

export const CricketLiveHud = memo(function CricketLiveHud({
  store,
  embedded = false,
  compact = false,
}: {
  store: LiveMatchStore;
  embedded?: boolean;
  compact?: boolean;
}) {
  const match = useLiveMatchStoreSelector(store, (state) => state.match);
  const suspended = useLiveMatchStoreSelector(store, (state) => state.marketSuspended);
  const suspensionReason = useLiveMatchStoreSelector(store, (state) => state.suspensionReason);
  const dataHealth = useLiveMatchStoreSelector(store, (state) => state.dataHealth);
  const connectionStatus = useLiveMatchStoreSelector(store, (state) => state.connectionStatus);
  const hydrated = useSyncExternalStore(emptySubscribe, () => true, () => false);

  const { striker, nonStriker } = useMemo(() => extractLiveBatters(match), [match]);
  const bowler = useMemo(() => extractLiveBowler(match), [match]);
  const rates = useMemo(() => extractLiveRates(match), [match]);
  const recentBalls = useMemo(() => extractRecentBalls(match), [match]);
  const commentary = useMemo(() => extractCommentary(match), [match]);
  const lineupBenchmarks = useMemo(() => extractLineupBenchmarks(match), [match]);

  if (compact) {
    const scoreline = `${Number(match.runs_total || 0)}/${Number(match.wickets_total || 0)}`;
    const overs = String(match.current_over || "0.0");
    const targetRuns = toNumber(rates.targetRuns);
    const recentBallLabels = recentBalls.slice(-6).map((ball) => ball.label || ball.value || "").filter(Boolean);

    return (
      <div className="border-b border-white/8 bg-[rgba(4,8,16,0.88)] backdrop-blur-2xl">
        <div
          className={
            embedded
              ? "px-4 py-4"
              : "mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8"
          }
        >
          <div className="overflow-hidden rounded-[1.6rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(25,186,194,0.18),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(249,115,22,0.12),transparent_26%),linear-gradient(135deg,rgba(255,255,255,0.055),rgba(255,255,255,0.016))] p-4 shadow-[0_20px_55px_rgba(0,0,0,0.26)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <ConnectionChip hydrated={hydrated} connectionStatus={connectionStatus} suspended={suspended} />
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/65">
                    Innings {match.current_innings || 1}
                  </span>
                  {targetRuns ? (
                    <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100">
                      Target {targetRuns}
                    </span>
                  ) : null}
                </div>
                <div className="mt-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">
                  Live Match Center
                </div>
                <div className="mt-1 text-xl font-semibold tracking-[-0.04em] text-white sm:text-2xl">
                  {String(match.team1 || "Team 1")} <span className="text-white/30">vs</span> {String(match.team2 || "Team 2")}
                </div>
              </div>

              <div className="flex flex-wrap items-stretch gap-2">
                <CompactSignal label="Score" value={scoreline} detail={`Overs ${overs}`} accent="emerald" />
                <CompactSignal
                  label="Rate"
                  value={formatCompactRate(toNumber(rates.currentRunRate))}
                  detail={targetRuns ? `Req ${formatCompactRate(toNumber(rates.requiredRunRate))}` : "Setting tone"}
                  accent="cyan"
                />
                <CompactSignal
                  label="Pressure"
                  value={compactPressureLabel(toNumber(rates.requiredRunRate), toNumber(rates.currentRunRate))}
                  detail={String(match.batting_team || match.team1 || "Batting")}
                  accent="amber"
                />
              </div>
            </div>

            {hydrated && suspended ? (
              <div className="mt-3 rounded-[1rem] border border-amber-400/30 bg-amber-500/12 px-4 py-3 text-sm font-medium text-amber-100">
                {resolveSuspensionBanner(suspensionReason)}
              </div>
            ) : hydrated && dataHealth.degraded && dataHealth.warning ? (
              <div className="mt-3 rounded-[1rem] border border-cyan-400/25 bg-cyan-500/10 px-4 py-3 text-sm font-medium text-cyan-100">
                Live prices are refreshing in the background. Existing rates remain on screen while new ones arrive.
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">Recent balls</span>
              {recentBallLabels.length ? (
                recentBallLabels.map((ball, index) => <CompactBallChip key={`${ball}-${index}`} value={ball} />)
              ) : (
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/60">
                  Awaiting delivery pattern
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="sticky top-0 z-30 border-b border-white/8 bg-[rgba(4,8,16,0.88)] backdrop-blur-2xl">
      <div className={embedded ? "flex flex-col gap-4 px-4 py-4" : "mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8"}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ConnectionChip hydrated={hydrated} connectionStatus={connectionStatus} suspended={suspended} />
          {hydrated && suspended ? (
            <div className="rounded-full border border-amber-400/30 bg-amber-500/12 px-4 py-2 text-sm font-medium text-amber-100">
              {resolveSuspensionBanner(suspensionReason)}
            </div>
          ) : hydrated && dataHealth.degraded && dataHealth.warning ? (
            <div className="rounded-full border border-cyan-400/25 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-100">
              Live prices are refreshing in the background.
            </div>
          ) : null}
        </div>

        <CricketLiveScorecard
          team1={String(match.team1 || "Team 1")}
          team2={String(match.team2 || "Team 2")}
          battingTeam={String(match.batting_team || match.team1 || "Batting side")}
          bowlingTeam={String(match.bowling_team || match.team2 || "Bowling side")}
          runs={Number(match.runs_total || 0)}
          wickets={Number(match.wickets_total || 0)}
          overs={String(match.current_over || "0.0")}
          currentRunRate={toNumber(rates.currentRunRate)}
          requiredRunRate={toNumber(rates.requiredRunRate)}
          targetRuns={typeof rates.targetRuns === "number" ? rates.targetRuns : null}
          inning={typeof rates.inning === "number" ? rates.inning : null}
          tossWinner={lineupBenchmarks.tossWinner}
          tossDecision={lineupBenchmarks.tossDecision}
          captain={lineupBenchmarks.captain}
          wicketkeeper={lineupBenchmarks.wicketkeeper}
        />

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <div className="space-y-4">
            <CricketActivePlayers striker={striker} nonStriker={nonStriker} bowler={bowler} />
            <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <CricketRecentAction balls={recentBalls} />
              <CricketMomentumWave recentBalls={recentBalls} currentRunRate={toNumber(rates.currentRunRate)} requiredRunRate={toNumber(rates.requiredRunRate)} />
            </div>
          </div>
          <CricketLiveCommentary commentary={commentary} />
        </div>
      </div>
    </div>
  );
});

function emptySubscribe() {
  return () => {};
}

function ConnectionChip({
  hydrated,
  connectionStatus,
  suspended,
}: {
  hydrated: boolean;
  connectionStatus: string;
  suspended: boolean;
}) {
  if (!hydrated) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white/60">
        <WifiOff className="h-3.5 w-3.5" /> Connecting
      </span>
    );
  }

  if (suspended) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/12 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-red-200">
        <AlertTriangle className="h-3.5 w-3.5" /> Suspended
      </span>
    );
  }

  if (connectionStatus === "joined") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/12 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200">
        <RadioTower className="h-3.5 w-3.5" /> Live feed
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/12 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">
      <WifiOff className="h-3.5 w-3.5" /> {connectionStatus}
    </span>
  );
}

function resolveSuspensionBanner(reason: string | null) {
  switch ((reason || "").trim()) {
    case "provider_disconnect":
      return "The live feed is reconnecting. Prices will return once the data is stable."
    case "live_bootstrap":
    case "bootstrap_missing_board":
      return "Live prices are starting up for this match."
    case "ai_engine_unavailable":
    case "bootstrap_recovery":
      return "Live prices are refreshing after a temporary sync issue."
    case "manual_admin_review":
      return "Live prices are waiting for confirmation before they are shown."
    case "third_umpire_review":
      return "A review is in progress, so live prices are paused until the decision is complete."
    case "rain_delay":
      return "Play is delayed, so live prices remain paused until the match resumes."
    case "drinks_break":
      return "Drinks break in progress. Live prices will resume shortly."
    case "tie_scenario_detected":
      return "The scores are level — live prices are paused while the result is confirmed."
    case "super_over_in_progress":
      return "A Super Over is in progress. Live prices will resume shortly."
    case "dls_target_revision_in_progress":
      return "The DLS target is being revised. Live prices are paused until the new target is confirmed."
    case "critical_data_missing":
      return "Live data is incomplete. Prices are paused until the feed is restored."
    case "edge_case_type:tie":
      return "The scores are level — live prices are paused while the result is confirmed."
    default:
      if ((reason || "").startsWith("rate_limit_exceeded")) {
        return "Live prices are briefly paused due to high traffic. They will resume in a moment."
      }
      return reason
        ? `Live prices are temporarily paused while the match updates: ${reason.replace(/_/g, " ")}.`
        : "Some live prices are briefly paused while the board updates."
  }
}

function CompactSignal({
  label,
  value,
  detail,
  accent,
}: {
  label: string;
  value: string;
  detail: string;
  accent: "emerald" | "cyan" | "amber";
}) {
  const palette = {
    emerald: "border-emerald-400/20 bg-emerald-400/10 text-emerald-100",
    cyan: "border-cyan-400/20 bg-cyan-400/10 text-cyan-100",
    amber: "border-amber-400/20 bg-amber-400/10 text-amber-100",
  }[accent];

  return (
    <div className={`min-w-[104px] rounded-[1rem] border ${palette} px-3 py-2.5`}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-current/65">{label}</div>
      <div className="mt-1 text-lg font-semibold tracking-[-0.04em] text-white">{value}</div>
      <div className="mt-1 text-[11px] text-current/80">{detail}</div>
    </div>
  );
}

function CompactBallChip({ value }: { value: string }) {
  const normalized = value.trim().toUpperCase();
  const tone =
    normalized === "W"
      ? "border-red-500/40 bg-red-500/15 text-red-100"
      : normalized === "4" || normalized === "6"
        ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-100"
        : "border-white/10 bg-white/[0.04] text-white";

  return (
    <span
      className={[
        "inline-flex h-8 min-w-8 items-center justify-center rounded-full border px-2 text-xs font-semibold",
        tone,
      ].join(" ")}
    >
      {normalized}
    </span>
  );
}

function formatCompactRate(value: number | null) {
  return value === null || Number.isNaN(value) ? "-" : toNumber(value)?.toFixed(2) || "-";
}

function compactPressureLabel(required: number | null, current: number | null) {
  if (required === null || current === null) return "Stable";
  const delta = required - current;
  if (delta >= 1.5) return "High";
  if (delta >= 0.35) return "Rising";
  if (delta <= -1) return "On top";
  return "Balanced";
}
