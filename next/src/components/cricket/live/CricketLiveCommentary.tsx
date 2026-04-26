import { memo } from "react";
import type { RecentBall } from "@/lib/cricket/liveData";

export const CricketLiveCommentary = memo(function CricketLiveCommentary({ commentary }: { commentary: RecentBall[] }) {
  return (
    <div className="rounded-[1.3rem] border border-white/10 bg-black/20 p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/45">Live Commentary</div>
      <div className="mt-4 max-h-72 space-y-2 overflow-y-auto pr-1">
        {commentary.length ? (
          commentary.map((entry) => (
            <div key={entry.id} className="rounded-[1rem] border border-white/8 bg-white/[0.04] px-3 py-3 text-sm text-white/80">
              <div className="flex items-center justify-between gap-3">
                <div className="font-semibold text-white">{entry.over || "Live"}</div>
                <div className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/60">
                  {entry.label === "0" ? "Dot" : entry.label}
                </div>
              </div>
              <div className="mt-2 leading-6">
                {(entry.bowler || "Bowler") + " to " + (entry.batsman || "batter") + ": " + commentaryText(entry)}
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-[1rem] border border-white/8 bg-white/[0.04] px-3 py-4 text-sm text-white/60">
            Waiting for the first live commentary entries.
          </div>
        )}
      </div>
    </div>
  );
});

function commentaryText(entry: RecentBall) {
  if (entry.isWicket) return "Wicket falls. Pressure spikes immediately.";
  if (entry.label === "6") return "Six launched into the stands.";
  if (entry.label === "4") return "Boundary found with perfect timing.";
  if (entry.label === "0") return "Dot ball. Tight pressure from the fielding side.";
  return `${entry.label} run${entry.label === "1" ? "" : "s"} taken.`;
}
