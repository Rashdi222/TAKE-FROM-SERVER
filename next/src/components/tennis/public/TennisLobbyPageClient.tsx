"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, CalendarDays, Clock3, Orbit, Radio } from "lucide-react";
import { publicApi, type TennisFixture, type TennisMatchState } from "@/lib/api";
import { useTennisSocket } from "@/hooks/useTennisSocket";
import { formatDecimal } from "@/lib/format";

type Props = {
  initialFixtures: TennisFixture[];
  initialLive: TennisMatchState[];
};

type FilterKey = "live" | "today" | "week" | "month";

type LobbyCard = {
  eventKey: string;
  player1: string;
  player2: string;
  tournamentName: string | null;
  startTime: string | null;
  statusText: string;
  live: boolean;
  liveState: TennisMatchState | null;
};

const filterTabs: Array<{ key: FilterKey; label: string; icon: typeof Radio }> = [
  { key: "live", label: "Live", icon: Radio },
  { key: "today", label: "Today", icon: Clock3 },
  { key: "week", label: "Week", icon: CalendarDays },
  { key: "month", label: "Month", icon: Orbit },
];

function parseTennisDate(value?: string | null) {
  if (!value) return new Date(Number.NaN);
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const withSeconds = /:\d{2}$/.test(normalized) ? `${normalized}:00` : normalized;
  return new Date(withSeconds);
}

function formatMatchTime(value?: string | null) {
  if (!value) return "Time pending";
  const parsed = parseTennisDate(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-PK", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Karachi",
  }).format(parsed);
}

function scoreline(match: TennisMatchState) {
  const rows = (match.score as { sets?: { rows?: Array<Record<string, unknown>> } } | undefined)?.sets?.rows ?? [];
  if (rows.length === 0) return match.current_game_score || "Live";
  return rows
    .map((row) => `${String(row.player_1 ?? "-")}-${String(row.player_2 ?? "-")}`)
    .join(" | ");
}

function topOdds(match: TennisMatchState) {
  const odds = Array.isArray(match.published_odds) ? match.published_odds : [];

  return odds
    .filter((odd) => odd.odds_value != null)
    .slice(0, 3)
    .map((odd, index) => ({
      key: [
        odd.event_key ?? match.event_key ?? "match",
        odd.market_key ?? "market",
        odd.selection_key ?? "selection",
        odd.provider_updated_at ?? String(index),
        String(index),
      ].join("-"),
      label: odd.selection_name || odd.selection_key || odd.market_name || "Price",
      value: formatDecimal(odd.odds_value ?? 0),
    }));
}

export function TennisLobbyPageClient({ initialFixtures, initialLive }: Props) {
  const [activeFilter, setActiveFilter] = useState<FilterKey | null>(null);
  const [stickyFixtures, setStickyFixtures] = useState<TennisFixture[]>(initialFixtures);
  const [stickyLive, setStickyLive] = useState<TennisMatchState[]>(initialLive);

  const { data: fixturesData } = useQuery({
    queryKey: ["public", "tennis", "fixtures"],
    queryFn: () => {
      const today = new Date();
      const dateStart = today.toISOString().slice(0, 10);
      const dateStop = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      return publicApi.tennis.fixtures({ date_start: dateStart, date_stop: dateStop });
    },
    initialData: { data: initialFixtures },
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const { data: liveData, isError: liveFeedError } = useQuery({
    queryKey: ["public", "tennis", "live"],
    queryFn: () => publicApi.tennis.live(),
    initialData: { data: initialLive },
    staleTime: 5_000,
    refetchInterval: 5_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  });

  const initialLiveRows = useMemo(() => {
    const rows = (((liveData as { data?: TennisMatchState[] } | undefined)?.data ?? []) as TennisMatchState[]);
    return rows.length > 0 ? rows : stickyLive;
  }, [liveData, stickyLive]);

  const { matches: liveMatches, status } = useTennisSocket(initialLiveRows, { allowNewKeys: true });

  const fixtures = useMemo(() => {
    const rows = (((fixturesData as { data?: TennisFixture[] } | undefined)?.data ?? []) as TennisFixture[]);
    return rows.length > 0 ? rows : stickyFixtures;
  }, [fixturesData, stickyFixtures]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const cachedFixtures = window.sessionStorage.getItem("tennis:lobby:fixtures");
      const cachedLive = window.sessionStorage.getItem("tennis:lobby:live");

      if (stickyFixtures.length === 0 && cachedFixtures) {
        const parsed = JSON.parse(cachedFixtures);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setStickyFixtures(parsed as TennisFixture[]);
        }
      }

      if (stickyLive.length === 0 && cachedLive) {
        const parsed = JSON.parse(cachedLive);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setStickyLive(parsed as TennisMatchState[]);
        }
      }
    } catch {
      // best-effort cache hydration
    }
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const rows = (((fixturesData as { data?: TennisFixture[] } | undefined)?.data ?? []) as TennisFixture[]);
    if (rows.length === 0) return;
    setStickyFixtures(rows);
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.setItem("tennis:lobby:fixtures", JSON.stringify(rows));
      } catch {
        // best-effort cache persistence
      }
    }
  }, [fixturesData]);

  useEffect(() => {
    const rows = (((liveData as { data?: TennisMatchState[] } | undefined)?.data ?? []) as TennisMatchState[]);
    if (rows.length === 0) return;
    setStickyLive(rows);
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.setItem("tennis:lobby:live", JSON.stringify(rows));
      } catch {
        // best-effort cache persistence
      }
    }
  }, [liveData]);

  const cards = useMemo(() => {
    const merged = new Map<string, LobbyCard>();

    liveMatches.forEach((match) => {
      merged.set(match.event_key, {
        eventKey: match.event_key,
        player1: match.player_1_name || "Player 1",
        player2: match.player_2_name || "Player 2",
        tournamentName: null,
        startTime: null,
        statusText: match.event_status || match.status || "Live",
        live: true,
        liveState: match,
      });
    });

    fixtures.forEach((fixture) => {
      const existing = merged.get(fixture.event_key);
      if (existing) {
        merged.set(fixture.event_key, {
          ...existing,
          player1: fixture.player_1_name || existing.player1,
          player2: fixture.player_2_name || existing.player2,
          tournamentName: fixture.tournament_name || existing.tournamentName,
          startTime: fixture.start_time || existing.startTime,
        });
        return;
      }

      merged.set(fixture.event_key, {
        eventKey: fixture.event_key,
        player1: fixture.player_1_name || "Player 1",
        player2: fixture.player_2_name || "Player 2",
        tournamentName: fixture.tournament_name || null,
        startTime: fixture.start_time || null,
        statusText: fixture.status || "Scheduled",
        live: false,
        liveState: null,
      });
    });

    return Array.from(merged.values());
  }, [fixtures, liveMatches]);

  const filterCounts = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfTomorrow = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
    const endOfWeek = new Date(startOfToday.getTime() + 7 * 24 * 60 * 60 * 1000);
    const endOfMonth = new Date(startOfToday.getTime() + 30 * 24 * 60 * 60 * 1000);

    const counts: Record<FilterKey, number> = {
      live: 0,
      today: 0,
      week: 0,
      month: 0,
    };

    cards.forEach((card) => {
      if (card.live) counts.live += 1;
      const parsed = parseTennisDate(card.startTime);
      if (Number.isNaN(parsed.getTime())) return;
      if (parsed >= startOfToday && parsed < startOfTomorrow) counts.today += 1;
      if (parsed >= startOfToday && parsed < endOfWeek) counts.week += 1;
      if (parsed >= startOfToday && parsed < endOfMonth) counts.month += 1;
    });

    return counts;
  }, [cards]);

  const defaultFilter: FilterKey = useMemo(() => {
    if (liveMatches.length > 0) return "live";
    const fallbackOrder: FilterKey[] = ["today", "week", "month"];
    return fallbackOrder.find((key) => filterCounts[key] > 0) ?? "today";
  }, [filterCounts, liveMatches.length]);

  const effectiveFilter = activeFilter && filterCounts[activeFilter] > 0 ? activeFilter : defaultFilter;

  const filteredCards = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfTomorrow = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
    const endOfWeek = new Date(startOfToday.getTime() + 7 * 24 * 60 * 60 * 1000);
    const endOfMonth = new Date(startOfToday.getTime() + 30 * 24 * 60 * 60 * 1000);

    return cards
      .filter((card) => {
        if (effectiveFilter === "live") return card.live;

        const parsed = parseTennisDate(card.startTime);
        if (Number.isNaN(parsed.getTime())) return false;

        if (effectiveFilter === "today") return parsed >= startOfToday && parsed < startOfTomorrow;
        if (effectiveFilter === "week") return parsed >= startOfToday && parsed < endOfWeek;
        return parsed >= startOfToday && parsed < endOfMonth;
      })
      .sort((a, b) => {
        if (a.live !== b.live) return Number(b.live) - Number(a.live);
        const ta = parseTennisDate(a.startTime).getTime();
        const tb = parseTennisDate(b.startTime).getTime();
        if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return ta - tb;
        return `${a.player1} ${a.player2}`.localeCompare(`${b.player1} ${b.player2}`);
      });
  }, [cards, effectiveFilter]);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <section className="rounded-[2.2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.18),transparent_28%),radial-gradient(circle_at_top_right,rgba(56,189,248,0.14),transparent_34%),linear-gradient(180deg,#07131d_0%,#040911_100%)] p-6 text-white">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-emerald-300/70">Tennis Exchange</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-[-0.05em]">Live courts and smart market cards.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/65">
              The board opens directly into match cards. If live courts are available, Live is selected automatically. If not, the page starts with Today.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {liveFeedError ? (
              <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                live feed delayed
              </div>
            ) : null}
            <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100/80">
              socket {status}
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70">
              {liveMatches.length} live courts
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,#07111b_0%,#050912_100%)] p-5 text-white">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-white/40">Match Board</p>
            <h2 className="mt-2 text-xl font-semibold">At-a-glance tennis cards</h2>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            {filterTabs.map((tab) => {
              const active = tab.key === effectiveFilter;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveFilter(tab.key)}
                  className={[
                    "inline-flex min-h-[2.8rem] touch-manipulation items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] transition sm:min-h-0 sm:py-2",
                    active
                      ? "border-emerald-300/40 bg-[linear-gradient(135deg,rgba(16,185,129,0.3),rgba(14,165,233,0.14))] text-emerald-100 shadow-[0_12px_26px_rgba(0,0,0,0.22)]"
                      : "border-white/10 bg-white/5 text-white/65 hover:border-white/20 hover:bg-white/[0.08] hover:text-white",
                  ].join(" ")}
                >
                  {tab.key === "live" ? (
                    <span
                      className={[
                        "h-2 w-2 rounded-full",
                        active ? "animate-pulse bg-emerald-300" : "bg-white/45",
                      ].join(" ")}
                    />
                  ) : (
                    <Icon className="h-3.5 w-3.5" />
                  )}
                  {tab.label}
                  <span
                    className={[
                      "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                      active ? "bg-white/15 text-white" : "bg-white/10 text-white/70",
                    ].join(" ")}
                  >
                    {filterCounts[tab.key]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {filteredCards.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 px-4 py-12 text-center text-sm text-white/55">
            {effectiveFilter === "live" && liveFeedError
              ? "Live feed is temporarily delayed. You can still use Today, Week, or Month cards."
              : "No tennis matches are available in this filter right now."}
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredCards.map((card) => {
              const featuredOdds = card.liveState ? topOdds(card.liveState) : [];

              return (
                <Link
                  key={card.eventKey}
                  href={`/tennis/match/${card.eventKey}`}
                  prefetch={false}
                  className="group block rounded-[1.6rem] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] px-4 py-4 transition hover:-translate-y-0.5 hover:border-emerald-400/30 hover:bg-white/[0.06] hover:shadow-[0_18px_38px_rgba(0,0,0,0.26)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-base font-semibold">{card.player1} vs {card.player2}</div>
                      <div className="mt-1 truncate text-[11px] text-white/45">
                        {card.tournamentName || "Tournament"} · {formatMatchTime(card.startTime)}
                      </div>
                    </div>
                    <div
                      className={[
                        "rounded-xl border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]",
                        card.live
                          ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100"
                          : "border-white/10 bg-white/5 text-white/70",
                      ].join(" ")}
                    >
                      {card.live ? "Live" : "Scheduled"}
                    </div>
                  </div>

                  <div className="mt-2 flex items-center gap-2 text-xs text-white/60">
                    <span>{card.statusText || "Status pending"}</span>
                    {card.live ? <span className="h-1 w-1 rounded-full bg-emerald-300/80" /> : null}
                    {card.live ? <span className="text-emerald-200/90">Live tracking</span> : null}
                  </div>

                  {card.liveState ? (
                    <div className="mt-2 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 font-mono text-xs text-emerald-100">
                      {scoreline(card.liveState)}
                    </div>
                  ) : null}

                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {featuredOdds.length === 0 ? (
                      <div className="col-span-3 rounded-xl border border-dashed border-white/10 bg-black/10 px-3 py-2 text-[11px] text-white/50">
                        {card.live ? "Live prices syncing" : "Open match for detailed odds"}
                      </div>
                    ) : (
                      featuredOdds.map((odd) => (
                        <div key={odd.key} className="rounded-xl border border-white/10 bg-black/10 px-2.5 py-1.5">
                          <div className="truncate text-[9px] uppercase tracking-[0.13em] text-white/45">{odd.label}</div>
                          <div className="mt-1 font-mono text-xs font-semibold text-emerald-200 group-hover:text-emerald-100">{odd.value}</div>
                        </div>
                      ))
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {[
          { label: "Auto Live Priority", text: "The page prioritizes live cards automatically when any live court exists.", icon: Orbit },
          { label: "Smart Time Filters", text: "Use Today, Week, and Month for schedule review without leaving this page.", icon: Clock3 },
          { label: "Quick Market Glance", text: "Each card shows key price snippets and opens full match detail in one click.", icon: Activity },
        ].map((item) => (
          <div key={item.label} className="rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-5 text-white">
            <item.icon className="h-5 w-5 text-cyan-300" />
            <div className="mt-3 text-sm font-semibold">{item.label}</div>
            <div className="mt-2 text-sm leading-6 text-white/60">{item.text}</div>
          </div>
        ))}
      </section>
    </div>
  );
}
