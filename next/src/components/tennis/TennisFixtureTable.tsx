"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { TennisFixture } from "@/lib/api";

type Props = {
  fixtures: TennisFixture[];
  busyEventKey?: string | null;
  trackedEventKeys?: string[];
  onTrack: (fixture: TennisFixture) => void;
};

const PAGE_SIZE = 25;

export function TennisFixtureTable({ fixtures, busyEventKey, trackedEventKeys = [], onTrack }: Props) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return fixtures;

    return fixtures.filter((fixture) =>
      [
        fixture.tournament_name,
        fixture.player_1_name,
        fixture.player_2_name,
        fixture.round_name,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle)),
    );
  }, [fixtures, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <section className="rounded-3xl border border-white/10 bg-[#07131e] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
      <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-cyan-300/70">Tennis Fixtures</p>
          <h2 className="mt-1 text-lg font-semibold text-white">Step 1: queue upcoming matches</h2>
          <p className="mt-1 max-w-2xl text-xs leading-6 text-white/60">
            These are upcoming schedule rows, not live odds rows. Track here when you want the backend ready before the match starts. Use the Live Now tab for matches already in play.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search players or tournament"
            className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none placeholder:text-white/35 md:w-72"
          />
          <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70">
            {filtered.length} rows
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[920px]">
          <div className="grid grid-cols-[2fr_2fr_140px_100px_120px] border-b border-white/10 px-3 py-2 text-[10px] uppercase tracking-[0.24em] text-white/45">
            <div>Tournament</div>
            <div>Players</div>
            <div>Start</div>
            <div>Round</div>
            <div className="text-right">Action</div>
          </div>

          {paged.map((fixture) => {
            const tracked = trackedEventKeys.includes(fixture.event_key);
            const pending = busyEventKey === fixture.event_key;

            return (
              <div
                key={fixture.event_key}
                className="grid grid-cols-[2fr_2fr_140px_100px_120px] items-center border-b border-white/5 px-3 py-2 text-sm text-white/90"
              >
              <div className="min-w-0">
                <div className="truncate font-medium">{fixture.tournament_name || "Unknown tournament"}</div>
                <div className="flex items-center gap-2 truncate text-[11px] text-white/45">
                  <span>{fixture.court_name || "Court pending"}</span>
                  {tracked ? (
                    <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-emerald-200">
                      Tracking
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="min-w-0">
                <div className="truncate">{fixture.player_1_name || "TBD"}</div>
                <div className="truncate text-[11px] text-white/45">{fixture.player_2_name || "TBD"}</div>
              </div>
              <div className="text-xs text-white/70">{fixture.start_time || "-"}</div>
              <div className="truncate text-xs text-white/70">{fixture.round_name || "-"}</div>
              <div className="text-right">
                <Button
                  size="sm"
                  onClick={() => onTrack(fixture)}
                  disabled={pending || tracked}
                  className="rounded-xl"
                >
                    {pending ? "Starting..." : tracked ? "Tracking" : "Queue Tracking"}
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
          <Button
            size="sm"
            variant="ghost"
            disabled={currentPage >= totalPages}
            onClick={() => setPage((value) => value + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </section>
  );
}
