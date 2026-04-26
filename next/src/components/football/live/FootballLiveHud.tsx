"use client";

import { memo } from "react";
import type { Match } from "@/lib/api";
import type { LiveConnectionStatus } from "@/lib/live/types";
import { extractFootballContext, resolveStatisticSides } from "@/lib/football/footballContext";
import { FootballEventTimeline } from "./FootballEventTimeline";
import { FootballLiveScorecard } from "./FootballLiveScorecard";
import { FootballMatchStats } from "./FootballMatchStats";
import { FootballMomentumWave } from "./FootballMomentumWave";

export const FootballLiveHud = memo(function FootballLiveHud({
  match,
  connectionStatus,
  marketSuspended = false,
  compact = false,
  dataHealth,
}: {
  match: Match;
  connectionStatus: LiveConnectionStatus;
  marketSuspended?: boolean;
  compact?: boolean;
  dataHealth?: {
    degraded: boolean;
    warning: string | null;
    consensusSourceCount: number;
    degradedSources: string[];
  };
}) {
  const context = extractFootballContext(match);
  const statSides = resolveStatisticSides(match, context);
  const competitionName = String(match.competition?.name || match.season_name || "Football");
  const venueName = String(match.venue_name || context?.venue?.name || "Venue pending");

  return (
    <div className="space-y-4">
      <FootballLiveScorecard
        match={match}
        competitionName={competitionName}
        venueName={venueName}
        connectionStatus={connectionStatus}
        marketSuspended={marketSuspended}
        compact={compact}
        dataHealth={dataHealth}
      />
      <div className={compact ? "space-y-3" : "grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]"}>
        <FootballMatchStats home={statSides.home} away={statSides.away} health={context?.meta?.statistics} compact={compact} />
        {!compact ? <FootballMomentumWave context={context} /> : null}
      </div>
      <FootballEventTimeline events={context?.events} health={context?.meta?.events} compact={compact} />
    </div>
  );
});
