"use client";

import { memo, useMemo } from "react";
import { Divide, Dot, ShieldAlert } from "lucide-react";
import type { RecentBall } from "@/lib/cricket/liveData";

type DeliveryGroup = {
  key: string;
  label: string;
  balls: RecentBall[];
};

export const CricketDeliveryStrip = memo(function CricketDeliveryStrip({
  balls,
  title = "Recent Deliveries",
}: {
  balls: RecentBall[];
  title?: string;
}) {
  const groups = useMemo(() => groupRecentDeliveries(balls), [balls]);

  return (
    <section className="rounded-[1.55rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015))] p-4 shadow-[0_18px_54px_rgba(0,0,0,0.22)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/45">{title}</div>
          <div className="mt-1 text-xs text-white/55">Horizontal ball-by-ball view with over separators.</div>
        </div>
        <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/60">
          <ShieldAlert className="h-3.5 w-3.5 text-cyan-200" />
          Live feed
        </div>
      </div>

      <div className="mt-4 overflow-x-auto pb-1">
        <div className="flex min-w-max items-center gap-3">
          {groups.length ? (
            groups.map((group, groupIndex) => (
              <div key={group.key} className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  {group.balls.map((ball) => {
                    const tone = ballTone(ball);
                    return (
                      <div
                        key={ball.id}
                        className={[
                          "flex h-12 w-12 shrink-0 items-center justify-center rounded-full border text-sm font-semibold tracking-[-0.03em] transition-transform duration-200 hover:-translate-y-0.5",
                          tone,
                        ].join(" ")}
                        title={[ball.over, ball.bowler, ball.batsman].filter(Boolean).join(" · ")}
                      >
                        {renderBallLabel(ball)}
                      </div>
                    );
                  })}
                </div>

                {groupIndex < groups.length - 1 ? (
                  <div className="flex shrink-0 items-center gap-2">
                    <div className="h-px w-10 bg-gradient-to-r from-transparent via-white/30 to-transparent" />
                    <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/55">
                      <Divide className="h-3.5 w-3.5" />
                      {group.label}
                    </div>
                    <div className="h-px w-10 bg-gradient-to-r from-transparent via-white/30 to-transparent" />
                  </div>
                ) : null}
              </div>
            ))
          ) : (
            <div className="flex items-center gap-2 rounded-full border border-dashed border-white/12 bg-white/[0.03] px-4 py-2 text-sm text-white/60">
              <Dot className="h-4 w-4" />
              Awaiting delivery feed
            </div>
          )}
        </div>
      </div>
    </section>
  );
});

function groupRecentDeliveries(balls: RecentBall[]) {
  const ordered = [...balls]
    .filter((ball) => ball && typeof ball === "object")
    .slice(0, 18)
    .reverse();

  const groups: DeliveryGroup[] = [];

  for (const ball of ordered) {
    const overLabel = normalizeOverLabel(ball.over);
    const current = groups[groups.length - 1];
    const shouldStartNew = !current || current.balls.length >= 6 || (overLabel && current.label !== overLabel);

    if (shouldStartNew) {
      groups.push({
        key: `${overLabel || "over"}-${ball.id}`,
        label: overLabel || `Over ${groups.length + 1}`,
        balls: [ball],
      });
      continue;
    }

    current.balls.push(ball);
  }

  return groups;
}

function normalizeOverLabel(value: RecentBall["over"]) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const [overPart] = raw.split(".");
  const parsed = Number(overPart);
  if (Number.isFinite(parsed)) {
    return `Over ${parsed}`;
  }

  return raw.toUpperCase().startsWith("OVER") ? raw : `Over ${raw}`;
}

function renderBallLabel(ball: RecentBall) {
  if (ball.isWicket) return "W";
  if (ball.label === "0") return "•";
  return ball.label || "•";
}

function ballTone(ball: RecentBall) {
  if (ball.isWicket) return "border-red-500/40 bg-red-500/16 text-red-100 shadow-[0_0_0_1px_rgba(248,113,113,0.18)]";
  if (ball.label === "4" || ball.label === "6" || ball.isBoundary) {
    return "border-emerald-500/40 bg-emerald-500/14 text-emerald-100 shadow-[0_0_0_1px_rgba(52,211,153,0.14)]";
  }
  if (ball.label === "1" || ball.label === "2" || ball.label === "3") {
    return "border-cyan-400/30 bg-cyan-400/10 text-cyan-100";
  }
  return "border-white/10 bg-white/[0.05] text-white";
}
