import type { Match } from "@/lib/api";
import { extractCricketContext } from "@/lib/cricket/cricketContext";
import { CricketLineupBoard } from "./CricketLineupBoard";
import { CricketTossCard } from "./CricketTossCard";
import { CricketVenuePanel } from "./CricketVenuePanel";

export function CricketPrematchBoard({ match }: { match: Match }) {
  const cricketContext = extractCricketContext(match);

  return (
    <div className="grid gap-5">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <CricketVenuePanel context={cricketContext?.venue} />
        <CricketTossCard context={cricketContext?.lineup} />
      </div>
      <CricketLineupBoard context={cricketContext?.lineup} team1={match.team1} team2={match.team2} />
    </div>
  );
}
