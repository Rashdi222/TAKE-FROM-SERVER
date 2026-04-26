"use client";

import type { TennisMatchState } from "@/lib/api";
import { extractTennisContext } from "@/lib/tennis/tennisContext";
import { TennisCourtSurface } from "./TennisCourtSurface";
import { TennisPlayerProfiles } from "./TennisPlayerProfiles";
import { TennisTournamentPanel } from "./TennisTournamentPanel";

export function TennisPrematchBoard({ match }: { match: TennisMatchState }) {
  const context = extractTennisContext(match);

  return (
    <div className="grid gap-5">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
        <TennisTournamentPanel context={context} />
        <TennisCourtSurface surface={context?.surface} />
      </div>
      <TennisPlayerProfiles
        context={context}
        player1Name={match.player_1_name}
        player2Name={match.player_2_name}
      />
    </div>
  );
}
