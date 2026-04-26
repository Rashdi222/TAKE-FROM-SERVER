"use client";

import { memo } from "react";
import type { TennisRecentPoint } from "@/lib/tennis/liveData";

export const TennisPointTimeline = memo(function TennisPointTimeline({
  points,
}: {
  points: TennisRecentPoint[];
}) {
  if (!points.length) return null;

  return (
    <section className="rounded-[1.8rem] border border-white/10 bg-black/15 p-4">
      <div className="text-[11px] uppercase tracking-[0.24em] text-white/40">Point Timeline</div>
      <div className="mt-3 flex flex-wrap gap-2">
        {points.map((point) => {
          const tone = point.matchPoint
            ? "border-amber-400/35 bg-amber-500/15 text-amber-100"
            : point.setPoint
              ? "border-orange-400/35 bg-orange-500/15 text-orange-100"
              : point.breakPoint
                ? "border-rose-400/35 bg-rose-500/15 text-rose-100"
                : point.wonBy === "player_1"
                  ? "border-cyan-400/25 bg-cyan-500/12 text-cyan-100"
                  : point.wonBy === "player_2"
                    ? "border-fuchsia-400/25 bg-fuchsia-500/12 text-fuchsia-100"
                    : "border-white/10 bg-white/[0.05] text-white";

          return (
            <span
              key={point.id}
              className={`inline-flex h-10 min-w-10 items-center justify-center rounded-full border px-3 text-sm font-semibold transition-colors ${tone}`}
            >
              {point.label}
            </span>
          );
        })}
      </div>
    </section>
  );
});
