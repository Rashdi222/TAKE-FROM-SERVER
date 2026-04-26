"use client";

import { CircleDot } from "lucide-react";

function surfaceTheme(surface?: string | null) {
  const normalized = String(surface || "").toLowerCase();

  if (normalized.includes("clay")) {
    return {
      label: "Clay Court",
      shell:
        "border-orange-300/20 bg-[radial-gradient(circle_at_top,rgba(251,146,60,0.22),transparent_45%),linear-gradient(180deg,#5f2514_0%,#8b3c1a_42%,#6d2e13_100%)]",
      court:
        "bg-[linear-gradient(180deg,rgba(247,164,85,0.18)_0%,rgba(130,47,13,0.08)_100%)]",
      line: "border-white/60",
      dot: "bg-orange-200",
    };
  }

  if (normalized.includes("grass")) {
    return {
      label: "Grass Court",
      shell:
        "border-emerald-300/20 bg-[radial-gradient(circle_at_top,rgba(34,197,94,0.24),transparent_42%),linear-gradient(180deg,#0b2d18_0%,#175a2f_42%,#0f3d1f_100%)]",
      court: "bg-[linear-gradient(180deg,rgba(134,239,172,0.12)_0%,rgba(16,185,129,0.05)_100%)]",
      line: "border-white/60",
      dot: "bg-emerald-200",
    };
  }

  if (normalized.includes("carpet")) {
    return {
      label: "Carpet Court",
      shell:
        "border-fuchsia-300/20 bg-[radial-gradient(circle_at_top,rgba(217,70,239,0.2),transparent_42%),linear-gradient(180deg,#241046_0%,#3a1f74_42%,#21103f_100%)]",
      court: "bg-[linear-gradient(180deg,rgba(216,180,254,0.12)_0%,rgba(99,102,241,0.05)_100%)]",
      line: "border-white/65",
      dot: "bg-fuchsia-200",
    };
  }

  return {
    label: "Hard Court",
    shell:
      "border-sky-300/20 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.24),transparent_42%),linear-gradient(180deg,#0a2944_0%,#134b77_42%,#0a2d49_100%)]",
    court: "bg-[linear-gradient(180deg,rgba(147,197,253,0.12)_0%,rgba(59,130,246,0.05)_100%)]",
    line: "border-white/60",
    dot: "bg-sky-200",
  };
}

export function TennisCourtSurface({ surface }: { surface?: string | null }) {
  const theme = surfaceTheme(surface);

  return (
    <section className={`rounded-[2rem] border p-5 text-white shadow-[0_24px_80px_rgba(0,0,0,0.35)] ${theme.shell}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.28em] text-white/55">Court Surface</p>
          <h2 className="mt-2 text-xl font-semibold tracking-[-0.04em]">{theme.label}</h2>
        </div>
        <div className="rounded-full border border-white/15 bg-black/15 px-3 py-1.5 text-xs text-white/85">
          {surface || "Surface pending"}
        </div>
      </div>

      <div className={`relative mt-5 h-[220px] overflow-hidden rounded-[1.6rem] border sm:h-[260px] lg:h-[300px] ${theme.line} ${theme.court}`}>
        <div className="absolute inset-3 rounded-[1.1rem] border border-white/55 sm:inset-5 sm:rounded-[1.4rem]" />
        <div className="absolute inset-x-[24%] inset-y-3 border-x border-white/55 sm:inset-x-[26%] sm:inset-y-5" />
        <div className="absolute inset-x-3 top-1/2 border-t border-white/55 sm:inset-x-5" />
        <div className="absolute left-1/2 top-3 bottom-3 border-l border-white/55 sm:top-5 sm:bottom-5" />
        <div className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/70 bg-white/15" />

        <div className="absolute left-[7%] top-[18%] flex items-center gap-2 rounded-full border border-black/15 bg-black/15 px-2.5 py-1 text-[11px] text-white sm:left-[14%] sm:top-1/2 sm:-translate-y-1/2 sm:px-3 sm:py-1.5 sm:text-xs">
          <CircleDot className={`h-3.5 w-3.5 ${theme.dot}`} />
          Baseline Pressure
        </div>
        <div className="absolute right-[7%] bottom-[18%] flex items-center gap-2 rounded-full border border-black/15 bg-black/15 px-2.5 py-1 text-[11px] text-white/90 sm:right-[14%] sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 sm:px-3 sm:py-1.5 sm:text-xs">
          <CircleDot className={`h-3.5 w-3.5 ${theme.dot}`} />
          Fast court read
        </div>
      </div>
    </section>
  );
}
