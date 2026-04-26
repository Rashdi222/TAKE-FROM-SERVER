"use client";

import { memo } from "react";
import type { FootballLaneMeta, FootballStatisticsMap } from "@/lib/football/footballContext";

type TeamStats = {
  team_name?: string | null;
  stats?: FootballStatisticsMap | null;
} | null;

export const FootballMatchStats = memo(function FootballMatchStats({
  home,
  away,
  health,
  compact = false,
}: {
  home: TeamStats;
  away: TeamStats;
  health?: FootballLaneMeta | null;
  compact?: boolean;
}) {
  const rows = [
    statRow("Possession", readNumber(home, "ball_possession"), readNumber(away, "ball_possession"), "%"),
    statRow("Shots On Target", readNumber(home, "shots_on_goal"), readNumber(away, "shots_on_goal")),
    statRow("Dangerous Attacks", readNumber(home, "dangerous_attacks"), readNumber(away, "dangerous_attacks")),
    statRow("Corners", readNumber(home, "corner_kicks"), readNumber(away, "corner_kicks")),
    statRow("Fouls", readNumber(home, "fouls"), readNumber(away, "fouls")),
  ].filter((row) => row.home != null || row.away != null);

  if (!rows.length) {
    return (
      <div className={["rounded-[calc(var(--r-xl)+2px)] border border-white/10 bg-[rgba(255,255,255,0.03)] text-sm text-[var(--c-text-muted)]", compact ? "p-3" : "p-5"].join(" ")}>
        {healthMessage(health, "Detailed live stats are not available right now.")}
      </div>
    );
  }

  return (
    <div className={["rounded-[calc(var(--r-xl)+2px)] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur-xl", compact ? "p-3" : "p-4 sm:p-5"].join(" ")}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--c-text-faint)]">Live Match Stats</div>
      <div className={compact ? "mt-3 space-y-3" : "mt-4 space-y-4"}>
        {rows.map((row) => (
          <div key={row.label}>
            <div className={["mb-2 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center font-semibold", compact ? "gap-2 text-[11px]" : "gap-2 text-xs sm:gap-3 sm:text-sm"].join(" ")}>
              <span className="text-emerald-100">{formatValue(row.home, row.suffix)}</span>
              <span className="truncate text-center text-[var(--c-text-muted)]">{row.label}</span>
              <span className="text-right text-sky-100">{formatValue(row.away, row.suffix)}</span>
            </div>
            <DualBar home={row.home} away={row.away} />
          </div>
        ))}
      </div>
    </div>
  );
});

function healthMessage(health: FootballLaneMeta | null | undefined, fallback: string) {
  switch (health?.status) {
    case "unsupported":
      return "Detailed stats are not available for this tier.";
    case "rate_limited":
      return health.message || "Detailed stats are temporarily rate limited. Automatic retry is active.";
    case "auth_failed":
      return "Detailed stats are temporarily unavailable from the provider.";
    case "unavailable":
      return health.message || fallback;
    default:
      return fallback;
  }
}

function DualBar({ home, away }: { home: number | null; away: number | null }) {
  const total = Math.max((home || 0) + (away || 0), 1);
  const homeWidth = `${(((home || 0) / total) * 100).toFixed(1)}%`;
  const awayWidth = `${(((away || 0) / total) * 100).toFixed(1)}%`;

  return (
    <div className="flex h-3 overflow-hidden rounded-full border border-white/8 bg-white/5">
      <div className="bg-gradient-to-r from-emerald-500/80 to-emerald-300/80 transition-[width] duration-300" style={{ width: homeWidth }} />
      <div className="bg-gradient-to-l from-sky-500/80 to-sky-300/80 transition-[width] duration-300" style={{ width: awayWidth }} />
    </div>
  );
}

function statRow(label: string, home: number | null, away: number | null, suffix?: string) {
  return { label, home, away, suffix };
}

function formatValue(value: number | null, suffix?: string) {
  if (value == null) return "-";
  return `${value}${suffix || ""}`;
}

function readNumber(team: TeamStats, key: string) {
  const value = team?.stats?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
