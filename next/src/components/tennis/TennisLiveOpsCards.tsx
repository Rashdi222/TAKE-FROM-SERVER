"use client";

import type { TennisMatchState } from "@/lib/api";

type Props = {
  matches: TennisMatchState[];
};

function toNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function formatMoney(value: unknown) {
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    maximumFractionDigits: 0,
  }).format(toNumber(value));
}

export function TennisLiveOpsCards({ matches }: Props) {
  const liveMatches = matches.filter((match) => (match.status ?? "").toString() === "live" || match.tracking_status === "auto_live" || match.current_game_score);
  const totalVolume = liveMatches.reduce((sum, match) => sum + toNumber(match.matched_volume), 0);
  const totalBets = liveMatches.reduce((sum, match) => sum + (match.bet_count ?? 0), 0);
  const totalBettors = liveMatches.reduce((sum, match) => sum + (match.bettor_count ?? 0), 0);

  return (
    <section className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <StatCard label="Live Matches" value={String(liveMatches.length)} />
        <StatCard label="Open Bets" value={String(totalBets)} />
        <StatCard label="Active Bettors" value={String(totalBettors)} />
        <StatCard label="Matched Volume" value={formatMoney(totalVolume)} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {liveMatches.map((match) => {
          const liveOddsCount = Array.isArray(match.published_odds) ? match.published_odds.length : 0;
          return (
            <article
              key={match.event_key}
              className="rounded-[1.6rem] border border-white/10 bg-[linear-gradient(180deg,#07111b_0%,#050912_100%)] p-4 text-white"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-base font-semibold">{match.player_1_name || "Player 1"} vs {match.player_2_name || "Player 2"}</div>
                  <div className="mt-1 truncate text-[11px] text-white/45">
                    {(match.fixture_snapshot?.tournament_name as string | undefined) || "Live tournament"}
                  </div>
                </div>
                <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-emerald-200">
                  {match.workflow_label || "Live"}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <Metric label="Score" value={`${match.current_game_score || "-"} / ${match.current_point_score || "-"}`} />
                <Metric label="Server" value={match.server || "Pending"} />
                <Metric label="Odds" value={String(liveOddsCount)} />
                <Metric label="Bets" value={String(match.bet_count ?? 0)} />
                <Metric label="Bettors" value={String(match.bettor_count ?? 0)} />
                <Metric label="Volume" value={formatMoney(match.matched_volume)} />
              </div>

              <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-3 py-3">
                <div className="text-[11px] uppercase tracking-[0.2em] text-white/45">House Position</div>
                <div className={`mt-2 font-mono text-lg ${toNumber(match.house_position) >= 0 ? "text-emerald-200" : "text-rose-200"}`}>
                  {formatMoney(match.house_position)}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-white">
      <div className="text-[11px] uppercase tracking-[0.2em] text-white/45">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.18em] text-white/45">{label}</div>
      <div className="mt-1 text-sm text-white/85">{value}</div>
    </div>
  );
}
