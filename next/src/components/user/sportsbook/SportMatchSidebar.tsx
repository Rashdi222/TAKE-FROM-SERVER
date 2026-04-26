"use client";

import { Search, SlidersHorizontal } from "lucide-react";
import type { Match } from "@/lib/api";
import type { SportsbookSportItem } from "./sports";
import { SportMatchCard } from "./SportMatchCard";

type MatchViewFilter = "all" | "live" | "today" | "upcoming";

const FILTER_OPTIONS: Array<{ id: MatchViewFilter; label: string }> = [
  { id: "all", label: "All Boards" },
  { id: "live", label: "Live" },
  { id: "today", label: "Today" },
  { id: "upcoming", label: "Upcoming" },
];

export function SportMatchSidebar({
  sport,
  search,
  onSearchChange,
  filter,
  onFilterChange,
  matches,
  totalBoards,
  liveBoards,
  nextStartLabel,
  selectedMatchId,
  onSelectMatch,
  onViewLiveHud,
}: {
  sport: SportsbookSportItem;
  search: string;
  onSearchChange: (value: string) => void;
  filter: MatchViewFilter;
  onFilterChange: (value: MatchViewFilter) => void;
  matches: Match[];
  totalBoards: number;
  liveBoards: number;
  nextStartLabel: string;
  selectedMatchId: string | null;
  onSelectMatch: (match: Match) => void;
  onViewLiveHud: (match: Match) => void;
}) {
  const visibleCount = matches.length;

  return (
    <div className="flex h-full min-h-[36rem] flex-col overflow-hidden rounded-[1.6rem] border border-[var(--c-border-strong)] bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015))] shadow-[0_20px_48px_rgba(0,0,0,0.24)]">
      <div className="border-b border-[var(--c-border)] bg-[radial-gradient(circle_at_top_left,rgba(58,139,255,0.16),transparent_32%),rgba(10,13,22,0.68)] p-3.5 sm:p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--c-text-faint)]">
              {sport.label}
            </div>
            <div className="mt-1 text-sm font-semibold text-[var(--c-text)]">
              {totalBoards} active boards
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--c-text-faint)]">
              <span className="rounded-full border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] px-2 py-1">
                Live {liveBoards}
              </span>
              <span className="rounded-full border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] px-2 py-1">
                Next {nextStartLabel}
              </span>
              <span className="rounded-full border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] px-2 py-1">
                Visible {visibleCount}
              </span>
            </div>
          </div>
          <div className="rounded-[0.95rem] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] p-2.5">
            <sport.icon className={`h-5 w-5 ${sport.iconColor}`} />
          </div>
        </div>

        <div className="mt-3 rounded-[1rem] border border-[var(--c-border)] bg-[rgba(255,255,255,0.04)] p-2">
          <div className="flex min-h-[2.9rem] items-center gap-2 rounded-[0.95rem] bg-[rgba(7,10,18,0.45)] px-3 py-3 sm:min-h-0 sm:py-2.5">
            <Search className="h-4 w-4 text-[var(--c-text-faint)]" />
            <input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={`Search ${sport.shortLabel.toLowerCase()} matches`}
              className="w-full bg-transparent text-sm text-[var(--c-text)] outline-none placeholder:text-[var(--c-text-faint)]"
            />
            <SlidersHorizontal className="h-4 w-4 text-[var(--c-text-faint)]" />
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            {FILTER_OPTIONS.map((option) => {
              const active = option.id === filter;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onFilterChange(option.id)}
                  className={[
                    "inline-flex min-h-[2.4rem] touch-manipulation items-center gap-1.5 rounded-full border px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.13em] transition-colors sm:min-h-0 sm:px-2.5 sm:py-1.5",
                    active
                      ? "border-[var(--c-accent)] bg-[linear-gradient(135deg,rgba(99,32,232,0.24),rgba(58,139,255,0.16))] text-[var(--c-text)]"
                      : "border-[var(--c-border)] bg-[rgba(255,255,255,0.03)] text-[var(--c-text-muted)] hover:border-[var(--c-accent)] hover:text-[var(--c-text)]",
                  ].join(" ")}
                >
                  {option.label}
                  {active ? (
                    <span className="rounded-full bg-[rgba(255,255,255,0.12)] px-1.5 py-0.5 text-[9px] font-semibold">
                      {visibleCount}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-2.5">
        {matches.length === 0 ? (
          <div className="rounded-[1.25rem] border border-dashed border-[var(--c-border)] bg-[rgba(255,255,255,0.02)] p-6 text-center sm:p-5">
            <div className="text-sm font-semibold text-[var(--c-text)]">No matches in this view</div>
            <p className="mt-2 text-sm text-[var(--c-text-muted)]">
              Try another filter or clear the search to load the full board again.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5 pr-1">
            {matches.map((match) => (
              <SportMatchCard
                key={match.id}
                match={match}
                selected={selectedMatchId === match.id}
                onSelect={onSelectMatch}
                onViewLiveHud={onViewLiveHud}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
