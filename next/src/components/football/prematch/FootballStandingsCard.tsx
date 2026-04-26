"use client";

import { ArrowDown, ArrowRight, ArrowUp, BarChart3 } from "lucide-react";
import type { Match } from "@/lib/api";
import type { FootballContext } from "@/lib/football/footballContext";

export function FootballStandingsCard({
  match,
  context,
}: {
  match: Match;
  context: FootballContext | null;
}) {
  const rows = Array.isArray(context?.standings_snapshot?.teams) ? context!.standings_snapshot!.teams! : [];

  if (!rows.length) return null;

  return (
    <div className="rounded-[calc(var(--r-xl)+2px)] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur-xl">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--c-text-faint)]">
        <BarChart3 className="h-4 w-4 text-emerald-300" />
        Table Impact
      </div>

      <div className="mt-4 space-y-3">
        {rows.map((row) => (
          <div
            key={`${row.team_name}-${row.rank}`}
            className="grid gap-3 rounded-[var(--r-lg)] border border-white/8 bg-[rgba(255,255,255,0.03)] px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-white">{row.team_name || "Team"}</div>
              <div className="mt-1 text-xs text-[var(--c-text-muted)]">
                {row.zone || "League position"}
              </div>
            </div>
            <Metric label="Rank" value={row.rank != null ? `#${row.rank}` : "-"} />
            <Metric label="Points" value={row.points != null ? String(row.points) : "-"} />
            <div className="flex items-center justify-between gap-3 sm:block">
              <Metric label="Form" value={row.form || "-"} />
              <div className="mt-2 flex items-center gap-1 text-xs font-semibold text-[var(--c-text-muted)]">
                {movementIcon(row.movement)}
                <span>{movementLabel(row.movement)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-4 text-sm leading-6 text-[var(--c-text-muted)]">
        {match.team1} and {match.team2} are shown against the current league table when provider standings coverage is available.
      </p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-right">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--c-text-faint)]">{label}</div>
      <div className="mt-1 text-sm font-semibold text-white">{value}</div>
    </div>
  );
}

function movementIcon(value: string | null | undefined) {
  switch (String(value || "").toLowerCase()) {
    case "up":
      return <ArrowUp className="h-3.5 w-3.5 text-emerald-300" />;
    case "down":
      return <ArrowDown className="h-3.5 w-3.5 text-red-300" />;
    default:
      return <ArrowRight className="h-3.5 w-3.5 text-slate-300" />;
  }
}

function movementLabel(value: string | null | undefined) {
  switch (String(value || "").toLowerCase()) {
    case "up":
      return "Climbing";
    case "down":
      return "Falling";
    default:
      return "Steady";
  }
}
