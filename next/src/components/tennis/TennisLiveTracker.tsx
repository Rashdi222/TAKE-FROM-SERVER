"use client";

import { Button } from "@/components/ui/Button";
import type { TennisMatchState } from "@/lib/api";

type Props = {
  matches: TennisMatchState[];
  busyEventKey?: string | null;
  onStop: (eventKey: string) => void;
  connectionStatus?: string;
};

function renderSetLine(match: TennisMatchState) {
  const sets = Array.isArray(match.sets) ? match.sets : [];
  if (sets.length === 0) return "Sets pending";

  return sets
    .map((setRow) => {
      const left = setRow.player_1_games ?? "-";
      const right = setRow.player_2_games ?? "-";
      return `${left}-${right}`;
    })
    .join(" | ");
}

function WorkflowChip({ match }: { match: TennisMatchState }) {
  const state = match.tracking_status || "waiting_live_state";

  const tone =
    state === "published"
      ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-200"
      : state === "ready_to_publish"
        ? "border-amber-400/20 bg-amber-500/10 text-amber-200"
        : "border-white/10 bg-white/5 text-white/70";

  return (
    <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${tone}`}>
      {match.workflow_label || state.replace(/_/g, " ")}
    </span>
  );
}

export function TennisLiveTracker({ matches, busyEventKey, onStop, connectionStatus }: Props) {
  return (
    <section className="rounded-3xl border border-white/10 bg-[#07131e] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-cyan-300/70">Managed Matches</p>
          <h2 className="mt-1 text-lg font-semibold text-white">Step 3: monitor the matches you chose to manage</h2>
          <p className="mt-1 max-w-2xl text-xs leading-6 text-white/60">
            This view shows only the matches you pinned into your managed list. Public live tennis can still run automatically without being pinned here.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70">
            {matches.length} tracked
          </div>
          <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100/80">
            socket {connectionStatus || "connecting"}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[880px]">
          <div className="grid grid-cols-[2fr_1.4fr_1fr_120px_120px] border-b border-white/10 px-3 py-2 text-[10px] uppercase tracking-[0.24em] text-white/45">
            <div>Match</div>
            <div>Set / Game</div>
            <div>Point State</div>
            <div>Status</div>
            <div className="text-right">Action</div>
          </div>

          {matches.map((match) => (
            <div
              key={match.event_key}
              className="grid grid-cols-[2fr_1.4fr_1fr_120px_120px] items-center border-b border-white/5 px-3 py-2"
            >
              <div className="min-w-0">
                <div className="truncate text-sm text-white">{match.player_1_name || "Player 1"} vs {match.player_2_name || "Player 2"}</div>
                <div className="truncate text-[11px] text-white/45">
                  {(match.fixture_snapshot?.tournament_name as string | undefined) || "Tournament pending"}
                </div>
              </div>
              <div className="text-xs text-white/75">
                <div>{renderSetLine(match)}</div>
                <div className="text-[11px] text-white/45">{match.current_game_score || "Game pending"}</div>
              </div>
              <div className="text-xs text-white/75">
                <div>{match.current_point_score || "-"}</div>
                <div className="text-[11px] text-white/45">
                  {match.server ? `Serve: ${match.server}` : "Server pending"}
                </div>
              </div>
              <div className="text-xs text-white/75">
                <div><WorkflowChip match={match} /></div>
                <div className="mt-1 text-[11px] text-white/45">
                  {match.workflow_hint || match.event_status || "Waiting for live feed"}
                </div>
              </div>
              <div className="text-right">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onStop(match.event_key)}
                  disabled={busyEventKey === match.event_key}
                >
                  {busyEventKey === match.event_key ? "Stopping..." : "Stop"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
