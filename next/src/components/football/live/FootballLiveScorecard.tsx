"use client";

import { memo } from "react";
import { AlertTriangle, RadioTower, WifiOff } from "lucide-react";
import type { Match } from "@/lib/api";
import type { LiveConnectionStatus } from "@/lib/live/types";

export const FootballLiveScorecard = memo(function FootballLiveScorecard({
  match,
  competitionName,
  venueName,
  connectionStatus,
  marketSuspended = false,
  compact = false,
  dataHealth,
}: {
  match: Match;
  competitionName: string;
  venueName: string;
  connectionStatus: LiveConnectionStatus;
  marketSuspended?: boolean;
  compact?: boolean;
  dataHealth?: {
    degraded: boolean;
    warning: string | null;
    consensusSourceCount: number;
    degradedSources: string[];
  };
}) {
  const minute = footballMinute(match);
  const status = footballStatusLabel(match);
  const score = footballScore(match);

  return (
    <div className={["rounded-[calc(var(--r-xl)+2px)] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur-xl", compact ? "p-3" : "p-4 sm:p-5"].join(" ")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--c-text-faint)]">
            Live Football Command Center
          </div>
          <div className="mt-2 text-sm text-[var(--c-text-muted)]">
            {competitionName} · {venueName}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <ConnectionBadge
            connectionStatus={connectionStatus}
            marketSuspended={marketSuspended}
            dataHealth={dataHealth}
          />
          <DataHealthDot dataHealth={dataHealth} />
          <div className="rounded-full border border-emerald-500/25 bg-emerald-500/12 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-200">
            {status}
          </div>
        </div>
      </div>

      <div className={["mt-5 grid gap-3 sm:gap-4", compact ? "" : "lg:grid-cols-[1fr_auto_1fr] lg:items-center"].join(" ")}>
        <TeamBlock name={String(match.team1 || "Home")} score={String(score.home)} align="left" />
        <div className="text-center">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Match Clock</div>
          <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] px-3 py-2 sm:px-4">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xl font-semibold tracking-[-0.04em] text-white sm:text-2xl">{minute}</span>
          </div>
        </div>
        <TeamBlock name={String(match.team2 || "Away")} score={String(score.away)} align="right" />
      </div>
    </div>
  );
});

function ConnectionBadge({
  connectionStatus,
  marketSuspended,
  dataHealth,
}: {
  connectionStatus: LiveConnectionStatus;
  marketSuspended: boolean;
  dataHealth?: {
    degraded: boolean;
    warning: string | null;
    consensusSourceCount: number;
    degradedSources: string[];
  };
}) {
  if (dataHealth?.degraded) {
    return (
      <div className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/12 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-amber-100">
        <WifiOff className="h-3.5 w-3.5" />
        Live Feed Interrupted
      </div>
    );
  }

  if (marketSuspended) {
    return (
      <div className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/12 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-amber-100">
        <AlertTriangle className="h-3.5 w-3.5" />
        Market Paused
      </div>
    );
  }

  if (connectionStatus === "joined") {
    return (
      <div className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/12 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-200">
        <RadioTower className="h-3.5 w-3.5" />
        Live Feed
      </div>
    );
  }

  if (connectionStatus === "connecting") {
    return (
      <div className="inline-flex items-center gap-1 rounded-full border border-sky-500/30 bg-sky-500/12 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-sky-100">
        <RadioTower className="h-3.5 w-3.5" />
        Connecting Feed
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/12 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-amber-100">
      <WifiOff className="h-3.5 w-3.5" />
      Socket Disconnected. 3s REST Fallback Active
    </div>
  );
}

function DataHealthDot({
  dataHealth,
}: {
  dataHealth?: {
    degraded: boolean;
    warning: string | null;
    consensusSourceCount: number;
    degradedSources: string[];
  };
}) {
  const tone =
    dataHealth?.degraded
      ? "bg-rose-400"
      : (dataHealth?.consensusSourceCount || 0) > 1
        ? "bg-emerald-400"
        : "bg-amber-400";

  const label =
    dataHealth?.degraded
      ? dataHealth.warning || "Live feed interrupted - reconnecting..."
      : (dataHealth?.consensusSourceCount || 0) > 1
        ? `Multiple sources active (${dataHealth?.consensusSourceCount || 0})`
        : (dataHealth?.consensusSourceCount || 0) === 1
          ? "Running on secondary source"
          : "Awaiting source health";

  return (
    <div
      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--c-text-faint)]"
      title={label}
    >
      <span className={`h-2.5 w-2.5 rounded-full ${tone}`} />
      Data Health
    </div>
  );
}

function TeamBlock({ name, score, align }: { name: string; score: string; align: "left" | "right" }) {
  return (
    <div className={["rounded-[var(--r-xl)] border border-white/8 bg-[rgba(255,255,255,0.03)] px-4 py-4", align === "right" ? "text-right" : ""].join(" ")}>
      <div className="truncate text-sm font-semibold text-[var(--c-text-muted)]">{name}</div>
      <div className="mt-2 text-4xl font-semibold tracking-[-0.06em] text-white sm:text-5xl">{score}</div>
    </div>
  );
}

function footballMinute(match: Match) {
  const elapsed = typeof match.elapsed_minute === "number" ? match.elapsed_minute : 0;
  const stoppage = typeof match.stoppage_minute === "number" ? match.stoppage_minute : 0;
  if (elapsed <= 0) return "--'";
  return stoppage > 0 ? `${elapsed}+${stoppage}'` : `${elapsed}'`;
}

function footballStatusLabel(match: Match) {
  const rawData =
    match.raw_data && typeof match.raw_data === "object" && !Array.isArray(match.raw_data)
      ? (match.raw_data as Record<string, unknown>)
      : null;
  const fixture =
    rawData?.fixture && typeof rawData.fixture === "object" && !Array.isArray(rawData.fixture)
      ? (rawData.fixture as Record<string, unknown>)
      : null;
  const status =
    fixture?.status && typeof fixture.status === "object" && !Array.isArray(fixture.status)
      ? (fixture.status as Record<string, unknown>)
      : null;

  return String(status?.long || status?.short || match.status || "Live");
}

function footballScore(match: Match) {
  const directHome = typeof match.home_score === "number" ? match.home_score : null;
  const directAway = typeof match.away_score === "number" ? match.away_score : null;
  const rawData =
    match.raw_data && typeof match.raw_data === "object" && !Array.isArray(match.raw_data)
      ? (match.raw_data as Record<string, unknown>)
      : null;
  const goals =
    rawData?.goals && typeof rawData.goals === "object" && !Array.isArray(rawData.goals)
      ? (rawData.goals as Record<string, unknown>)
      : null;
  const rawHome = scorePart(goals?.home);
  const rawAway = scorePart(goals?.away);
  const directKnown = directHome !== null || directAway !== null;

  if (directKnown) {
    const home = directHome ?? 0;
    const away = directAway ?? 0;
    const directLooksStale = home == 0 && away == 0 && (rawHome > 0 || rawAway > 0);
    if (!directLooksStale) return { home, away };
  }

  return {
    home: rawHome,
    away: rawAway,
  };
}

function scorePart(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}
