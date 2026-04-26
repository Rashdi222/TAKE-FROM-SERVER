import { memo } from "react";
import { BadgeAlert, CircleDot, Shield } from "lucide-react";
import type { LiveBatter, LiveBowler } from "@/lib/cricket/liveData";

export const CricketActivePlayers = memo(function CricketActivePlayers({
  striker,
  nonStriker,
  bowler,
}: {
  striker: LiveBatter | null;
  nonStriker: LiveBatter | null;
  bowler: LiveBowler | null;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
      <div className="rounded-[1.3rem] border border-white/10 bg-black/20 p-4">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/45">
          <CircleDot className="h-4 w-4 text-emerald-200" /> Active Batters
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <BatterCard title="Striker" batter={striker} emphasize />
          <BatterCard title="Non-Striker" batter={nonStriker} />
        </div>
      </div>

      <div className="rounded-[1.3rem] border border-white/10 bg-black/20 p-4">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/45">
          <Shield className="h-4 w-4 text-cyan-200" /> Current Bowler
        </div>
        <div className="mt-4">
          <BowlerCard bowler={bowler} />
        </div>
      </div>
    </div>
  );
});

function BatterCard({ title, batter, emphasize = false }: { title: string; batter: LiveBatter | null; emphasize?: boolean }) {
  if (!batter) {
    return (
      <div className="rounded-[1.15rem] border border-amber-400/20 bg-amber-500/10 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-amber-100">
          <BadgeAlert className="h-4 w-4" /> New Batsman Incoming...
        </div>
        <div className="mt-3 h-3 w-28 animate-pulse rounded-full bg-white/10" />
        <div className="mt-2 h-9 animate-pulse rounded-[0.9rem] bg-white/[0.06]" />
      </div>
    );
  }

  return (
    <div className={["rounded-[1.15rem] border p-4", emphasize ? "border-emerald-400/20 bg-emerald-500/10" : "border-white/10 bg-white/[0.04]"].join(" ")}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">{title}</div>
      <div className="mt-2 text-lg font-semibold text-white">{batter.name}</div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
        {batter.team ? (
          <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1 text-cyan-100">
            {batter.team}
          </span>
        ) : null}
        {batter.role ? (
          <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-white/75">
            {batter.role}
          </span>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-white/75">
        <MetricPill label="Runs" value={valueOrDash(batter.runs)} />
        <MetricPill label="Balls" value={valueOrDash(batter.balls)} />
        <MetricPill label="4s" value={valueOrDash(batter.fours)} />
        <MetricPill label="6s" value={valueOrDash(batter.sixes)} />
        <MetricPill label="SR" value={valueOrDash(batter.strikeRate)} />
      </div>
    </div>
  );
}

function BowlerCard({ bowler }: { bowler: LiveBowler | null }) {
  if (!bowler) {
    return (
      <div className="rounded-[1.15rem] border border-white/10 bg-white/[0.04] p-4 text-sm text-white/60">
        Bowler figures are loading from the live feed.
      </div>
    );
  }

  return (
    <div className="rounded-[1.15rem] border border-cyan-400/20 bg-cyan-500/10 p-4">
      <div className="text-lg font-semibold text-white">{bowler.name}</div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
        {bowler.team ? (
          <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1 text-cyan-100">
            {bowler.team}
          </span>
        ) : null}
        {bowler.role ? (
          <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-white/75">
            {bowler.role}
          </span>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-white/75">
        <MetricPill label="Overs" value={bowler.overs || "-"} />
        <MetricPill label="Wkts" value={valueOrDash(bowler.wickets)} />
        <MetricPill label="Runs" value={valueOrDash(bowler.runs)} />
        <MetricPill label="Econ" value={valueOrDash(bowler.economy)} />
      </div>
    </div>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1">
      <span className="text-white/45">{label}</span> <span className="font-semibold text-white">{value}</span>
    </span>
  );
}

function valueOrDash(value: number | null) {
  return value == null ? "-" : Number.isInteger(value) ? String(value) : value.toFixed(1);
}
