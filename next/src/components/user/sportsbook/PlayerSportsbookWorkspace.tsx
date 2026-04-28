"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Activity, CalendarDays, Clock3, LoaderCircle, Orbit, Radio } from "lucide-react";
import { useQueries } from "@tanstack/react-query";
import { type Match, publicApi } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import {
  matchCompetitionName,
  readableSport,
  isRenderablePublicMatch,
} from "@/lib/public-matches/lobby";
import {
  getSportsbookSport,
  type SportsbookSportId,
} from "./sports";
import { hasExplicitNonLiveHoldStatus, hasLiveSignals } from "@/lib/matches/liveStatus";

type MatchFilterKey = "live" | "today" | "week" | "month" | "upcoming";

const FILTER_TABS: Array<{ key: MatchFilterKey; label: string; icon: typeof Radio }> = [
  { key: "live", label: "Live", icon: Radio },
  { key: "upcoming", label: "Upcoming", icon: CalendarDays },
  { key: "today", label: "Today", icon: Clock3 },
  { key: "week", label: "Week", icon: CalendarDays },
  { key: "month", label: "Month", icon: Orbit },
];

export function PlayerSportsbookWorkspace({ sportSlug }: { sportSlug: SportsbookSportId }) {
  return <StandardSportsbookWorkspace sportSlug={sportSlug} />;
}

function StandardSportsbookWorkspace({ sportSlug }: { sportSlug: SportsbookSportId }) {
  const sport = getSportsbookSport(sportSlug);
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedMatchId = searchParams.get("match");
  const [activeFilter, setActiveFilter] = useState<MatchFilterKey | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [stickyMatches, setStickyMatches] = useState<Match[]>([]);

  const LIVE_SYNC_INTERVAL_MS = 1_000;

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), LIVE_SYNC_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, []);

  const [liveQuery, upcomingQuery] = useQueries({
    queries: [
      {
        queryKey: ["player-sportsbook", sportSlug, "live"],
        queryFn: () =>
          publicApi.matches.list({
            sport: sportSlug,
            state_bucket: "live",
            quality_mode: "public",
            limit: 64,
          }),
        staleTime: LIVE_SYNC_INTERVAL_MS,
        refetchInterval: LIVE_SYNC_INTERVAL_MS,
        refetchIntervalInBackground: true,
        refetchOnWindowFocus: true,
      },
      {
        queryKey: ["player-sportsbook", sportSlug, "upcoming"],
        queryFn: () =>
          publicApi.matches.list({
            sport: sportSlug,
            state_bucket: "upcoming",
            quality_mode: "public",
            limit: 220,
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
      const cached = window.sessionStorage.getItem(`sportsbook:${sportSlug}:matches`);
      if (!cached) return;
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        setStickyMatches(parsed as Match[]);
      }
    } catch {
      // best-effort cache hydration
    }
  }, [sportSlug]);

  const allMatches = useMemo(() => {
    const deduped = new Map<string, Match>();
    const rows = [
      ...(((upcomingQuery.data as { data?: Match[] } | undefined)?.data ?? []) as Match[]),
      ...(((liveQuery.data as { data?: Match[] } | undefined)?.data ?? []) as Match[]),
    ];
    const sourceRows = rows.length > 0 ? rows : stickyMatches;

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
      ...(((upcomingQuery.data as { data?: Match[] } | undefined)?.data ?? []) as Match[]),
      ...(((liveQuery.data as { data?: Match[] } | undefined)?.data ?? []) as Match[]),
    ];
    if (rows.length === 0) return;

    const deduped = new Map<string, Match>();
    for (const match of rows) {
      const existing = deduped.get(match.id);
      deduped.set(match.id, choosePreferredMatch(existing, match, nowMs));
    }

    const nextRows = Array.from(deduped.values()).slice(0, 240);
    setStickyMatches(nextRows);

    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.setItem(`sportsbook:${sportSlug}:matches`, JSON.stringify(nextRows));
      } catch {
        // best-effort cache persistence
      }
    }
  }, [liveQuery.data, nowMs, sportSlug, upcomingQuery.data]);

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

    const counts: Record<MatchFilterKey, number> = { live: 0, upcoming: 0, today: 0, week: 0, month: 0 };
    allMatches.forEach((match) => {
      const status = effectiveMatchStatus(match, nowMs);
      const isLive = status === "live";
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

  const filteredMatches = useMemo(() => {
    const now = new Date(nowMs);
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfTomorrow = startOfToday + 24 * 60 * 60 * 1000;
    const endOfWeek = startOfToday + 7 * 24 * 60 * 60 * 1000;
    const endOfMonth = startOfToday + 30 * 24 * 60 * 60 * 1000;

    return allMatches.filter((match) => {
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
  }, [allMatches, effectiveFilter, nowMs]);

  const effectiveSelectedMatchId = useMemo(() => {
    if (!selectedMatchId) return null;
    return filteredMatches.some((match) => match.id === selectedMatchId) ? selectedMatchId : null;
  }, [filteredMatches, selectedMatchId]);

  const isLoading = liveQuery.isLoading || upcomingQuery.isLoading;

  if (!sport) {
    return null;
  }

  const openMatchPage = (match: Match) => {
    const slug = typeof match.slug === "string" && match.slug.trim().length > 0 ? `/${match.slug}` : "";
    router.push(`/matches/${match.id}${slug}`, { scroll: true });
  };

  return (
    <div className="space-y-4">
      <Card
        variant="surface-2"
        className="sb-micro-pop border-[var(--c-border-strong)] bg-[radial-gradient(circle_at_top_left,rgba(58,139,255,0.16),transparent_30%),radial-gradient(circle_at_top_right,rgba(255,180,64,0.12),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.01))] p-4 sm:p-6"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--c-text-faint)]">
              {sport.label} Matchbook
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[var(--c-text)] sm:text-4xl">
              Card-first {sport.label.toLowerCase()} board
            </h1>
            <p className="mt-2 text-sm leading-6 text-[var(--c-text-muted)]">
              Live-first view with stable filters and one-click board open.
            </p>
          </div>
          <div className="rounded-2xl border border-[var(--c-border)] bg-[rgba(255,255,255,0.04)] px-3 py-2 text-xs text-[var(--c-text-muted)]">
            {liveCount} live · {allMatches.length} total
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
          <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-emerald-100">
            Live windows {filterCounts.live}
          </span>
          <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-2.5 py-1 text-amber-100">
            Upcoming {filterCounts.upcoming}
          </span>
          <span className="rounded-full border border-sky-400/20 bg-sky-400/10 px-2.5 py-1 text-sky-100">
            Today {filterCounts.today}
          </span>
          <span className="rounded-full border border-violet-400/20 bg-violet-400/10 px-2.5 py-1 text-violet-100">
            Week {filterCounts.week}
          </span>
        </div>
      </Card>

      <Card variant="surface-1" className="sb-micro-pop p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--c-text-faint)]">
            Match Filters
          </div>
          <div className="text-xs text-[var(--c-text-muted)]">
            Default: {defaultFilter.toUpperCase()}
          </div>
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
                  "sb-chip-glide inline-flex min-h-[2.8rem] touch-manipulation items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] transition sm:min-h-0 sm:py-2",
                  active
                    ? "border-[var(--c-accent)] bg-[linear-gradient(135deg,rgba(58,139,255,0.22),rgba(99,32,232,0.15))] text-[var(--c-text)] shadow-[0_10px_24px_rgba(0,0,0,0.2)]"
                    : "border-[var(--c-border)] bg-[rgba(255,255,255,0.03)] text-[var(--c-text-muted)] hover:border-[var(--c-accent)] hover:text-[var(--c-text)]",
                ].join(" ")}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
                <span
                  className={[
                    "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                    active ? "bg-[rgba(255,255,255,0.15)] text-[var(--c-text)]" : "bg-[rgba(255,255,255,0.08)] text-[var(--c-text-faint)]",
                  ].join(" ")}
                >
                  {filterCounts[tab.key]}
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      {isLoading && allMatches.length === 0 ? (
        <Card variant="surface-2" className="flex min-h-[18rem] items-center justify-center p-8">
          <div className="flex items-center gap-3 text-sm font-medium text-[var(--c-text-muted)]">
            <LoaderCircle className="h-5 w-5 animate-spin" />
            Loading {sport.label.toLowerCase()} matches...
          </div>
        </Card>
      ) : filteredMatches.length === 0 ? (
        <Card variant="surface-2" className="p-8 text-center">
          <div className="text-lg font-semibold text-[var(--c-text)]">No matches in this filter</div>
          <p className="mt-2 text-sm text-[var(--c-text-muted)]">
            Switch filter to see other {sport.label.toLowerCase()} matches.
          </p>
        </Card>
      ) : (
        <>
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredMatches.map((match, index) => {
              const isLive = effectiveMatchStatus(match, nowMs) === "live";
              const active = match.id === effectiveSelectedMatchId;

              return (
                <button
                  key={match.id}
                  type="button"
                  onClick={() => openMatchPage(match)}
                  className={[
                    "sb-micro-pop sb-stagger-in sb-soft-sheen group min-h-[10.75rem] touch-manipulation text-left rounded-[1.25rem] border p-4 transition sm:min-h-0",
                    active
                      ? "border-[var(--c-accent)] bg-[linear-gradient(160deg,rgba(58,139,255,0.2),rgba(99,32,232,0.14))] shadow-[0_16px_34px_rgba(0,0,0,0.2)]"
                      : isLive
                        ? "border-[rgba(255,77,79,0.28)] bg-[radial-gradient(circle_at_top_right,rgba(255,77,79,0.14),transparent_36%),linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.018))] hover:-translate-y-0.5 hover:border-[var(--c-accent)] hover:shadow-[0_14px_30px_rgba(0,0,0,0.18)]"
                        : "border-[var(--c-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.015))] hover:-translate-y-0.5 hover:border-[var(--c-accent)] hover:shadow-[0_14px_30px_rgba(0,0,0,0.18)]",
                  ].join(" ")}
                  style={{ animationDelay: `${Math.min(index, 11) * 24}ms` }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-[var(--c-text)]">
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
                    <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.035)] px-3 py-2">
                      <div className="truncate text-sm font-semibold text-[var(--c-text)]">{match.team1}</div>
                    </div>
                    <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.035)] px-3 py-2">
                      <div className="truncate text-sm font-semibold text-[var(--c-text)]">{match.team2}</div>
                    </div>
                  </div>

                  <div className="mt-3 inline-flex items-center rounded-full border border-[var(--c-border)] bg-[rgba(0,0,0,0.18)] px-3 py-1.5 text-[13px] font-semibold text-[var(--c-text-muted)] sm:px-2.5 sm:py-1 sm:text-xs">
                    {matchScoreLine(match)}
                  </div>
                  <div className="mt-1 text-[11px] text-[var(--c-text-faint)]">
                    {match.start_time ? new Date(String(match.start_time)).toLocaleString() : "Time pending"}
                  </div>
                </button>
              );
            })}
          </section>
        </>
      )}

      <Card variant="surface-1" className="p-4 text-sm text-[var(--c-text-muted)]">
        <div className="flex items-start gap-2">
          <Activity className="mt-0.5 h-4 w-4 shrink-0 text-[var(--c-accent)]" />
          <p>
            This card-first layout is now active for {sport.label.toLowerCase()}. If you want, I can apply the same condensed card style to the global public `/matches` lobby in the next pass.
          </p>
        </div>
      </Card>
    </div>
  );
}

function matchScoreLine(match: Match) {
  if (match.sport === "cricket") {
    const runs = Number(match.runs_total || 0);
    const wickets = Number(match.wickets_total || 0);
    const over = match.current_over ? String(match.current_over) : null;
    if (runs > 0 || wickets > 0 || over) {
      return `${runs}/${wickets}${over ? ` · ${over} ov` : ""}`;
    }
  }

  if (match.sport === "football") {
    const home = Number(match.home_score || 0);
    const away = Number(match.away_score || 0);
    const minute = Number(match.elapsed_minute || 0);
    if (home > 0 || away > 0 || minute > 0) {
      return `${home}-${away}${minute > 0 ? ` · ${minute}'` : ""}`;
    }
  }

  return readableSport(match.sport);
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

  if (existingStatus !== incomingStatus) return incoming;

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
