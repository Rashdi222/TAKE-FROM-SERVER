"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { TennisMatchState } from "@/lib/api";

type Props = {
  matches: TennisMatchState[];
  busyEventKey?: string | null;
  trackedEventKeys?: string[];
  onTrack: (match: TennisMatchState) => void;
};

const PAGE_SIZE = 20;

export function TennisLiveDiscoveryTable({ matches, busyEventKey, trackedEventKeys = [], onTrack }: Props) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return matches;

    return matches.filter((match) =>
      [
        match.player_1_name,
        match.player_2_name,
        match.fixture_snapshot?.tournament_name,
        match.event_status,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle)),
    );
  }, [matches, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <section className="rounded-3xl border border-white/10 bg-[#07131e] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
      <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-rose-300/70">Provider Live Matches</p>
          <h2 className="mt-1 text-lg font-semibold text-white">Step 2: manage matches already live right now</h2>
          <p className="mt-1 max-w-2xl text-xs leading-6 text-white/60">
            This is the real live discovery lane. These rows are already live at API Tennis. Live odds can go public automatically when provider prices exist. Add a row here only if you want it pinned into your managed list.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search live players or tournament"
            className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none placeholder:text-white/35 md:w-72"
          />
          <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70">
            {filtered.length} live
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[980px]">
          <div className="grid grid-cols-[2fr_1.6fr_1fr_1fr_130px] border-b border-white/10 px-3 py-2 text-[10px] uppercase tracking-[0.24em] text-white/45">
            <div>Match</div>
            <div>Set / Point</div>
            <div>Server</div>
            <div>Status</div>
            <div className="text-right">Action</div>
          </div>

          {paged.map((match) => {
            const tracked = trackedEventKeys.includes(match.event_key);
            const pending = busyEventKey === match.event_key;

            return (
              <div
                key={match.event_key}
                className="grid grid-cols-[2fr_1.6fr_1fr_1fr_130px] items-center border-b border-white/5 px-3 py-2 text-sm text-white/90"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{match.player_1_name || "Player 1"} vs {match.player_2_name || "Player 2"}</div>
                  <div className="truncate text-[11px] text-white/45">
                    {(match.fixture_snapshot?.tournament_name as string | undefined) || "Live tournament"}
                  </div>
                </div>
                <div className="text-xs text-white/70">
                  <div>{match.current_game_score || "Live game"}</div>
                  <div className="text-[11px] text-white/45">{match.current_point_score || match.event_status || "-"}</div>
                </div>
                <div className="truncate text-xs text-white/70">{match.server || "Serve pending"}</div>
                <div className="text-xs text-white/70">
                  <div>{match.workflow_label || "Live now"}</div>
                  <div className="text-[11px] text-white/45">{match.event_status || "Live"}</div>
                </div>
                <div className="text-right">
                  <Button
                    size="sm"
                    onClick={() => onTrack(match)}
                    disabled={pending || tracked}
                    className="rounded-xl"
                  >
                    {pending ? "Starting..." : tracked ? "Managed" : "Manage Live"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-white/55">
        <span>
          Page {currentPage} / {totalPages}
        </span>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" disabled={currentPage <= 1} onClick={() => setPage((value) => value - 1)}>
            Prev
          </Button>
          <Button size="sm" variant="ghost" disabled={currentPage >= totalPages} onClick={() => setPage((value) => value + 1)}>
            Next
          </Button>
        </div>
      </div>
    </section>
  );
}
