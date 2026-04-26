"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, CalendarDays, Clock3, LoaderCircle, Orbit, Radio } from "lucide-react";
import { useQueries } from "@tanstack/react-query";
import { publicApi, type Match } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import {
  isRenderablePublicMatch,
  matchCompetitionKey,
  matchCompetitionName,
  matchScoreSummary,
  readableSport,
  SPORT_OPTIONS,
} from "@/lib/public-matches/lobby";
import { hasExplicitNonLiveHoldStatus, hasLiveSignals } from "@/lib/matches/liveStatus";

type MatchFilterKey = "live" | "today" | "week" | "month" | "upcoming";

const FILTER_TABS: Array<{ key: MatchFilterKey; label: string; icon: typeof Radio }> = [
  { key: "live", label: "Live", icon: Radio },
  { key: "upcoming", label: "Upcoming", icon: CalendarDays },
  { key: "today", label: "Today", icon: Clock3 },
  { key: "week", label: "Week", icon: CalendarDays },
  { key: "month", label: "Month", icon: Orbit },
];

export function MatchesPageClient({
  initialSport = "all",
  lockSport = false,
}: {
  initialSport?: string;
  lockSport?: boolean;
  stickyOffsetClass?: string;
} = {}) {
  const [sport, setSport] = useState<string>(initialSport);
  const [competition, setCompetition] = useState<string>("all");
  const [activeFilter, setActiveFilter] = useState<MatchFilterKey | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const LIVE_SYNC_INTERVAL_MS = 4_000;
  const sportScope = lockSport || sport !== "all" ? sport : undefined;

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), LIVE_SYNC_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, []);

  const [liveQuery, upcomingQuery] = useQueries({
    queries: [
      {
        queryKey: ["public-matches-v2", "live", sportScope],
        queryFn: () =>
          publicApi.matches.list({
            state_bucket: "live",
            sport: sportScope,
            limit: 96,
          }),
        staleTime: LIVE_SYNC_INTERVAL_MS,
        refetchInterval: LIVE_SYNC_INTERVAL_MS,
        refetchIntervalInBackground: true,
        refetchOnWindowFocus: true,
      },
      {
        queryKey: ["public-matches-v2", "upcoming", sportScope],
        queryFn: () =>
          publicApi.matches.list({
            state_bucket: "upcoming",
            quality_mode: "public",
            sport: sportScope,
            limit: 320,
          }),
        staleTime: LIVE_SYNC_INTERVAL_MS,
        refetchInterval: LIVE_SYNC_INTERVAL_MS,
        refetchIntervalInBackground: true,
        refetchOnWindowFocus: true,
      },
    ],
  });

  const allMatches = useMemo(() => {
    const rows = [
      ...(((liveQuery.data as { data?: Match[] } | undefined)?.data ?? []) as Match[]),
      ...(((upcomingQuery.data as { data?: Match[] } | undefined)?.data ?? []) as Match[]),
    ];

    const deduped = new Map<string, Match>();

    for (const match of rows) {
      const existing = deduped.get(match.id);
      deduped.set(match.id, choosePreferredMatch(existing, match, nowMs));
    }

    return Array.from(deduped.values())
      .filter(isRenderablePublicMatch)
      .filter((match) => !isExpiredUpcomingMatch(match, nowMs))
      .sort((left, right) => compareMatches(left, right, nowMs));
  }, [liveQuery.data, nowMs, upcomingQuery.data]);

  const liveCount = useMemo(
    () => allMatches.filter((match) => effectiveMatchStatus(match, nowMs) === "live").length,
    [allMatches, nowMs],
  );

  const defaultFilter: MatchFilterKey = liveCount > 0 ? "live" : "upcoming";
  const effectiveFilter = activeFilter ?? defaultFilter;

  const filterCounts = useMemo(() => {
    const now = new Date(nowMs);
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfTomorrow = startOfToday + 24 * 60 * 60 * 1000;
    const endOfWeek = startOfToday + 7 * 24 * 60 * 60 * 1000;
    const endOfMonth = startOfToday + 30 * 24 * 60 * 60 * 1000;

    const counts: Record<MatchFilterKey, number> = {
      live: 0,
      upcoming: 0,
      today: 0,
      week: 0,
      month: 0,
    };

    allMatches.forEach((match) => {
      const effectiveStatus = effectiveMatchStatus(match, nowMs);
      const isLive = effectiveStatus === "live" || effectiveStatus === "starting";
      if (isLive) counts.live += 1;

      const startMs = match.start_time ? new Date(String(match.start_time)).getTime() : Number.NaN;
      if (!Number.isFinite(startMs)) return;
      if (!isLive && startMs >= nowMs) counts.upcoming += 1;
      if (startMs >= startOfToday && startMs < startOfTomorrow) counts.today += 1;
      if (startMs >= startOfToday && startMs < endOfWeek) counts.week += 1;
      if (startMs >= startOfToday && startMs < endOfMonth) counts.month += 1;
    });

    return counts;
  }, [allMatches, nowMs]);

  const competitionOptions = useMemo(() => {
    const items = allMatches
      .filter((match) => (lockSport || sport === "all" ? true : match.sport === sport))
      .map((match) => ({
        key: matchCompetitionKey(match) || matchCompetitionName(match),
        label: matchCompetitionName(match),
      }));

    const deduped = new Map<string, string>();
    for (const item of items) {
      if (!deduped.has(item.key)) deduped.set(item.key, item.label);
    }

    return [
      { key: "all", label: "All Competitions" },
      ...Array.from(deduped.entries())
        .sort((a, b) => a[1].localeCompare(b[1]))
        .map(([key, label]) => ({ key, label })),
    ];
  }, [allMatches, lockSport, sport]);

  const filteredMatches = useMemo(() => {
    const now = new Date(nowMs);
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfTomorrow = startOfToday + 24 * 60 * 60 * 1000;
    const endOfWeek = startOfToday + 7 * 24 * 60 * 60 * 1000;
    const endOfMonth = startOfToday + 30 * 24 * 60 * 60 * 1000;

    return allMatches.filter((match) => {
      if (!lockSport && sport !== "all" && match.sport !== sport) return false;

      const competitionKey = matchCompetitionKey(match) || matchCompetitionName(match);
      if (competition !== "all" && competitionKey !== competition) return false;

      const effectiveStatus = effectiveMatchStatus(match, nowMs);
      const isLive = effectiveStatus === "live" || effectiveStatus === "starting";

      if (effectiveFilter === "live") return isLive;

      const startMs = match.start_time ? new Date(String(match.start_time)).getTime() : Number.NaN;
      if (!Number.isFinite(startMs)) return false;
      if (effectiveFilter === "upcoming") return !isLive && startMs >= nowMs;

      if (effectiveFilter === "today") return startMs >= startOfToday && startMs < startOfTomorrow;
      if (effectiveFilter === "week") return startMs >= startOfToday && startMs < endOfWeek;
      return startMs >= startOfToday && startMs < endOfMonth;
    });
  }, [allMatches, competition, effectiveFilter, lockSport, nowMs, sport]);

  const isLoading = liveQuery.isLoading || upcomingQuery.isLoading;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <Card
        variant="surface-2"
        className="sb-micro-pop border-[var(--c-border-strong)] bg-[radial-gradient(circle_at_top_left,rgba(58,139,255,0.16),transparent_30%),radial-gradient(circle_at_top_right,rgba(255,180,64,0.12),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.01))] p-5 sm:p-6"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--c-text-faint)]">
              Exchange Lobby
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-[var(--c-text)] sm:text-5xl">
              Card-first live and upcoming boards
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--c-text-muted)]">
              Matches open in a cleaner card view across cricket, football, tennis, and racing sports.
            </p>
          </div>
          <div className="rounded-2xl border border-[var(--c-border)] bg-[rgba(255,255,255,0.04)] px-3 py-2 text-xs text-[var(--c-text-muted)]">
            {liveCount} live · {allMatches.length} total
          </div>
        </div>
      </Card>

      <Card variant="surface-1" className="sb-micro-pop p-4 sm:p-5">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="space-y-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--c-text-faint)]">
              Time Filters
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              {FILTER_TABS.map((tab) => {
                const active = tab.key === effectiveFilter;
                const Icon = tab.icon;

                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveFilter(tab.key)}
                    className={[
                      "sb-chip-glide inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] transition",
                      active
                        ? "border-[var(--c-accent)] bg-[linear-gradient(135deg,rgba(58,139,255,0.22),rgba(58,139,255,0.1))] text-[var(--c-text)] shadow-[0_10px_24px_rgba(0,0,0,0.2)]"
                        : "border-[var(--c-border)] bg-[rgba(255,255,255,0.03)] text-[var(--c-text-muted)] hover:border-[var(--c-accent)] hover:text-[var(--c-text)]",
                    ].join(" ")}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {tab.label}
                    <span
                      className={[
                        "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                        active
                          ? "bg-[rgba(255,255,255,0.14)] text-[var(--c-text)]"
                          : "bg-[rgba(255,255,255,0.08)] text-[var(--c-text-faint)]",
                      ].join(" ")}
                    >
                      {filterCounts[tab.key]}
                    </span>
                  </button>
                );
              })}
            </div>

            {!lockSport ? (
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                {SPORT_OPTIONS.map((option) => {
                  const active = sport === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => {
                        setSport(option.id);
                        setCompetition("all");
                      }}
                    className={[
                        "sb-chip-glide inline-flex items-center justify-center rounded-xl border px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] transition",
                        active
                          ? "border-[var(--c-accent)] bg-[linear-gradient(135deg,rgba(99,32,232,0.22),rgba(58,139,255,0.15))] text-[var(--c-text)] shadow-[0_10px_24px_rgba(0,0,0,0.2)]"
                          : "border-[var(--c-border)] bg-[rgba(255,255,255,0.03)] text-[var(--c-text-muted)] hover:border-[var(--c-accent)] hover:text-[var(--c-text)]",
                      ].join(" ")}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          <div className="w-full lg:w-[260px]">
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--c-text-faint)]">
              Competition
            </label>
            <select
              value={competition}
              onChange={(event) => setCompetition(event.target.value)}
              className="w-full rounded-xl border border-[var(--c-border)] bg-[var(--c-surface-1)] px-3 py-2 text-sm text-[var(--c-text)]"
            >
              {competitionOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {isLoading && allMatches.length === 0 ? (
        <Card variant="surface-2" className="flex min-h-[18rem] items-center justify-center p-8">
          <div className="flex items-center gap-3 text-sm font-medium text-[var(--c-text-muted)]">
            <LoaderCircle className="h-5 w-5 animate-spin" />
            Loading public match boards...
          </div>
        </Card>
      ) : filteredMatches.length === 0 ? (
        <Card variant="surface-2" className="p-8 text-center">
          <div className="text-lg font-semibold text-[var(--c-text)]">No matches in this filter</div>
          <p className="mt-2 text-sm text-[var(--c-text-muted)]">
            Switch time/sport/competition filters to view more boards.
          </p>
        </Card>
      ) : (
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filteredMatches.map((match, index) => {
            const effectiveStatus = effectiveMatchStatus(match, nowMs);
            const isLive = effectiveStatus === "live" || effectiveStatus === "starting";
            const score = matchScoreSummary(match);

            return (
              <Link
                key={match.id}
                href={`/matches/${match.id}`}
                className={[
                  "sb-micro-pop sb-stagger-in sb-soft-sheen group block min-h-[10rem] touch-manipulation rounded-[1.35rem] border border-[var(--c-border)] p-4 transition",
                  "hover:-translate-y-0.5 hover:border-[var(--c-accent)] hover:shadow-[0_18px_40px_rgba(0,0,0,0.22)]",
                ].join(" ")}
                style={{ animationDelay: `${Math.min(index, 11) * 24}ms` }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-[15px] font-semibold text-[var(--c-text)]">
                      {match.team1} vs {match.team2}
                    </div>
                    <div className="mt-1 truncate text-[11px] text-[var(--c-text-faint)]">
                      {matchCompetitionName(match)}
                    </div>
                  </div>
                  <div
                    className={[
                      "rounded-xl border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]",
                      isLive
                        ? "border-[rgba(255,77,79,0.24)] bg-[rgba(255,77,79,0.12)] text-[var(--c-danger)]"
                        : "border-[var(--c-border)] bg-[rgba(255,255,255,0.04)] text-[var(--c-text-muted)]",
                    ].join(" ")}
                  >
                    {isLive ? "Live Now" : "Scheduled"}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="rounded-full border border-[var(--c-border)] bg-[rgba(255,255,255,0.04)] px-2 py-1 text-[var(--c-text-muted)]">
                    {readableSport(match.sport)}
                  </span>
                  <span className="rounded-full border border-[var(--c-border)] bg-[rgba(255,255,255,0.04)] px-2 py-1 text-[var(--c-text-faint)]">
                    {isLive ? "In Play" : "Pre Match"}
                  </span>
                </div>

                <div className="mt-2 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[rgba(0,0,0,0.14)] px-3 py-2.5 text-[15px] font-semibold text-[var(--c-text)]">
                  {score || "Score pending"}
                </div>
                <div className="mt-2 text-[11px] text-[var(--c-text-faint)]">
                  {match.start_time ? new Date(String(match.start_time)).toLocaleString() : "Time pending"}
                </div>
              </Link>
            );
          })}
        </section>
      )}

      <Card variant="surface-1" className="p-4 text-sm text-[var(--c-text-muted)]">
        <div className="flex items-start gap-2">
          <Activity className="mt-0.5 h-4 w-4 shrink-0 text-[var(--c-accent)]" />
          <p>
            The public lobby now matches the same card-first style as tennis, cricket, and football boards for consistent UX.
          </p>
        </div>
      </Card>
    </div>
  );
}

function compareMatches(left: Match, right: Match, nowMs: number) {
  const liveDelta =
    Number(effectiveMatchStatus(right, nowMs) === "live") - Number(effectiveMatchStatus(left, nowMs) === "live");
  if (liveDelta !== 0) return liveDelta;

  const leftTime = left.start_time ? new Date(String(left.start_time)).getTime() : Number.MAX_SAFE_INTEGER;
  const rightTime = right.start_time ? new Date(String(right.start_time)).getTime() : Number.MAX_SAFE_INTEGER;

  if (leftTime !== rightTime) return leftTime - rightTime;
  return String(left.team1 ?? "").localeCompare(String(right.team1 ?? ""));
}

function effectiveMatchStatus(match: Match, nowMs: number) {
  if (hasLiveSignals(match)) return "live";
  if (hasExplicitNonLiveHoldStatus(match)) return match.status;
  if (match.status !== "upcoming" && match.status !== "scheduled") return match.status;

  const startMs = match.start_time ? new Date(String(match.start_time)).getTime() : Number.NaN;
  if (!Number.isFinite(startMs)) return match.status;

  const kickoffGraceMs = 20 * 60 * 1000;
  return startMs <= nowMs && nowMs - startMs <= kickoffGraceMs ? "starting" : match.status;
}

function isExpiredUpcomingMatch(match: Match, nowMs: number) {
  if (match.status !== "upcoming" && match.status !== "scheduled") return false;
  const startMs = match.start_time ? new Date(String(match.start_time)).getTime() : Number.NaN;
  if (!Number.isFinite(startMs)) return false;
  if (hasLiveSignals(match)) return false;
  const staleGraceMs = match.sport === "cricket" ? 12 * 60 * 60 * 1000 : 6 * 60 * 60 * 1000;
  return startMs < nowMs - staleGraceMs;
}

function choosePreferredMatch(existing: Match | undefined, incoming: Match, nowMs: number) {
  if (!existing) return incoming;

  const existingStatus = effectiveMatchStatus(existing, nowMs);
  const incomingStatus = effectiveMatchStatus(incoming, nowMs);

  if (existingStatus === "live" && incomingStatus !== "live") return existing;
  if (incomingStatus === "live" && existingStatus !== "live") return incoming;
  if (existingStatus === "starting" && incomingStatus === "upcoming") return existing;
  if (incomingStatus === "starting" && existingStatus === "upcoming") return incoming;

  const existingSeq = Number(existing.live_event_seq || existing.live_state_version || 0);
  const incomingSeq = Number(incoming.live_event_seq || incoming.live_state_version || 0);
  if (incomingSeq > existingSeq) return incoming;
  if (existingSeq > incomingSeq) return existing;

  const existingUpdated = existing.updated_at
    ? new Date(String(existing.updated_at)).getTime()
    : existing.inserted_at
      ? new Date(String(existing.inserted_at)).getTime()
      : 0;
  const incomingUpdated = incoming.updated_at
    ? new Date(String(incoming.updated_at)).getTime()
    : incoming.inserted_at
      ? new Date(String(incoming.inserted_at)).getTime()
      : 0;
  return incomingUpdated >= existingUpdated ? incoming : existing;
}
