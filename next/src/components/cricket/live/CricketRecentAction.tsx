import { memo } from "react";
import type { RecentBall } from "@/lib/cricket/liveData";

export const CricketRecentAction = memo(function CricketRecentAction({ balls }: { balls: RecentBall[] }) {
  if (!balls.length) {
    return (
      <div className="rounded-[1.1rem] border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/60">
        Waiting for the latest over to build.
      </div>
    );
  }

  return (
    <div className="rounded-[1.25rem] border border-white/10 bg-black/20 px-4 py-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/45">Last 6 Balls</div>
      <div className="mt-3 flex flex-wrap gap-2.5">
        {balls.map((ball) => {
          const tone = ball.isWicket
            ? "border-red-500/40 bg-red-500/15 text-red-100"
            : ball.label === "4" || ball.label === "6" || ball.isBoundary
              ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-100"
              : "border-white/10 bg-white/[0.05] text-white";

          return (
            <span
              key={ball.id}
              className={["inline-flex h-10 min-w-10 items-center justify-center rounded-full border px-3 text-sm font-semibold transition-transform duration-200 hover:-translate-y-0.5", tone].join(" ")}
              title={[ball.over, ball.batsman, ball.bowler].filter(Boolean).join(" · ")}
            >
              {ball.label === "0" ? "•" : ball.label}
            </span>
          );
        })}
      </div>
    </div>
  );
});
