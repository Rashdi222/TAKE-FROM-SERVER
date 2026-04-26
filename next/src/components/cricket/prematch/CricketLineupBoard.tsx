import { ShieldCheck, UsersRound } from "lucide-react";
import { Card } from "@/components/ui/Card";
import type { CricketLineupContext, CricketLineupPlayer } from "@/lib/cricket/cricketContext";

export function CricketLineupBoard({
  context,
  team1,
  team2,
}: {
  context: CricketLineupContext | null | undefined;
  team1?: string | null;
  team2?: string | null;
}) {
  const lineup = Array.isArray(context?.lineup) ? context?.lineup : [];
  const grouped = groupLineup(lineup, team1, team2);
  const announced = grouped.home.length > 0 || grouped.away.length > 0;

  if (!announced) {
    return <AwaitingLineupsCard />;
  }

  return (
    <Card
      variant="surface-1"
      className="border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.015))] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.2)]"
    >
      <div className="flex items-center gap-3">
        <div className="rounded-2xl border border-fuchsia-400/20 bg-fuchsia-400/10 p-2.5 text-fuchsia-200">
          <UsersRound className="h-5 w-5" />
        </div>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/45">Playing XI</div>
          <div className="mt-1 text-xl font-semibold tracking-[-0.04em] text-white">Confirmed lineup board</div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <LineupTeamCard title={team1 || grouped.homeTeamName || "Home XI"} players={grouped.home} tone="cyan" />
        <LineupTeamCard title={team2 || grouped.awayTeamName || "Away XI"} players={grouped.away} tone="amber" />
      </div>
    </Card>
  );
}

function groupLineup(lineup: CricketLineupPlayer[], team1?: string | null, team2?: string | null) {
  const homeTeamName = lineup.find((player) => player.team_name && player.team_name === team1)?.team_name || lineup[0]?.team_name || null;
  const awayTeamName = lineup.find((player) => player.team_name && player.team_name !== homeTeamName)?.team_name || lineup.find((player) => player.team_name === team2)?.team_name || null;

  return {
    homeTeamName,
    awayTeamName,
    home: lineup.filter((player) => player.team_name === homeTeamName),
    away: lineup.filter((player) => player.team_name !== homeTeamName),
  };
}

function LineupTeamCard({ title, players, tone }: { title: string; players: CricketLineupPlayer[]; tone: "cyan" | "amber" }) {
  const toneClass =
    tone === "cyan"
      ? "border-cyan-400/15 bg-cyan-400/[0.06]"
      : "border-amber-400/15 bg-amber-400/[0.06]";

  return (
    <div className={["rounded-[1.2rem] border p-4", toneClass].join(" ")}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-base font-semibold text-white">{title}</div>
        <div className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/55">
          {players.length} listed
        </div>
      </div>

      <div className="mt-4 grid gap-2">
        {players.map((player, index) => (
          <div key={`${player.player_id || player.player_name || index}`} className="flex items-center justify-between gap-3 rounded-[0.95rem] border border-white/8 bg-black/20 px-3 py-2.5">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-white">{player.player_name || `Player ${index + 1}`}</div>
              <div className="mt-1 text-xs uppercase tracking-[0.14em] text-white/42">
                {player.position || player.role || "Squad"}
              </div>
            </div>
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/70">
              {player.captain ? <RoleChip label="C" /> : null}
              {player.wicketkeeper ? <RoleChip label="WK" /> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RoleChip({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-emerald-100">
      {label}
    </span>
  );
}

function AwaitingLineupsCard() {
  return (
    <Card
      variant="surface-1"
      className="overflow-hidden border-white/10 bg-[linear-gradient(135deg,rgba(31,41,55,0.86),rgba(9,13,24,0.94))] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.2)]"
    >
      <div className="flex items-center gap-3">
        <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-2.5 text-white/75">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/45">Playing XI</div>
          <div className="mt-1 text-xl font-semibold tracking-[-0.04em] text-white">Awaiting toss & lineups</div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        {[0, 1].map((column) => (
          <div key={column} className="rounded-[1.2rem] border border-white/8 bg-white/[0.04] p-4">
            <div className="h-4 w-28 animate-pulse rounded-full bg-white/10" />
            <div className="mt-4 grid gap-2">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="h-11 animate-pulse rounded-[0.95rem] bg-[linear-gradient(90deg,rgba(255,255,255,0.05),rgba(255,255,255,0.1),rgba(255,255,255,0.05))] bg-[length:200%_100%] [animation:shimmer_1.5s_linear_infinite]" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
