"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
import { SPORTBOOK_SPORTS } from "@/components/user/sportsbook/sports";
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
  filterUi = "full",
}: {
  initialSport?: string;
  lockSport?: boolean;
  filterUi?: "full" | "time_only";
  stickyOffsetClass?: string;
} = {}) {
  const searchParams = useSearchParams();
  const defaultSport = filterUi === "time_only" ? "cricket" : initialSport;
  const [sport, setSport] = useState<string>(defaultSport);
  const [competition, setCompetition] = useState<string>("all");
  const [activeFilter, setActiveFilter] = useState<MatchFilterKey | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [stickyMatches, setStickyMatches] = useState<Match[]>([]);
  const previousSportRef = useRef(defaultSport);

  const LIVE_SYNC_INTERVAL_MS = 1_000;
  const sportScope = lockSport || sport !== "all" ? sport : undefined;

  useEffect(() => {
    const urlSport = searchParams.get("sport");
    const allowedSports = new Set(SPORT_OPTIONS.map((option) => option.id));
    const nextSport =
      urlSport && allowedSports.has(urlSport as (typeof SPORT_OPTIONS)[number]["id"]) ? urlSport : defaultSport;

    if (nextSport !== sport) {
      setSport(nextSport);
      setCompetition("all");
    }
  }, [defaultSport, searchParams, sport]);

  useEffect(() => {
    if (previousSportRef.current === sport) return;
    previousSportRef.current = sport;
    setActiveFilter(null);
    setCompetition("all");
  }, [sport]);

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
            quality_mode: "public",
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

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const cached = window.sessionStorage.getItem(`public-matches:${sportScope ?? "all"}`);
      if (!cached) return;
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        setStickyMatches(parsed as Match[]);
      }
    } catch {
      // best-effort cache hydration
    }
  }, [sportScope]);

  const allMatches = useMemo(() => {
    const rows = [
      ...(((liveQuery.data as { data?: Match[] } | undefined)?.data ?? []) as Match[]),
      ...(((upcomingQuery.data as { data?: Match[] } | undefined)?.data ?? []) as Match[]),
    ];
    const sourceRows = rows.length > 0 ? rows : stickyMatches;

    const deduped = new Map<string, Match>();

    for (const match of sourceRows) {
      const existing = deduped.get(match.id);
      deduped.set(match.id, choosePreferredMatch(existing, match, nowMs));
    }

    return Array.from(deduped.values())
      .filter(isRenderablePublicMatch)
      .filter((match) => !isExpiredUpcomingMatch(match, nowMs))
      .sort((left, right) => compareMatches(left, right, nowMs));
  }, [liveQuery.data, nowMs, stickyMatches, upcomingQuery.data]);

  useEffect(() => {
    const rows = [
      ...(((liveQuery.data as { data?: Match[] } | undefined)?.data ?? []) as Match[]),
      ...(((upcomingQuery.data as { data?: Match[] } | undefined)?.data ?? []) as Match[]),
    ];
    if (rows.length === 0) return;

    const deduped = new Map<string, Match>();
    for (const match of rows) {
      const existing = deduped.get(match.id);
      deduped.set(match.id, choosePreferredMatch(existing, match, nowMs));
    }

    const nextRows = Array.from(deduped.values()).slice(0, 360);
    setStickyMatches(nextRows);

    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.setItem(`public-matches:${sportScope ?? "all"}`, JSON.stringify(nextRows));
      } catch {
        // best-effort cache persistence
      }
    }
  }, [liveQuery.data, nowMs, sportScope, upcomingQuery.data]);

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
      const isLive = effectiveStatus === "live";
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
      const isLive = effectiveStatus === "live";

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
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
      <Card
        variant="surface-2"
        className="sb-micro-pop border-[var(--c-border-strong)] bg-[radial-gradient(circle_at_top_left,rgba(58,139,255,0.16),transparent_30%),radial-gradient(circle_at_top_right,rgba(255,180,64,0.12),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.01))] p-4 sm:p-5"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--c-text-faint)]">
              Exchange Lobby
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-[var(--c-text)] sm:text-4xl lg:text-5xl">
              Card-first live and upcoming boards
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--c-text-muted)]">
              Matches open in a cleaner card view across cricket, football, tennis, and racing sports.
            </p>
          </div>
          <div className="rounded-2xl border border-[var(--c-border)] bg-[rgba(255,255,255,0.04)] px-3 py-2 text-xs text-[var(--c-text-muted)]">
            {liveCount} live · {allMatches.length} total
          </div>
        </div>
      </Card>

      <Card variant="surface-1" className="sb-micro-pop p-3.5 sm:p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="space-y-2.5">
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

            {!lockSport && filterUi === "full" ? (
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                {SPORT_OPTIONS.map((option) => {
                  const active = sport === option.id;
                  const sportCard = SPORTBOOK_SPORTS.find((item) => item.id === option.id);

                  if (option.id === "all") {
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => {
                          setSport(option.id);
                          setCompetition("all");
                        }}
                        className={[
                          "sb-chip-glide group relative flex min-h-14 items-end overflow-hidden rounded-2xl border px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.12em] transition",
                          active
                            ? "border-[var(--c-accent)] shadow-[0_10px_24px_rgba(0,0,0,0.2)]"
                            : "border-[var(--c-border)] hover:border-[var(--c-accent)]",
                        ].join(" ")}
                      >
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(58,139,255,0.28),transparent_44%),radial-gradient(circle_at_bottom_right,rgba(99,32,232,0.22),transparent_42%),linear-gradient(180deg,rgba(17,24,39,0.58),rgba(8,10,18,0.78))]" />
                        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.06),transparent_45%)]" />
                        <span className="relative z-10 text-[11px] text-white">All Sports</span>
                      </button>
                    );
                  }

                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => {
                        setSport(option.id);
                        setCompetition("all");
                      }}
                      className={[
                        "sb-chip-glide group relative flex min-h-14 items-end overflow-hidden rounded-2xl border px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.12em] transition",
                        active
                          ? "border-[var(--c-accent)] shadow-[0_10px_24px_rgba(0,0,0,0.2)]"
                          : "border-[var(--c-border)] hover:border-[var(--c-accent)]",
                      ].join(" ")}
                    >
                      {sportCard ? (
                        <>
                          <Image
                            src={sportCard.image}
                            alt={sportCard.label}
                            fill
                            className="object-cover object-center opacity-35 transition-transform duration-300 group-hover:scale-[1.06]"
                            sizes="(max-width: 640px) 50vw, 192px"
                          />
                          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(10,13,22,0.18),rgba(8,10,18,0.82))]" />
                        </>
                      ) : null}
                      <span className="relative z-10 text-[11px] text-white">{option.label}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          {filterUi === "full" ? (
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
          ) : null}
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
        <section className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
          {filteredMatches.map((match, index) => {
            const effectiveStatus = effectiveMatchStatus(match, nowMs);
            const isLive = effectiveStatus === "live";
            const score = matchScoreSummary(match);

            return (
              <Link
                key={match.id}
                href={`/matches/${match.id}`}
                className={[
                  "sb-micro-pop sb-stagger-in sb-soft-sheen group block min-h-[10.75rem] touch-manipulation rounded-[1.35rem] border p-4 transition",
                  isLive
                    ? "border-[rgba(255,77,79,0.28)] bg-[radial-gradient(circle_at_top_right,rgba(255,77,79,0.14),transparent_36%),linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))]"
                    : "border-[var(--c-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.018))]",
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
                      "inline-flex items-center gap-1.5 rounded-xl border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]",
                      isLive
                        ? "border-[rgba(255,77,79,0.24)] bg-[rgba(255,77,79,0.12)] text-[var(--c-danger)]"
                        : "border-[var(--c-border)] bg-[rgba(255,255,255,0.04)] text-[var(--c-text-muted)]",
                    ].join(" ")}
                  >
                    {isLive ? <span className="h-1.5 w-1.5 rounded-full bg-[var(--c-danger)] animate-pulse" /> : null}
                    {isLive ? "Live Now" : "Scheduled"}
                  </div>
                </div>

                <div className="mt-3 grid gap-2">
                  <TeamRow name={String(match.team1 ?? "-")} logo={match.team1_logo} />
                  <TeamRow name={String(match.team2 ?? "-")} logo={match.team2_logo} />
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="rounded-full border border-[var(--c-border)] bg-[rgba(255,255,255,0.04)] px-2 py-1 text-[var(--c-text-muted)]">
                    {readableSport(match.sport)}
                  </span>
                  <span className="rounded-full border border-[var(--c-border)] bg-[rgba(255,255,255,0.04)] px-2 py-1 text-[var(--c-text-faint)]">
                    {isLive ? "In Play" : "Pre Match"}
                  </span>
                  {match.venue_name ? (
                    <span className="rounded-full border border-[var(--c-border)] bg-[rgba(255,255,255,0.04)] px-2 py-1 text-[var(--c-text-faint)]">
                      {String(match.venue_name)}
                    </span>
                  ) : null}
                  {match.round_name ? (
                    <span className="rounded-full border border-[var(--c-border)] bg-[rgba(255,255,255,0.04)] px-2 py-1 text-[var(--c-text-faint)]">
                      {String(match.round_name)}
                    </span>
                  ) : null}
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
  if (hasExplicitNonLiveHoldStatus(match)) return match.status;
  if (hasLiveSignals(match)) return "live";
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

function TeamRow({ name, logo }: { name: string; logo?: string | null }) {
  const normalizedLogo = normalizeLogo(logo);

  return (
    <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.035)] px-3 py-2">
      <div className="flex items-center gap-2.5">
        {normalizedLogo ? (
          <Image
            src={normalizedLogo}
            alt={name}
            width={28}
            height={28}
            className="h-7 w-7 rounded-full border border-[var(--c-border)] bg-[var(--c-surface-1)] object-cover"
          />
        ) : (
          <div className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--c-border)] bg-[var(--c-surface-1)] text-[10px] font-bold uppercase text-[var(--c-text-faint)]">
            {teamInitials(name)}
          </div>
        )}
        <div className="truncate text-sm font-semibold text-[var(--c-text)]">{name}</div>
      </div>
    </div>
  );
}

function normalizeLogo(value?: string | null) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("data:image/")
  ) {
    return trimmed;
  }
  return null;
}

function teamInitials(name: string) {
  const tokens = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return "--";
  if (tokens.length === 1) return tokens[0].slice(0, 2).toUpperCase();
  return `${tokens[0][0] || ""}${tokens[1][0] || ""}`.toUpperCase();
}
