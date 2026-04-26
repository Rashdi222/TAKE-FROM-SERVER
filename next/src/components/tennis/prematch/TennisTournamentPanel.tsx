"use client";

import { Landmark, Layers3, MapPin } from "lucide-react";
import type { TennisContext } from "@/lib/tennis/tennisContext";

export function TennisTournamentPanel({ context }: { context: TennisContext | null }) {
  const tournament = context?.tournament;
  const location = [tournament?.event_type, tournament?.court_name].filter(Boolean).join(" • ");

  return (
    <section className="rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(7,16,27,0.94)_0%,rgba(4,8,14,0.96)_100%)] p-5 text-white shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.28em] text-cyan-200/55">Tournament Desk</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">
            {tournament?.name || "Tournament details pending"}
          </h2>
        </div>
        {tournament?.tier ? (
          <div className="rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-100">
            {tournament.tier}
          </div>
        ) : null}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <InfoCard icon={Landmark} label="Round" value={tournament?.round || "Awaiting draw update"} />
        <InfoCard icon={Layers3} label="Season" value={tournament?.season || "Current season"} />
        <InfoCard icon={MapPin} label="Location" value={location || "Venue details pending"} />
      </div>
    </section>
  );
}

function InfoCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Landmark;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[1.4rem] border border-white/8 bg-white/[0.04] p-4">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-white/45">
        <Icon className="h-3.5 w-3.5 text-cyan-300/75" />
        <span>{label}</span>
      </div>
      <div className="mt-3 text-sm font-medium text-white/90">{value}</div>
    </div>
  );
}
