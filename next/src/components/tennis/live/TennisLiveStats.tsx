"use client";

import { memo } from "react";
import type { TennisLiveStat } from "@/lib/tennis/liveData";

export const TennisLiveStats = memo(function TennisLiveStats({
  stats,
}: {
  stats: TennisLiveStat[];
}) {
  if (!stats.length) return null;

  return (
    <section className="rounded-[1.8rem] border border-white/10 bg-black/15 p-4">
      <div className="text-[11px] uppercase tracking-[0.24em] text-white/40">Live Stats</div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-[1.2rem] border border-white/8 bg-white/[0.03] p-3">
            <div className="text-[10px] uppercase tracking-[0.18em] text-white/40">{stat.label}</div>
            <div className="mt-2 text-lg font-semibold text-white">{stat.value}</div>
          </div>
        ))}
      </div>
    </section>
  );
});
