"use client";

import { memo } from "react";
import { AlertTriangle, ArrowLeftRight, CircleDot, ShieldAlert } from "lucide-react";
import type { FootballContext, FootballLaneMeta } from "@/lib/football/footballContext";

export const FootballEventTimeline = memo(function FootballEventTimeline({
  events,
  health,
  compact = false,
}: {
  events: FootballContext["events"];
  health?: FootballLaneMeta | null;
  compact?: boolean;
}) {
  const rows = Array.isArray(events) ? [...events].reverse().slice(0, 8) : [];

  if (!rows.length) {
    return (
      <div className={["rounded-[calc(var(--r-xl)+2px)] border border-white/10 bg-[rgba(255,255,255,0.03)] text-sm text-[var(--c-text-muted)]", compact ? "p-3" : "p-5"].join(" ")}>
        {healthMessage(health, "Live event timeline is temporarily unavailable.")}
      </div>
    );
  }

  return (
    <div className={["rounded-[calc(var(--r-xl)+2px)] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur-xl", compact ? "p-3" : "p-5"].join(" ")}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--c-text-faint)]">Live Event Timeline</div>
      <div className={compact ? "mt-3 space-y-2.5" : "mt-4 space-y-3"}>
        {rows.map((event, index) => (
          <div key={`${event.minute}-${event.team_name}-${event.player_name}-${index}`} className={["flex rounded-[var(--r-lg)] border border-white/8 bg-[rgba(255,255,255,0.03)]", compact ? "gap-2 px-3 py-2.5" : "gap-3 px-4 py-3"].join(" ")}>
            <div className={["flex shrink-0 flex-col items-center justify-center rounded-[var(--r-md)] border border-white/8 bg-white/5 font-semibold text-white", compact ? "w-10 text-[11px]" : "w-12 text-xs"].join(" ")}>
              <span>{event.minute ?? "-"}</span>
              <span className="text-[10px] text-[var(--c-text-faint)]">{event.stoppage ? `+${event.stoppage}` : "min"}</span>
            </div>
            <div className="min-w-0">
              <div className={["flex items-center gap-2 font-semibold text-white", compact ? "text-[13px]" : "text-sm"].join(" ")}>
                {eventIcon(String(event.type || ""), String(event.detail || ""))}
                <span>{event.label || event.detail || "Match Event"}</span>
              </div>
              <div className={["mt-1 text-[var(--c-text-muted)]", compact ? "text-[11px]" : "text-xs"].join(" ")}>
                {[event.team_name, event.player_name, event.assist_name ? `Assist: ${event.assist_name}` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

function healthMessage(health: FootballLaneMeta | null | undefined, fallback: string) {
  switch (health?.status) {
    case "unsupported":
      return "Detailed event timeline is not available for this tier.";
    case "rate_limited":
      return health.message || "Live event timeline is temporarily rate limited. Automatic retry is active.";
    case "auth_failed":
      return "Live event timeline is temporarily unavailable from the provider.";
    case "unavailable":
      return health.message || fallback;
    default:
      return fallback;
  }
}

function eventIcon(type: string, detail: string) {
  const lowerType = type.toLowerCase();
  const lowerDetail = detail.toLowerCase();

  if (lowerType === "goal") return <CircleDot className="h-4 w-4 text-emerald-300" />;
  if (lowerType === "var") return <AlertTriangle className="h-4 w-4 text-amber-300" />;
  if (lowerType === "subst") return <ArrowLeftRight className="h-4 w-4 text-sky-300" />;
  if (lowerType === "card" && lowerDetail.includes("red")) return <ShieldAlert className="h-4 w-4 text-red-300" />;
  return <CircleDot className="h-4 w-4 text-[var(--c-text-faint)]" />;
}
