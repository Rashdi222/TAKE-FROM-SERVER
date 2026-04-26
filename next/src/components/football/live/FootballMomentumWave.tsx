"use client";

import { memo, useMemo } from "react";
import type { FootballContext } from "@/lib/football/footballContext";

export const FootballMomentumWave = memo(function FootballMomentumWave({
  context,
}: {
  context: FootballContext | null;
}) {
  const bars = useMemo(() => buildBars(context), [context]);

  return (
    <div className="rounded-[calc(var(--r-xl)+2px)] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--c-text-faint)]">Attack Pressure</div>
        <div className="text-xs text-[var(--c-text-muted)]">Synthetic from shots, corners and recent events</div>
      </div>

      <div className="mt-4 flex h-24 items-end gap-2 rounded-[var(--r-lg)] border border-white/8 bg-[rgba(255,255,255,0.03)] px-3 py-3">
        {bars.map((bar, index) => (
          <div key={index} className="flex flex-1 flex-col items-center justify-end gap-2">
            <div
              className={[
                "w-full rounded-full transition-[height,opacity,transform] duration-300",
                bar.tone === "home"
                  ? "bg-gradient-to-t from-emerald-500/85 to-emerald-300/65"
                  : "bg-gradient-to-t from-sky-500/85 to-sky-300/65",
              ].join(" ")}
              style={{ height: `${bar.height}%` }}
            />
          </div>
        ))}
      </div>
    </div>
  );
});

function buildBars(context: FootballContext | null) {
  const events = Array.isArray(context?.event_highlights) ? context.event_highlights : [];
  const stats = Array.isArray(context?.statistics) ? context.statistics : [];
  const home = stats[0]?.stats || {};
  const away = stats[1]?.stats || {};

  const homeBase = num(home.shots_on_goal) * 2 + num(home.corner_kicks) * 1.2 + num(home.dangerous_attacks);
  const awayBase = num(away.shots_on_goal) * 2 + num(away.corner_kicks) * 1.2 + num(away.dangerous_attacks);

  return Array.from({ length: 8 }).map((_, index) => {
    const event = events[index];
    const isHome = event?.team_name && context?.statistics?.[0]?.team_name === event.team_name;
    const eventBoost = event?.type === "goal" ? 10 : event?.type === "card" ? 4 : 2;
    const raw = (index % 2 === 0 ? homeBase : awayBase) + (event ? eventBoost : 0) + index * 1.2;
    const height = Math.max(18, Math.min(100, raw));

        return {
      tone: (typeof isHome === "boolean" ? isHome : index % 2 === 0) ? "home" : "away",
      height,
    };
  });
}

function num(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}
