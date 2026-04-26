"use client";

import { BadgeInfo, Trophy } from "lucide-react";
import type { TennisContext, TennisPlayerContext } from "@/lib/tennis/tennisContext";

export function TennisPlayerProfiles({
  context,
  player1Name,
  player2Name,
}: {
  context: TennisContext | null;
  player1Name?: string | null;
  player2Name?: string | null;
}) {
  const left = context?.players?.player_1 ?? null;
  const right = context?.players?.player_2 ?? null;

  return (
    <section className="rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(8,14,24,0.96)_0%,rgba(5,9,16,0.98)_100%)] p-5 text-white shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.28em] text-white/45">Player Profiles</p>
          <h2 className="mt-2 text-xl font-semibold tracking-[-0.04em]">Who owns the matchup</h2>
        </div>
        <div className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1.5 text-xs text-cyan-100/85">
          Ranking view
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_120px_minmax(0,1fr)]">
        <PlayerCard player={left} fallbackName={player1Name || "Player 1"} tone="left" />
        <div className="flex items-center justify-center">
          <div className="rounded-[1.8rem] border border-white/10 bg-white/[0.04] px-6 py-5 text-center">
            <div className="text-[11px] uppercase tracking-[0.32em] text-white/35">Versus</div>
            <div className="mt-2 text-3xl font-semibold tracking-[-0.08em] text-white">VS</div>
            <div className="mt-2 text-xs text-white/55">First serve pressure</div>
          </div>
        </div>
        <PlayerCard player={right} fallbackName={player2Name || "Player 2"} tone="right" />
      </div>
    </section>
  );
}

function PlayerCard({
  player,
  fallbackName,
  tone,
}: {
  player: TennisPlayerContext | null;
  fallbackName: string;
  tone: "left" | "right";
}) {
  const toneClasses =
    tone === "left"
      ? "from-cyan-500/15 to-transparent border-cyan-400/20"
      : "from-orange-500/15 to-transparent border-orange-400/20";

  return (
    <div className={`rounded-[1.8rem] border bg-gradient-to-br ${toneClasses} p-5`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-lg font-semibold tracking-[-0.03em] text-white">{player?.name || fallbackName}</div>
          <div className="mt-1 text-sm text-white/55">{player?.country || "Tour profile loading"}</div>
        </div>
        {player?.rank ? (
          <div className="rounded-full border border-white/12 bg-black/20 px-3 py-1.5 text-xs font-medium text-white">
            World No. {player.rank}
          </div>
        ) : null}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Metric icon={Trophy} label="Ranking Points" value={player?.points || "Unlisted"} />
        <Metric icon={BadgeInfo} label="Movement" value={player?.movement || "Flat"} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-white/65">
        {player?.profile?.handedness ? (
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
            {player.profile.handedness}
          </span>
        ) : null}
        {player?.profile?.age ? (
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
            Age {player.profile.age}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Trophy;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[1.2rem] border border-white/8 bg-black/15 p-3">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-white/40">
        <Icon className="h-3.5 w-3.5 text-cyan-300/70" />
        <span>{label}</span>
      </div>
      <div className="mt-2 text-sm font-medium text-white/90">{value}</div>
    </div>
  );
}
