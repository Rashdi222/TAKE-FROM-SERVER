"use client";

import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { publicApi, type TennisFixture, type TennisLiveOdds, type TennisMatchState } from "@/lib/api";
import { useTennisMatchSocket } from "@/hooks/useTennisSocket";
import { isTennisPrematchLike } from "@/lib/tennis/tennisContext";
import { TennisPrematchBoard } from "@/components/tennis/prematch/TennisPrematchBoard";
import { TennisLiveHud } from "@/components/tennis/live/TennisLiveHud";
import { TennisMarketBoard } from "./TennisMarketBoard";

type Props = {
  eventKey: string;
  initialMatch: TennisMatchState | TennisFixture | null;
};

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function isMatchState(value: TennisMatchState | TennisFixture | null): value is TennisMatchState {
  return Boolean(value && "raw_live_odds" in value);
}

function fixtureToState(fixture: TennisFixture | null): TennisMatchState | null {
  if (!fixture) return null;

  return {
    event_key: fixture.event_key,
    status: fixture.status || "scheduled",
    event_status: fixture.status || "scheduled",
    player_1_name: fixture.player_1_name,
    player_2_name: fixture.player_2_name,
    current_set: 0,
    current_game_score: null,
    current_point_score: null,
    sets: [],
    raw_live_odds: [],
    raw_fixture: fixture.raw ?? null,
  };
}

export function TennisMatchPageClient({ eventKey, initialMatch }: Props) {
  const cachedMatch = useMemo(() => {
    if (typeof window === "undefined") return null;
    try {
      const cached = window.sessionStorage.getItem(`tennis:match:${eventKey}`);
      if (!cached) return null;
      const parsed = JSON.parse(cached) as TennisMatchState | TennisFixture | null;
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }, [eventKey]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["public", "tennis", "match", eventKey],
    queryFn: async () => {
      const [liveResult, matchResult] = await Promise.allSettled([
        withTimeout(publicApi.tennis.live(), 1_800),
        withTimeout(publicApi.tennis.match(eventKey), 1_800),
      ]);

      if (liveResult.status === "fulfilled") {
        const rows = (liveResult.value?.data ?? []) as TennisMatchState[];
        const fallback = rows.find((row) => row.event_key === eventKey) ?? null;
        if (fallback) return { data: fallback };
      }

      if (matchResult.status === "fulfilled") {
        const value = matchResult.value?.data ?? null;
        if (value) return matchResult.value;
      }

      return { data: cachedMatch ?? initialMatch ?? null };
    },
    initialData: { data: initialMatch },
    staleTime: 5_000,
    refetchInterval: 3_000,
    refetchOnReconnect: true,
    retry: 1,
    retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 2_500),
  });

  const queryValue = ((data as { data?: TennisMatchState | TennisFixture | null } | undefined)?.data ??
    null) as TennisMatchState | TennisFixture | null;
  const baseValue = queryValue ?? initialMatch ?? cachedMatch;

  useEffect(() => {
    if (!queryValue) return;
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.setItem(`tennis:match:${eventKey}`, JSON.stringify(queryValue));
      } catch {
        // best-effort cache persistence
      }
    }
  }, [eventKey, queryValue]);

  const initialState = useMemo(
    () => (isMatchState(baseValue) ? baseValue : fixtureToState(baseValue)),
    [baseValue],
  );

  const { match, status } = useTennisMatchSocket(initialState, eventKey);
  const resolvedMatch = match ?? initialState;

  if (!resolvedMatch) {
    const message = isLoading
      ? "Loading match details..."
      : isError
        ? "Live feed is temporarily unavailable. Retrying automatically."
        : "This tennis match is not available right now.";

    return (
      <div className="mx-auto max-w-6xl px-4 py-10 text-white sm:px-6 lg:px-8">
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-8 text-center text-white/60">
          {message}
        </div>
      </div>
    );
  }

  const publishedOdds = Array.isArray(resolvedMatch.published_odds) ? resolvedMatch.published_odds : [];
  const rawOdds = Array.isArray(resolvedMatch.raw_live_odds) ? resolvedMatch.raw_live_odds : [];
  const odds: TennisLiveOdds[] = publishedOdds.length > 0 ? publishedOdds : rawOdds;
  const showPrematch = isTennisPrematchLike(resolvedMatch);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <div className="flex items-center justify-end">
        <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100/80">
          socket {status}
        </div>
      </div>

      {showPrematch ? (
        <TennisPrematchBoard match={resolvedMatch} />
      ) : (
        <TennisLiveHud
          match={{
            player_1_name: resolvedMatch.player_1_name,
            player_2_name: resolvedMatch.player_2_name,
            server: resolvedMatch.server,
            event_status: resolvedMatch.event_status,
            score: resolvedMatch.score,
            sets: resolvedMatch.sets,
            point_by_point: resolvedMatch.point_by_point,
            current_game_score: resolvedMatch.current_game_score,
            break_point: resolvedMatch.break_point,
            set_point: resolvedMatch.set_point,
            match_point: resolvedMatch.match_point,
            tennis_context: resolvedMatch.tennis_context,
          }}
        />
      )}
      <TennisMarketBoard odds={odds} />
    </div>
  );
}
