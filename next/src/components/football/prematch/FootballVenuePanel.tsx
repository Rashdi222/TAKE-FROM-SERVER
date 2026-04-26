"use client";

import type { ReactNode } from "react";
import { MapPin, Shield, Trophy } from "lucide-react";
import type { FootballContext } from "@/lib/football/footballContext";

export function FootballVenuePanel({ context }: { context: FootballContext | null }) {
  const venueName = context?.venue?.name || "Venue pending";
  const venueCity = context?.venue?.city || "City not confirmed yet";
  const referee = context?.officials?.referee || "Referee to be confirmed";

  return (
    <div className="rounded-[calc(var(--r-xl)+2px)] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur-xl">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--c-text-faint)]">
        <Trophy className="h-4 w-4 text-emerald-300" />
        Match Venue
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <InfoTile
          icon={<MapPin className="h-4 w-4 text-sky-300" />}
          label="Stadium"
          value={venueName}
        />
        <InfoTile
          icon={<MapPin className="h-4 w-4 text-amber-300" />}
          label="City"
          value={venueCity}
        />
        <InfoTile
          icon={<Shield className="h-4 w-4 text-violet-300" />}
          label="Referee"
          value={referee}
        />
      </div>
    </div>
  );
}

function InfoTile({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[var(--r-lg)] border border-white/8 bg-[rgba(255,255,255,0.03)] px-4 py-4">
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--c-text-faint)]">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-sm font-semibold text-white">{value}</div>
    </div>
  );
}
