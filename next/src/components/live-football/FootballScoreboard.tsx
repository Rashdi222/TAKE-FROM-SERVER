"use client";

import { useSyncExternalStore } from "react";
import { AlertTriangle, CircleDot, WifiOff } from "lucide-react";
import type { LiveMatchStore } from "@/lib/live/matchLiveStore";
import { useLiveMatchStoreSelector } from "@/lib/live/matchLiveStore";

export function FootballScoreboard({ store, embedded = false }: { store: LiveMatchStore; embedded?: boolean }) {
  const match = useLiveMatchStoreSelector(store, (state) => state.match);
  const suspended = useLiveMatchStoreSelector(store, (state) => state.marketSuspended);
  const suspensionReason = useLiveMatchStoreSelector(store, (state) => state.suspensionReason);
  const suspendedMarkets = useLiveMatchStoreSelector(store, (state) => state.suspendedMarkets);
  const connectionStatus = useLiveMatchStoreSelector(store, (state) => state.connectionStatus);
  const hydrated = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const scoreLine = footballScoreLine(match);
  const minuteLabel = footballMinute(match);
  const statusLabel = footballStatusLabel(match);
  const deepStats = footballDeepStats(match);

  return (
    <div className="sticky top-0 z-30 border-b border-[var(--c-border)] bg-[rgba(7,10,18,0.94)] backdrop-blur-xl">
      <div className={embedded ? "flex flex-col gap-3 px-4 py-3" : "mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 lg:px-8"}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--c-text-faint)]">
              Live Football Board
            </div>
            <div className="mt-1 text-lg font-semibold text-[var(--c-text)] sm:text-xl">
              {match.team1} <span className="text-[var(--c-text-faint)]">vs</span> {match.team2}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em]">
            {hydrated ? (
              connectionStatus === "joined" ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/12 px-3 py-1 text-emerald-300">
                  <CircleDot className="h-3.5 w-3.5" /> Live Feed
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/12 px-3 py-1 text-amber-300">
                  <WifiOff className="h-3.5 w-3.5" /> {connectionStatus}
                </span>
              )
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--c-border)] bg-[rgba(255,255,255,0.03)] px-3 py-1 text-[var(--c-text-muted)]">
                <WifiOff className="h-3.5 w-3.5" /> Connecting
              </span>
            )}
            {hydrated && suspended ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/12 px-3 py-1 text-red-300">
                <AlertTriangle className="h-3.5 w-3.5" /> Suspended
              </span>
            ) : null}
          </div>
        </div>

        {hydrated && suspended ? (
          <div className="rounded-[var(--r-md)] border border-amber-500/30 bg-amber-500/12 px-4 py-3 text-sm font-medium text-amber-100">
            {resolveFootballSuspensionBanner(suspensionReason)}
          </div>
        ) : hydrated && connectionStatus !== "joined" ? (
          <div className="rounded-[var(--r-md)] border border-sky-500/25 bg-sky-500/10 px-4 py-3 text-sm font-medium text-sky-100">
            Reconnecting to the live football channel. Prices may lag until the feed is stable again.
          </div>
        ) : hydrated && Object.keys(suspendedMarkets).length > 0 ? (
          <div className="rounded-[var(--r-md)] border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            {Object.keys(suspendedMarkets).length} football market {Object.keys(suspendedMarkets).length === 1 ? "family is" : "families are"} temporarily suspended while the rest of the board stays open.
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-4 xl:grid-cols-6">
          <ScoreStat label="Score" value={scoreLine} />
          <ScoreStat label="Minute" value={minuteLabel} />
          <ScoreStat label="Status" value={statusLabel} />
          <ScoreStat label="Competition" value={String(match.competition?.name || match.season_name || "Football")} />
          <ScoreStat label="Venue" value={String(match.venue_name || "-")} />
          <ScoreStat label="Board" value={suspended ? "Suspended" : "Open"} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <ScoreStat label="Red Cards" value={deepStats.redCards} />
          <ScoreStat label="Corners" value={deepStats.corners} />
          <ScoreStat label="Shots On Target" value={deepStats.shotsOnTarget} />
          <ScoreStat label="Tempo" value={deepStats.tempo} />
          <ScoreStat label="Pressure" value={deepStats.pressure} />
        </div>
      </div>
    </div>
  );
}

function emptySubscribe() {
  return () => {};
}

function ScoreStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--r-md)] border border-[var(--c-border)] bg-[rgba(255,255,255,0.03)] px-3 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--c-text-faint)]">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold text-[var(--c-text)] sm:text-base">{value}</div>
    </div>
  );
}

function footballScoreLine(match: Record<string, unknown>) {
  const directHome = typeof match.home_score === "number" ? match.home_score : null;
  const directAway = typeof match.away_score === "number" ? match.away_score : null;
  const scoreRoot = match.score as Record<string, unknown> | undefined;
  const score = scoreRoot?.score;
  const rawGoals = (match.raw_data as { goals?: { home?: number | string; away?: number | string } } | undefined)?.goals;
  const scoreGoals = scoreRoot?.goals as { home?: number | string; away?: number | string } | undefined;

  const fallbackHome = rawGoals?.home ?? scoreGoals?.home;
  const fallbackAway = rawGoals?.away ?? scoreGoals?.away;

  if (directHome !== null || directAway !== null) {
    const home = directHome ?? 0;
    const away = directAway ?? 0;
    const fallbackHomeNum = numeric(fallbackHome);
    const fallbackAwayNum = numeric(fallbackAway);
    const directLooksStale = home === 0 && away === 0 && (fallbackHomeNum > 0 || fallbackAwayNum > 0);
    if (!directLooksStale) return `${home} - ${away}`;
  }

  if (typeof score === "string" && score.trim() !== "") return score;

  const home = fallbackHome;
  const away = fallbackAway;
  return `${home ?? 0} - ${away ?? 0}`;
}

function footballMinute(match: Record<string, unknown>) {
  const directElapsed = typeof match.elapsed_minute === "number" ? match.elapsed_minute : null;
  const directStoppage = typeof match.stoppage_minute === "number" ? match.stoppage_minute : null;
  if (directElapsed !== null && directElapsed > 0) {
    return directStoppage && directStoppage > 0 ? `${directElapsed}+${directStoppage}'` : `${directElapsed}'`;
  }

  const elapsed = (match.raw_data as { fixture?: { status?: { elapsed?: number | string } } } | undefined)?.fixture?.status?.elapsed;
  return elapsed != null && String(elapsed).trim() !== "" ? `${elapsed}'` : "-";
}

function footballStatusLabel(match: Record<string, unknown>) {
  const status =
    (match.raw_data as { fixture?: { status?: { short?: string; long?: string } } } | undefined)?.fixture?.status?.long ||
    (match.raw_data as { fixture?: { status?: { short?: string } } } | undefined)?.fixture?.status?.short ||
    match.status;

  return String(status || "-");
}

function footballDeepStats(match: Record<string, unknown>) {
  const homeRed = numeric(match.home_red_cards);
  const awayRed = numeric(match.away_red_cards);
  const homeCorners = numeric(match.home_corners);
  const awayCorners = numeric(match.away_corners);
  const homeShots = numeric(match.home_shots_on_target);
  const awayShots = numeric(match.away_shots_on_target);
  const tempo = numeric(match.tempo_index);
  const pressure = ((homeShots + awayShots) * 0.7 + (homeCorners + awayCorners) * 0.3).toFixed(1);

  return {
    redCards: `${homeRed}-${awayRed}`,
    corners: `${homeCorners}-${awayCorners}`,
    shotsOnTarget: `${homeShots}-${awayShots}`,
    tempo: tempo > 0 ? tempo.toFixed(2) : "-",
    pressure: pressure,
  };
}

function numeric(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function resolveFootballSuspensionBanner(reason: string | null) {
  switch ((reason || "").trim()) {
    case "provider_disconnect":
      return "Live Feed Interrupted. Awaiting Connection."
    case "provider_import_failure":
      return "Market Suspended: Provider Import Failure."
    case "manual_admin_review":
      return "Market Suspended for Review."
    case "var_review":
      return "Market Suspended: VAR Review."
    case "goal_scored":
      return "Market Suspended: Goal Scored."
    case "red_card":
      return "Market Suspended: Red Card."
    case "penalty_review":
      return "Market Suspended: Penalty Review."
    default:
      return reason ? `Market Suspended: ${reason.replace(/_/g, " ")}` : "Market Suspended."
  }
}
