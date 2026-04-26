import { memo, type ReactNode } from "react";
import { Activity, Target, TrendingUp } from "lucide-react";
import { formatDecimal } from "@/lib/format";

export const CricketLiveScorecard = memo(function CricketLiveScorecard({
  team1,
  team2,
  battingTeam,
  bowlingTeam,
  runs,
  wickets,
  overs,
  currentRunRate,
  requiredRunRate,
  targetRuns,
  inning,
  tossWinner,
  tossDecision,
  captain,
  wicketkeeper,
}: {
  team1: string;
  team2: string;
  battingTeam: string;
  bowlingTeam: string;
  runs: number;
  wickets: number;
  overs: string;
  currentRunRate: number | null;
  requiredRunRate: number | null;
  targetRuns: number | null;
  inning: number | null;
  tossWinner: string | null;
  tossDecision: string | null;
  captain: string | null;
  wicketkeeper: string | null;
}) {
  const hasLiveAction =
    runs > 0 || wickets > 0 || (typeof overs === "string" && overs !== "0" && overs !== "0.0") || (inning != null && inning > 1);

  return (
    <div className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(86,191,255,0.16),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.15),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.015))] p-4 shadow-[0_22px_80px_rgba(0,0,0,0.28)] sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-200/70">Cricket Command Center</div>
          <div className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-white sm:text-3xl">
            {team1} <span className="text-white/30">vs</span> {team2}
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-white/72">
            <HeaderPill icon={<Activity className="h-3.5 w-3.5" />} label={`Innings ${inning || 1}`} />
            <HeaderPill icon={<Target className="h-3.5 w-3.5" />} label={targetRuns ? `Target ${targetRuns}` : "Target pending"} />
            <HeaderPill icon={<TrendingUp className="h-3.5 w-3.5" />} label={requiredRunRate != null ? `RRR ${formatDecimal(requiredRunRate)}` : "Setting tone"} />
          </div>
        </div>
        <div className="rounded-[1.3rem] border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-right">
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/45">Live Score</div>
          <div className="mt-2 text-4xl font-semibold tracking-[-0.06em] text-white">{runs}/{wickets}</div>
          <div className="mt-1 text-sm text-white/72">Overs {overs}</div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <HudMetric label="Batting" value={battingTeam} subvalue={`CRR ${formatDecimal(currentRunRate || 0)}`} accent="cyan" />
        <HudMetric label="Bowling" value={bowlingTeam} subvalue={targetRuns ? `${Math.max(targetRuns - runs, 0)} needed` : "First innings pressure"} accent="amber" />
        <HudMetric
          label={hasLiveAction ? "Phase" : "Toss"}
          value={hasLiveAction ? `Innings ${inning || 1} live` : tossWinner || "Awaiting toss card"}
          subvalue={hasLiveAction ? `${battingTeam} vs ${bowlingTeam}` : tossDecision ? formatDecision(tossDecision) : "Decision pending"}
          accent="emerald"
        />
        <HudMetric label="Leadership" value={captain || "Captain TBC"} subvalue={wicketkeeper ? `WK ${wicketkeeper}` : "Keeper TBC"} accent="violet" />
      </div>
    </div>
  );
});

function HeaderPill({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
      <span className="text-cyan-200">{icon}</span>
      <span>{label}</span>
    </span>
  );
}

function HudMetric({ label, value, subvalue, accent }: { label: string; value: string; subvalue: string; accent: "cyan" | "amber" | "emerald" | "violet" }) {
  const tone = {
    cyan: "from-cyan-400/18 to-cyan-500/6",
    amber: "from-amber-400/18 to-amber-500/6",
    emerald: "from-emerald-400/18 to-emerald-500/6",
    violet: "from-violet-400/18 to-violet-500/6",
  }[accent];

  return (
    <div className={`min-w-0 rounded-[1.2rem] border border-white/10 bg-gradient-to-br ${tone} px-4 py-4`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/45">{label}</div>
      <div className="mt-2 break-words text-xl font-semibold tracking-[-0.04em] text-white">{value}</div>
      <div className="mt-2 break-words text-sm text-white/70">{subvalue}</div>
    </div>
  );
}

function formatDecision(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "bat") return "Bat first";
  if (normalized === "bowl" || normalized === "field") return "Bowl first";
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}
