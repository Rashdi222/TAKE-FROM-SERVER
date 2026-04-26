"use client";

import { memo } from "react";
import { RadioTower } from "lucide-react";
import { TennisServerIndicator } from "./TennisServerIndicator";

type SetRow = {
  set?: string | number | null;
  player_1?: string | number | null;
  player_2?: string | number | null;
};

export const TennisLiveScorecard = memo(function TennisLiveScorecard({
  player1Name,
  player2Name,
  serverSide,
  statusLabel,
  currentGame1,
  currentGame2,
  pointScore,
  sets,
  breakPoint,
  setPoint,
  matchPoint,
}: {
  player1Name: string;
  player2Name: string;
  serverSide: "player_1" | "player_2" | "unknown";
  statusLabel: string;
  currentGame1: string;
  currentGame2: string;
  pointScore: string;
  sets: SetRow[];
  breakPoint: boolean;
  setPoint: boolean;
  matchPoint: boolean;
}) {
  const pulseTone = matchPoint
    ? "border-amber-400/60 bg-amber-500/12 shadow-[0_0_0_1px_rgba(251,191,36,0.18),0_0_32px_rgba(251,191,36,0.16)]"
    : setPoint
      ? "border-orange-400/55 bg-orange-500/10 shadow-[0_0_0_1px_rgba(251,146,60,0.18),0_0_24px_rgba(251,146,60,0.12)]"
      : breakPoint
        ? "border-rose-400/55 bg-rose-500/10 shadow-[0_0_0_1px_rgba(244,63,94,0.18),0_0_28px_rgba(244,63,94,0.12)] animate-[pulse_1.7s_ease-in-out_infinite]"
        : "border-white/10 bg-[linear-gradient(180deg,#08131f_0%,#050b12_100%)]";

  return (
    <section className={`rounded-[2rem] border p-5 text-white transition-[background-color,border-color,box-shadow] duration-300 ${pulseTone}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.28em] text-white/45">Live Command Center</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">
            {player1Name} vs {player2Name}
          </h1>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-red-400/25 bg-red-500/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-red-100">
          <RadioTower className="h-3.5 w-3.5" />
          {statusLabel}
        </div>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_220px]">
        <div>
          <div className="grid gap-2 sm:hidden">
            {[
              { side: "player_1" as const, name: player1Name, game: currentGame1 },
              { side: "player_2" as const, name: player2Name, game: currentGame2 },
            ].map((player) => (
              <div key={player.side} className="rounded-[1.3rem] border border-white/8 bg-black/15 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{player.name}</div>
                    <div className="mt-1">
                      <TennisServerIndicator active={serverSide === player.side} />
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-white/40">Game</div>
                    <div className="mt-1 text-3xl font-semibold tracking-[-0.08em] text-white">{player.game}</div>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2">
                  {(sets.length ? sets : [{}, {}, {}]).map((row, index) => (
                    <div key={`${player.side}-${index}`} className="rounded-xl border border-white/6 bg-white/[0.03] px-2 py-2 text-center">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-white/35">Set {index + 1}</div>
                      <div className="mt-1 font-mono text-sm text-white/90">
                        {player.side === "player_1" ? String(row.player_1 ?? "-") : String(row.player_2 ?? "-")}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="hidden overflow-x-auto sm:block">
            <div className="min-w-[560px]">
              <div className="grid grid-cols-[minmax(220px,2fr)_repeat(3,minmax(72px,1fr))_120px] border-b border-white/10 px-3 py-2 text-[10px] uppercase tracking-[0.28em] text-white/40">
              <div>Player</div>
              {(sets.length ? sets : [{ set: 1 }, { set: 2 }, { set: 3 }]).map((row) => (
                <div key={`set-${String(row.set ?? "x")}`} className="text-center">
                  Set {String(row.set ?? "")}
                </div>
              ))}
              <div className="text-center">Game</div>
            </div>

              {[
                { side: "player_1" as const, name: player1Name, game: currentGame1 },
                { side: "player_2" as const, name: player2Name, game: currentGame2 },
              ].map((player) => (
                <div key={player.side} className="grid grid-cols-[minmax(220px,2fr)_repeat(3,minmax(72px,1fr))_120px] items-center border-b border-white/5 px-3 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{player.name}</div>
                      <div className="mt-1">
                        <TennisServerIndicator active={serverSide === player.side} />
                      </div>
                    </div>
                  </div>

                  {(sets.length ? sets : [{}, {}, {}]).map((row, index) => (
                    <div key={`${player.side}-${index}`} className="text-center font-mono text-sm text-white/85">
                      {player.side === "player_1" ? String(row.player_1 ?? "-") : String(row.player_2 ?? "-")}
                    </div>
                  ))}

                  <div className="text-center text-3xl font-semibold tracking-[-0.08em] text-white">
                    {player.game}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-[1.5rem] border border-white/10 bg-black/15 p-4 sm:rounded-[1.8rem]">
          <div className="text-[11px] uppercase tracking-[0.24em] text-white/40">Current Point</div>
          <div className="mt-4 text-center text-4xl font-semibold tracking-[-0.1em] text-white sm:text-5xl md:text-6xl">
            {pointScore}
          </div>
        </div>
      </div>
    </section>
  );
});
