"use client";

import type { Match } from "@/lib/api";
import { extractFootballContext } from "@/lib/football/footballContext";
import { FootballLineupPitch } from "./FootballLineupPitch";
import { FootballStandingsCard } from "./FootballStandingsCard";
import { FootballVenuePanel } from "./FootballVenuePanel";

export function FootballPrematchBoard({ match }: { match: Match }) {
  const context = extractFootballContext(match);

  return (
    <div className="space-y-5">
      <FootballVenuePanel context={context} />
      <FootballLineupPitch match={match} context={context} />
      <FootballStandingsCard match={match} context={context} />
    </div>
  );
}
