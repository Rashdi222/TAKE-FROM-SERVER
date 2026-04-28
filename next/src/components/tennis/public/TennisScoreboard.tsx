"use client";

import { CircleDot, Flame, Sparkles, Target } from "lucide-react";
import type { TennisMatchState } from "@/lib/api";

type Props = {
  match: TennisMatchState;
};

function scoreTone(match: TennisMatchState) {
  if (match.match_point) return "border-amber-400/60 bg-amber-500/10 shadow-[0_0_0_1px_rgba(251,191,36,0.18),0_0_28px_rgba(251,191,36,0.16)]";
  if (match.set_point) return "border-orange-400/60 bg-orange-500/10 shadow-[0_0_0_1px_rgba(251,146,60,0.18),0_0_24px_rgba(251,146,60,0.14)]";
  if (match.break_point) return "border-rose-400/60 bg-rose-500/10 shadow-[0_0_0_1px_rgba(244,63,94,0.18),0_0_24px_rgba(244,63,94,0.12)]";
  if (match.tiebreak) return "border-cyan-400/60 bg-cyan-500/10";
  return "border-white/10 bg-[linear-gradient(180deg,#08131f_0%,#050b12_100%)]";
}

function pointLabel(value?: string | null) {
  if (!value) return "-";
  const normalized = value.toLowerCase();
  if (normalized === "0") return "Love";
  if (normalized === "deuce") return "Deuce";
  return value;
}

export function TennisScoreboard({ match }: Props) {
  const score = match.score as
    | {
        sets?: { player_1?: number; player_2?: number; rows?: Array<{ set?: number; player_1?: number | string; player_2?: number | string }> };
        current_game?: { player_1?: string; player_2?: string };
        server?: "player_1" | "player_2" | "unknown";
        mode?: string;
      }
    | undefined;

  const rows = score?.sets?.rows ?? [];
  const server = score?.server ?? "unknown";

  return (
    <section className={`rounded-[2rem] border p-5 text-white ${scoreTone(match)}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.28em] text-white/45">Live Court</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">
            {match.player_1_name || "Player 1"} vs {match.player_2_name || "Player 2"}
          </h1>
          <p className="mt-2 text-sm text-white/60">{match.event_status || "Live update feed active"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {match.tiebreak ? (
            <span className="rounded-full border border-cyan-400/40 bg-cyan-500/10 px-3 py-1 text-cyan-100">
              Tiebreak
            </span>
          ) : null}
          {match.break_point ? (
            <span className="rounded-full border border-rose-400/40 bg-rose-500/10 px-3 py-1 text-rose-100">
              Break Point
            </span>
          ) : null}
          {match.set_point ? (
            <span className="rounded-full border border-orange-400/40 bg-orange-500/10 px-3 py-1 text-orange-100">
              Set Point
            </span>
          ) : null}
          {match.match_point ? (
            <span className="rounded-full border border-amber-400/40 bg-amber-500/10 px-3 py-1 text-amber-100">
              Match Point
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-6 overflow-x-auto">
        <div className="min-w-[720px]">
          <div className="grid grid-cols-[minmax(220px,2fr)_repeat(5,minmax(72px,1fr))] border-b border-white/10 px-3 py-2 text-[10px] uppercase tracking-[0.28em] text-white/40">
            <div>Player</div>
            {(rows.length > 0 ? rows : Array.from({ length: 3 }, (_, index) => ({ set: index + 1 }))).map((row) => (
              <div key={`set-${String(row.set ?? "x")}`} className="text-center">
                Set {String(row.set ?? "")}
              </div>
            ))}
            <div className="text-center">Game</div>
            <div className="text-center">Point</div>
          </div>

          {[
            { side: "player_1", name: match.player_1_name || "Player 1", score: score?.current_game?.player_1 },
            { side: "player_2", name: match.player_2_name || "Player 2", score: score?.current_game?.player_2 },
          ].map((player) => (
            <div
              key={player.side}
              className="grid grid-cols-[minmax(220px,2fr)_repeat(5,minmax(72px,1fr))] items-center border-b border-white/5 px-3 py-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/75">
                  {server === player.side ? <CircleDot className="h-4 w-4 text-lime-300" /> : <Target className="h-4 w-4" />}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{player.name}</div>
                  <div className="flex items-center gap-2 text-[11px] text-white/45">
                    {server === player.side ? (
                      <>
                        <span className="inline-flex items-center gap-1 text-lime-300">
                          <Sparkles className="h-3 w-3" />
                          Serve
                        </span>
                      </>
                    ) : (
                      <span>Receiving</span>
                    )}
                    {match.advantage_player === player.name ? (
                      <span className="inline-flex items-center gap-1 text-amber-200">
                        <Flame className="h-3 w-3" />
                        Advantage
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

              {(rows.length > 0 ? rows : Array.from({ length: 3 }, () => ({} as { set?: number; player_1?: number | string; player_2?: number | string }))).map((row, index) => (
                <div key={`${player.side}-${index}`} className="text-center font-mono text-sm text-white/85">
                  {player.side === "player_1"
                    ? String(row.player_1 ?? "-")
                    : String(row.player_2 ?? "-")}
                </div>
              ))}

              <div className="text-center font-mono text-sm text-white/90">
                {player.side === "player_1"
                  ? pointLabel(match.current_game_score?.split("-")[0]?.trim())
                  : pointLabel(match.current_game_score?.split("-")[1]?.trim())}
              </div>
              <div className="text-center font-mono text-base font-semibold text-white">
                {pointLabel(player.score)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
