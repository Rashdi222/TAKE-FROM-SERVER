"use client";

import { useRef, useSyncExternalStore } from "react";
import type { Match, Odds } from "@/lib/api";
import type {
  CanonicalMarketUpdatedPayload,
  CanonicalOddsUpdatedPayload,
  HealthDegradedPayload,
  LiveConnectionStatus,
  MarketResumedPayload,
  MarketSuspendedPayload,
  MatchStateUpdatePayload,
  OddsDelta,
} from "./types";
import { shouldUseCanonicalLiveTrading } from "./flags";

type MarketGroup = {
  key: string;
  label: string;
  oddsIds: string[];
};

type SuspendedMarketMeta = {
  status?: string | null;
  reason?: string | null;
  suspended_at?: string | null;
  meta?: Record<string, unknown>;
};

type CanonicalMarketState = {
  status: "active" | "suspended" | "closed";
  isSuspended: boolean;
  reason: string | null;
  sources: string[];
  consensusVersion: number;
  lastConsensusSource: string | null;
  lastConsensusAt: string | null;
};

type CanonicalOddsState = {
  marketKey: string;
  selectionKey: string;
  price: number | null;
  status: "active" | "suspended" | "closed";
  isSuspended: boolean;
  lastConsensusSource: string | null;
  consensusVersion: number;
  highWaterMarkMs: number;
  payload?: Record<string, unknown> | null;
};

type LiveMatchStoreState = {
  match: Match;
  oddsById: Record<string, Odds>;
  marketGroups: MarketGroup[];
  marketSuspended: boolean;
  suspensionReason: string | null;
  suspendedMarkets: Record<string, SuspendedMarketMeta>;
  canonicalMarkets: Record<string, CanonicalMarketState>;
  canonicalOdds: Record<string, CanonicalOddsState>;
  dataHealth: {
    degraded: boolean;
    warning: string | null;
    consensusSourceCount: number;
    degradedSources: string[];
  };
  connectionStatus: LiveConnectionStatus;
  lastStateVersion: number;
  lastOddsVersion: number;
};

type Listener = () => void;
const MIN_ODDS_RETENTION_MS = 60_000;
const HARD_STALE_ODDS_DROP_MS = 180_000;
const EMPTY_SNAPSHOT_GRACE_MS = 45_000;
const DEGRADED_EMPTY_SNAPSHOT_GRACE_MS = 20 * 60_000;
const LIVE_EMPTY_UPDATE_GRACE_MS = 60_000;
const MATCH_CACHE_TTL_MS = 20 * 60_000;

type CachedMatchOdds = {
  updatedAtMs: number;
  odds: Odds[];
};

const matchOddsCache = new Map<string, CachedMatchOdds>();

export type LiveMatchStore = {
  getState: () => LiveMatchStoreState;
  subscribe: (listener: Listener) => () => void;
  destroy: () => void;
  hydrateSnapshot: (match: Match, odds: Odds[]) => void;
  pruneExpiredOdds: () => void;
  setConnectionStatus: (status: LiveConnectionStatus) => void;
  applyMatchStateUpdated: (payload: MatchStateUpdatePayload) => void;
  applyMarketSuspended: (payload: MarketSuspendedPayload) => void;
  applyMarketResumed: (payload: MarketResumedPayload) => void;
  applyCanonicalMarketUpdated: (payload: CanonicalMarketUpdatedPayload) => void;
  applyCanonicalOddsUpdated: (payload: CanonicalOddsUpdatedPayload) => void;
  applyHealthDegraded: (payload: HealthDegradedPayload) => void;
  applyOddsUpdated: (payload: OddsDelta) => void;
};

function normalizeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function stateVersionForMatch(match: Match) {
  return normalizeNumber(match.live_state_version) || 0;
}

function cricketScoreFromPayload(payload: MatchStateUpdatePayload) {
  const score =
    payload.score && typeof payload.score === "object" && !Array.isArray(payload.score)
      ? (payload.score as Record<string, unknown>)
      : null;
  const embedded =
    score?.score && typeof score.score === "object" && !Array.isArray(score.score)
      ? (score.score as Record<string, unknown>)
      : null;
  const source = embedded || score;
  if (!source) return { runs: null, wickets: null, overs: null };

  return {
    runs: normalizeNumber(source.runs ?? (source.total as Record<string, unknown> | undefined)?.runs),
    wickets: normalizeNumber(
      source.wickets ?? (source.total as Record<string, unknown> | undefined)?.wickets,
    ),
    overs:
      source.overs != null
        ? String(source.overs)
        : null,
  };
}

function marketKeyForOdds(odds: Odds) {
  if (odds.market_family === "fancy_markets" && odds.window_label) {
    return `${String(odds.source_market_key || odds.bet_type || "market")}::${String(odds.window_label)}`;
  }
  return String(
    odds.source_market_key || odds.bet_type || odds.market || "market",
  );
}

function marketLabelForOdds(odds: Odds) {
  if (odds.market_family === "fancy_markets" && odds.window_label) {
    return String(odds.window_label);
  }
  if (odds.market_family === "totals_ladder" && odds.window_label) {
    return String(odds.window_label);
  }
  if (odds.market_family === "totals_ladder") {
    return "Projected Total Ladder";
  }
  if (odds.market_family === "fancy_markets") {
    return String(odds.window_label || "Fancy Session");
  }
  return String(
    odds.source_market_key || odds.market || odds.bet_type || "Market",
  );
}

function oddsIdentity(odds: Odds) {
  const selectionSnapshot =
    odds.provider_snapshot &&
    typeof odds.provider_snapshot === "object" &&
    !Array.isArray(odds.provider_snapshot) &&
    odds.provider_snapshot.selection &&
    typeof odds.provider_snapshot.selection === "object" &&
    !Array.isArray(odds.provider_snapshot.selection)
      ? (odds.provider_snapshot.selection as Record<string, unknown>)
      : null;

  const lineIdentity =
    String(
      odds.projected_line ||
        odds.window_label ||
        odds.provider_snapshot?.projected_line ||
        odds.provider_snapshot?.window_label ||
        selectionSnapshot?.line ||
        selectionSnapshot?.handicap ||
        odds.provider_snapshot?.line ||
        odds.provider_snapshot?.handicap ||
        "",
    ).trim() || "-";

  return [
    marketKeyForOdds(odds),
    String(odds.selection_key || odds.outcome || odds.id || "selection"),
    lineIdentity,
  ].join("::");
}

function buildGroups(oddsById: Record<string, Odds>) {
  const grouped = new Map<string, MarketGroup>();

  Object.values(oddsById)
    .filter(
      (odd) =>
        odd.visibility_status === "published" &&
        (odd.is_active !== false || odd.is_suspended === true),
    )
    .sort((a, b) => {
      const marketCompare = marketKeyForOdds(a).localeCompare(
        marketKeyForOdds(b),
      );
      if (marketCompare !== 0) return marketCompare;
      return String(a.outcome || "").localeCompare(String(b.outcome || ""));
    })
    .forEach((odd) => {
      const key = marketKeyForOdds(odd);
      const existing = grouped.get(key);
      if (existing) {
        existing.oddsIds.push(odd.id);
      } else {
        grouped.set(key, {
          key,
          label: marketLabelForOdds(odd),
          oddsIds: [odd.id],
        });
      }
    });

  return Array.from(grouped.values());
}

function timestampMsForOdds(odds: Odds) {
  const timestamp =
    (typeof odds.updated_at === "string" && odds.updated_at) ||
    (typeof odds.published_at === "string" && odds.published_at) ||
    (typeof odds.inserted_at === "string" && odds.inserted_at) ||
    (typeof odds.provider_snapshot?.updated_at === "string" &&
      odds.provider_snapshot.updated_at) ||
    null;

  if (!timestamp) return null;
  const parsed = new Date(timestamp).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function validForMsForOdds(odds: Odds) {
  const direct = normalizeNumber(odds.valid_for_ms);
  if (direct && direct > 0) return direct;
  const fromSnapshot = normalizeNumber(odds.provider_snapshot?.valid_for_ms);
  return fromSnapshot && fromSnapshot > 0 ? fromSnapshot : null;
}

function isExpiredOdds(odds: Odds, nowMs = Date.now()) {
  const validForMs = validForMsForOdds(odds);
  if (!validForMs) return false;
  const timestampMs = timestampMsForOdds(odds);
  if (!timestampMs) return false;

  const effectiveRetentionMs = Math.max(validForMs, MIN_ODDS_RETENTION_MS);
  return nowMs - timestampMs >= effectiveRetentionMs;
}

function filterLiveOdds(odds: Odds[], nowMs = Date.now()) {
  return odds.filter((odd) => !isExpiredOdds(odd, nowMs));
}

function cacheOddsForMatch(matchId: string | null | undefined, odds: Odds[]) {
  if (!matchId || odds.length === 0) return;
  matchOddsCache.set(String(matchId), {
    updatedAtMs: Date.now(),
    odds: odds.map((odd) => ({ ...odd })),
  });
}

function cachedOddsForMatch(
  match: Match,
  nowMs = Date.now(),
): Odds[] {
  const matchId = String(match.id || "");
  if (!matchId) return [];

  const cached = matchOddsCache.get(matchId);
  if (!cached) return [];

  if (nowMs - cached.updatedAtMs > MATCH_CACHE_TTL_MS) {
    matchOddsCache.delete(matchId);
    return [];
  }

  return cached.odds.filter(
    (odd) => odd.visibility_status === "published" && odd.is_active !== false,
  );
}

function selectSnapshotOdds(match: Match, odds: Odds[], nowMs = Date.now()) {
  const liveOdds = filterLiveOdds(odds, nowMs);
  if (liveOdds.length > 0) {
    cacheOddsForMatch(match.id, liveOdds);
    return liveOdds;
  }
  if (!isLikelyLiveMatch(match)) return liveOdds;

  const fallback = odds.filter(
    (odd) => odd.visibility_status === "published" && odd.is_active !== false,
  );
  if (fallback.length === 0) {
    const cached = cachedOddsForMatch(match, nowMs);
    if (cached.length > 0) return cached;
    return liveOdds;
  }

  const latestMs = Math.max(...fallback.map((odd) => timestampMsForOdds(odd) || 0));
  if (latestMs <= 0) {
    const cached = cachedOddsForMatch(match, nowMs);
    if (cached.length > 0) return cached;
    return liveOdds;
  }
  if (nowMs - latestMs > HARD_STALE_ODDS_DROP_MS) {
    const cached = cachedOddsForMatch(match, nowMs);
    if (cached.length > 0) return cached;
    return liveOdds;
  }
  cacheOddsForMatch(match.id, fallback);
  return fallback;
}

function oddsVersion(odds: Odds) {
  return normalizeNumber(odds.version_no) || 0;
}

function canonicalOddsIdentity(marketKey: string, selectionKey: string) {
  return [
    String(marketKey || "market"),
    String(selectionKey || "selection"),
  ].join("::");
}

function normalizeSuspendedMarkets(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, SuspendedMarketMeta>;
}

function isMatchSuspended(match: Match) {
  const marketState =
    match?.market_state && typeof match.market_state === "object"
      ? (match.market_state as Record<string, unknown>)
      : null;

  if (marketState && typeof marketState.suspended === "boolean") {
    return marketState.suspended === true;
  }

  return match?.suspended_at != null;
}

function suspensionReasonForMatch(match: Match) {
  const marketState =
    match?.market_state && typeof match.market_state === "object"
      ? (match.market_state as Record<string, unknown>)
      : null;

  if (marketState && "suspension_reason" in marketState) {
    return String(marketState.suspension_reason || "") || null;
  }

  return match?.suspension_reason || null;
}

function degradedStateForMatch(match: Match) {
  const marketState =
    match?.market_state && typeof match.market_state === "object"
      ? (match.market_state as Record<string, unknown>)
      : null;

  const degraded = marketState?.degraded === true;
  const reason = String(marketState?.degraded_reason || "").trim();

  return {
    degraded,
    warning: degraded
      ? reason
        ? `Live feed degraded (${reason.replace(/_/g, " ")}). Showing last published prices.`
        : "Live feed degraded. Showing last published prices."
      : null,
  };
}

function normalizeCanonicalStatus(
  value: unknown,
): CanonicalMarketState["status"] {
  const normalized = String(value || "active")
    .trim()
    .toLowerCase();
  if (normalized === "suspended") return "suspended";
  if (normalized === "closed") return "closed";
  return "active";
}

function normalizeCanonicalOddsStatus(
  value: unknown,
): CanonicalOddsState["status"] {
  const normalized = String(value || "active")
    .trim()
    .toLowerCase();
  if (normalized === "suspended") return "suspended";
  if (normalized === "closed") return "closed";
  return "active";
}

function mergeCricketContext(rawData: unknown, cricketContext: unknown) {
  const base =
    rawData && typeof rawData === "object" && !Array.isArray(rawData)
      ? { ...(rawData as Record<string, unknown>) }
      : {};

  if (
    cricketContext &&
    typeof cricketContext === "object" &&
    !Array.isArray(cricketContext)
  ) {
    base.cricket_context = cricketContext;
  }

  return base;
}

function mergeFootballContext(rawData: unknown, footballContext: unknown) {
  const base =
    rawData && typeof rawData === "object" && !Array.isArray(rawData)
      ? { ...(rawData as Record<string, unknown>) }
      : {};

  if (
    footballContext &&
    typeof footballContext === "object" &&
    !Array.isArray(footballContext)
  ) {
    base.football_context = footballContext;
  }

  return base;
}

function isLikelyLiveMatch(match: Match) {
  if (String(match.status || "").toLowerCase() === "live") return true;
  if (match.in_play_enabled === true) return true;
  if (typeof match.elapsed_minute === "number" && match.elapsed_minute > 0)
    return true;
  if (typeof match.runs_total === "number" && match.runs_total > 0) return true;
  if (typeof match.wickets_total === "number" && match.wickets_total > 0)
    return true;

  const raw = match.raw_data;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const status = (raw as Record<string, unknown>).match_status;
    if (typeof status === "string" && status.toLowerCase().includes("live"))
      return true;
  }

  return false;
}

export function createLiveMatchStore(
  match: Match,
  initialOdds: Odds[],
): LiveMatchStore {
  let state: LiveMatchStoreState = buildSnapshotState(
    match,
    initialOdds,
    "connecting",
  );

  const listeners = new Set<Listener>();
  const emit = () => listeners.forEach((listener) => listener());
  const setState = (
    updater: (current: LiveMatchStoreState) => LiveMatchStoreState,
  ) => {
    const next = updater(state);
    if (next !== state) {
      state = next;
      emit();
    }
  };

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    destroy: () => listeners.clear(),
    hydrateSnapshot: (nextMatch, nextOdds) => {
      setState((current) => {
        const sameMatch = current.match.id === nextMatch.id;
        const currentStateVersion = stateVersionForMatch(current.match);
        const incomingStateVersion = stateVersionForMatch(nextMatch);

        if (sameMatch && incomingStateVersion < currentStateVersion) {
          return current;
        }

        const nextState = buildSnapshotState(
          nextMatch,
          nextOdds,
          current.connectionStatus,
        );

        if (
          sameMatch &&
          Object.keys(current.oddsById).length > 0 &&
          Object.keys(nextState.oddsById).length === 0
        ) {
          const nowMs = Date.now();
          const latestExistingQuoteMs = Math.max(
            ...Object.values(current.oddsById).map(
              (odd) => timestampMsForOdds(odd) || 0,
            ),
          );
          const degradedOrSuspended =
            current.marketSuspended || current.dataHealth.degraded;
          const graceMs = degradedOrSuspended
            ? DEGRADED_EMPTY_SNAPSHOT_GRACE_MS
            : EMPTY_SNAPSHOT_GRACE_MS;

          if (
            isLikelyLiveMatch(nextMatch) &&
            latestExistingQuoteMs > 0 &&
            nowMs - latestExistingQuoteMs < graceMs
          ) {
            return {
              ...nextState,
              oddsById: current.oddsById,
              marketGroups: current.marketGroups,
              canonicalMarkets: current.canonicalMarkets,
              canonicalOdds: current.canonicalOdds,
              dataHealth: {
                ...current.dataHealth,
                degraded: true,
                warning:
                  "Live odds refresh is delayed. Keeping the previous board until the next publish.",
              },
            };
          }
        }

        return {
          ...nextState,
          canonicalMarkets: sameMatch ? current.canonicalMarkets : {},
          canonicalOdds: sameMatch ? current.canonicalOdds : {},
          dataHealth: sameMatch
            ? current.dataHealth
            : {
                degraded: false,
                warning: null,
                consensusSourceCount: 0,
                degradedSources: [],
              },
        };
      });
    },
    pruneExpiredOdds: () => {
      setState((current) => {
        const nowMs = Date.now();
        const existingOdds = Object.values(current.oddsById);
        const filteredOdds = filterLiveOdds(existingOdds, nowMs);
        if (filteredOdds.length === Object.keys(current.oddsById).length) {
          return current;
        }

        if (filteredOdds.length === 0 && existingOdds.length > 0) {
          if (
            isLikelyLiveMatch(current.match) &&
            (current.marketSuspended || current.dataHealth.degraded)
          ) {
            return current;
          }

          const latestQuoteMs = Math.max(
            ...existingOdds.map((odd) => timestampMsForOdds(odd) || 0),
          );
          if (
            latestQuoteMs > 0 &&
            nowMs - latestQuoteMs < HARD_STALE_ODDS_DROP_MS
          ) {
            return current;
          }

          if (isLikelyLiveMatch(current.match)) {
            const cached = cachedOddsForMatch(current.match, nowMs);
            if (cached.length > 0) {
              const cachedOddsById = Object.fromEntries(
                cached.map((odd) => [odd.id, odd]),
              );
              return {
                ...current,
                oddsById: cachedOddsById,
                marketGroups: buildGroups(cachedOddsById),
                dataHealth: {
                  ...current.dataHealth,
                  degraded: true,
                  warning:
                    "Live prices are refreshing. Keeping the previous board until the next publish completes.",
                },
              };
            }
          }
        }

        if (
          filteredOdds.length > 0 &&
          filteredOdds.length < existingOdds.length &&
          isLikelyLiveMatch(current.match)
        ) {
          const latestQuoteMs = Math.max(
            ...existingOdds.map((odd) => timestampMsForOdds(odd) || 0),
          );

          if (
            latestQuoteMs > 0 &&
            nowMs - latestQuoteMs < HARD_STALE_ODDS_DROP_MS
          ) {
            return {
              ...current,
              dataHealth: {
                ...current.dataHealth,
                degraded: true,
                warning:
                  "Live prices are updating in the background. Existing rows stay visible until fresh replacements arrive.",
              },
            };
          }
        }

        const nextOddsById = Object.fromEntries(
          filteredOdds.map((odd) => [odd.id, odd]),
        );
        return {
          ...current,
          oddsById: nextOddsById,
          marketGroups: buildGroups(nextOddsById),
        };
      });
    },
    setConnectionStatus: (connectionStatus) => {
      setState((current) =>
        current.connectionStatus === connectionStatus
          ? current
          : { ...current, connectionStatus },
      );
    },
    applyMatchStateUpdated: (payload) => {
      setState((current) => {
        const incomingStateVersion = normalizeNumber(payload.live_state_version);
        if (
          incomingStateVersion != null &&
          incomingStateVersion < current.lastStateVersion
        ) {
          return current;
        }

        const cricketScore = cricketScoreFromPayload(payload);
        const degraded =
          payload.market_state &&
          typeof payload.market_state === "object" &&
          (payload.market_state as Record<string, unknown>).degraded === true;
        const degradedReason =
          payload.market_state && typeof payload.market_state === "object"
            ? String(
                (payload.market_state as Record<string, unknown>)
                  .degraded_reason || "",
              ).trim()
            : "";

        const nextDataHealth =
          payload.payload &&
          typeof payload.payload === "object" &&
          (payload.payload as Record<string, unknown>).kind ===
            "generic_live_sync"
            ? {
                ...current.dataHealth,
                degraded: false,
                warning: null,
              }
            : payload.market_state && typeof payload.market_state === "object"
              ? {
                  ...current.dataHealth,
                  degraded: degraded === true,
                  warning: degraded
                    ? degradedReason
                      ? `Live feed degraded (${degradedReason.replace(/_/g, " ")}). Showing last published prices.`
                      : "Live feed degraded. Showing last published prices."
                    : null,
                }
              : current.dataHealth;

        return {
          ...current,
          match: {
            ...current.match,
            status: payload.status ?? current.match.status,
            score: payload.score ?? current.match.score,
            live_state_version:
              payload.live_state_version ?? current.match.live_state_version,
            live_event_seq:
              payload.live_event_seq ?? current.match.live_event_seq,
            current_innings:
              payload.current_innings ?? current.match.current_innings,
            current_over:
              payload.current_over ??
              cricketScore.overs ??
              current.match.current_over,
            current_ball_in_over:
              payload.current_ball_in_over ??
              current.match.current_ball_in_over,
            runs_total:
              payload.runs_total ??
              cricketScore.runs ??
              current.match.runs_total,
            wickets_total:
              payload.wickets_total ??
              cricketScore.wickets ??
              current.match.wickets_total,
            batting_team: payload.batting_team ?? current.match.batting_team,
            bowling_team: payload.bowling_team ?? current.match.bowling_team,
            momentum_index:
              payload.momentum_index ?? current.match.momentum_index,
            market_state: payload.market_state ?? current.match.market_state,
            suspended_markets:
              payload.suspended_markets ?? current.match.suspended_markets,
            // Football live score fields
            home_score: payload.home_score ?? current.match.home_score,
            away_score: payload.away_score ?? current.match.away_score,
            elapsed_minute:
              payload.elapsed_minute ?? current.match.elapsed_minute,
            stoppage_minute:
              payload.stoppage_minute ?? current.match.stoppage_minute,
            home_red_cards:
              payload.home_red_cards ?? current.match.home_red_cards,
            away_red_cards:
              payload.away_red_cards ?? current.match.away_red_cards,
            home_corners: payload.home_corners ?? current.match.home_corners,
            away_corners: payload.away_corners ?? current.match.away_corners,
            home_shots_on_target:
              payload.home_shots_on_target ??
              current.match.home_shots_on_target,
            away_shots_on_target:
              payload.away_shots_on_target ??
              current.match.away_shots_on_target,
            tempo_index: payload.tempo_index ?? current.match.tempo_index,
            raw_data:
              payload.football_context != null
                ? mergeFootballContext(
                    current.match.raw_data,
                    payload.football_context,
                  )
                : payload.cricket_context != null
                  ? mergeCricketContext(
                      current.match.raw_data,
                      payload.cricket_context,
                    )
                  : current.match.raw_data,
          },
          marketSuspended:
            payload.market_state && typeof payload.market_state === "object"
              ? (payload.market_state as Record<string, unknown>).suspended ===
                true
              : current.marketSuspended,
          suspensionReason:
            payload.market_state && typeof payload.market_state === "object"
              ? String(
                  (payload.market_state as Record<string, unknown>)
                    .suspension_reason || "",
                ) || null
              : current.suspensionReason,
          suspendedMarkets:
            payload.suspended_markets != null
              ? normalizeSuspendedMarkets(payload.suspended_markets)
              : payload.market_state && typeof payload.market_state === "object"
                ? normalizeSuspendedMarkets(
                    (payload.market_state as Record<string, unknown>)
                      .suspended_markets,
                  )
                : current.suspendedMarkets,
          dataHealth: nextDataHealth,
          lastStateVersion:
            payload.live_state_version ?? current.lastStateVersion,
        };
      });
    },
    applyMarketSuspended: (payload) => {
      if (shouldUseCanonicalLiveTrading(state.match)) return;

      const hasScopedMarketKeys =
        Array.isArray(payload.market_keys) && payload.market_keys.length > 0;

      setState((current) => ({
        ...current,
        marketSuspended: hasScopedMarketKeys ? current.marketSuspended : true,
        suspensionReason: hasScopedMarketKeys
          ? current.suspensionReason
          : payload.suspension_reason || current.suspensionReason,
        suspendedMarkets:
          payload.suspended_markets != null
            ? normalizeSuspendedMarkets(payload.suspended_markets)
            : hasScopedMarketKeys
              ? {
                  ...current.suspendedMarkets,
                  ...Object.fromEntries(
                    payload.market_keys!.map((key) => [
                      key,
                      {
                        status: payload.market_status || "suspended",
                        reason: payload.suspension_reason || null,
                        suspended_at: payload.suspended_at || null,
                      },
                    ]),
                  ),
                }
              : current.suspendedMarkets,
      }));
    },
    applyMarketResumed: (payload) => {
      if (shouldUseCanonicalLiveTrading(state.match)) return;

      const hasScopedMarketKeys =
        Array.isArray(payload.market_keys) && payload.market_keys.length > 0;

      setState((current) => ({
        ...current,
        marketSuspended: hasScopedMarketKeys ? current.marketSuspended : false,
        suspensionReason: hasScopedMarketKeys ? current.suspensionReason : null,
        suspendedMarkets:
          payload.suspended_markets != null
            ? normalizeSuspendedMarkets(payload.suspended_markets)
            : hasScopedMarketKeys
              ? Object.fromEntries(
                  Object.entries(current.suspendedMarkets).filter(
                    ([key]) => !payload.market_keys!.includes(key),
                  ),
                )
              : {},
        dataHealth:
          payload.degraded === true
            ? {
                ...current.dataHealth,
                degraded: true,
                warning: payload.degraded_reason
                  ? `Live feed degraded (${String(payload.degraded_reason).replace(/_/g, " ")}). Showing last published prices.`
                  : "Live feed degraded. Showing last published prices.",
              }
            : {
                ...current.dataHealth,
                degraded: false,
                warning: null,
              },
        lastStateVersion: payload.state_version ?? current.lastStateVersion,
        lastOddsVersion: payload.odds_version_no ?? current.lastOddsVersion,
      }));
    },
    applyCanonicalMarketUpdated: (payload) => {
      if (!payload.market_key) return;

      setState((current) => {
        const status = normalizeCanonicalStatus(
          payload.canonical_status || payload.market_status,
        );
        const nextCanonicalMarkets = { ...current.canonicalMarkets };

        nextCanonicalMarkets[payload.market_key] = {
          status,
          isSuspended: payload.is_suspended === true || status === "suspended",
          reason: payload.suspension_reason || null,
          sources: Array.isArray(payload.suspension_sources)
            ? payload.suspension_sources.filter(Boolean)
            : [],
          consensusVersion: normalizeNumber(payload.consensus_version) || 0,
          lastConsensusSource: payload.last_consensus_source || null,
          lastConsensusAt: payload.last_consensus_at || null,
        };

        return {
          ...current,
          canonicalMarkets: nextCanonicalMarkets,
        };
      });
    },
    applyCanonicalOddsUpdated: (payload) => {
      const incoming = Array.isArray(payload.odds) ? payload.odds : [];
      if (!incoming.length) return;

      setState((current) => {
        const nextCanonicalOdds = { ...current.canonicalOdds };

        for (const selection of incoming) {
          if (!selection.market_key || !selection.selection_key) continue;

          const identity = canonicalOddsIdentity(
            selection.market_key,
            selection.selection_key,
          );
          const existing = nextCanonicalOdds[identity];
          const highWaterMarkMs =
            normalizeNumber(selection.high_water_mark_ms) || 0;

          if (existing && highWaterMarkMs < existing.highWaterMarkMs) {
            continue;
          }

          const status = normalizeCanonicalOddsStatus(
            selection.canonical_status,
          );

          nextCanonicalOdds[identity] = {
            marketKey: selection.market_key,
            selectionKey: selection.selection_key,
            price: normalizeNumber(selection.odds_value),
            status,
            isSuspended:
              selection.is_suspended === true || status === "suspended",
            lastConsensusSource: selection.last_consensus_source || null,
            consensusVersion: normalizeNumber(selection.consensus_version) || 0,
            highWaterMarkMs,
            payload: selection.payload || null,
          };
        }

        return {
          ...current,
          canonicalOdds: nextCanonicalOdds,
          dataHealth: {
            degraded: false,
            warning: null,
            consensusSourceCount:
              normalizeNumber(payload.consensus_source_count) ||
              current.dataHealth.consensusSourceCount,
            degradedSources: Array.isArray(payload.degraded_sources)
              ? payload.degraded_sources.filter(Boolean)
              : current.dataHealth.degradedSources,
          },
        };
      });
    },
    applyHealthDegraded: (payload) => {
      setState((current) => ({
        ...current,
        dataHealth: {
          degraded: payload.degraded === true,
          warning: payload.warning || "Live feed interrupted - reconnecting...",
          consensusSourceCount:
            normalizeNumber(payload.consensus_source_count) || 0,
          degradedSources: Array.isArray(payload.degraded_sources)
            ? payload.degraded_sources.filter(Boolean)
            : [],
        },
      }));
    },
    applyOddsUpdated: (payload) => {
      if (shouldUseCanonicalLiveTrading(state.match)) return;

      const incoming = Array.isArray(payload.odds) ? payload.odds : [];
      if (!incoming.length) return;

      setState((current) => {
        const nowMs = Date.now();
        const incomingVersion = incoming.reduce(
          (max, odd) => Math.max(max, oddsVersion(odd)),
          0,
        );
        const incomingVisibleRows = incoming.filter(
          (odd) =>
            odd.visibility_status === "published" &&
            (odd.is_active !== false || odd.is_suspended === true),
        );
        const nextOddsById = { ...current.oddsById };
        const filteredIncoming = filterLiveOdds(incoming, nowMs);
        const incomingIdentities = new Set(
          filteredIncoming.map((odd) => oddsIdentity(odd)),
        );

        for (const [oddsId, existing] of Object.entries(nextOddsById)) {
          if (incomingIdentities.has(oddsIdentity(existing))) {
            delete nextOddsById[oddsId];
          }
        }

        for (const odd of filteredIncoming) {
          nextOddsById[odd.id] = odd;
        }

        const nextMarketGroups = buildGroups(nextOddsById);
        const latestIncomingQuoteMs = Math.max(
          ...filteredIncoming.map((odd) => timestampMsForOdds(odd) || 0),
        );

        if (
          incomingVisibleRows.length === 0 &&
          current.marketGroups.length > 0 &&
          isLikelyLiveMatch(current.match)
        ) {
          return {
            ...current,
            dataHealth: {
              ...current.dataHealth,
              degraded: true,
              warning:
                "Live prices are refreshing in the background. Current rates stay visible while the next update arrives.",
            },
            lastOddsVersion: Math.max(current.lastOddsVersion, incomingVersion),
          };
        }

        if (
          nextMarketGroups.length === 0 &&
          current.marketGroups.length > 0 &&
          isLikelyLiveMatch(current.match) &&
          (latestIncomingQuoteMs <= 0 ||
            nowMs - latestIncomingQuoteMs < LIVE_EMPTY_UPDATE_GRACE_MS)
        ) {
          return {
            ...current,
            dataHealth: {
              ...current.dataHealth,
              degraded: true,
              warning:
                "Live prices are refreshing. Keeping the previous board until the next publish completes.",
            },
            lastOddsVersion: Math.max(current.lastOddsVersion, incomingVersion),
          };
        }

        if (Object.keys(nextOddsById).length > 0) {
          cacheOddsForMatch(current.match.id, Object.values(nextOddsById));
        }

        return {
          ...current,
          oddsById: nextOddsById,
          marketGroups: nextMarketGroups,
          dataHealth: {
            ...current.dataHealth,
            degraded: false,
            warning: null,
          },
          lastOddsVersion: Math.max(current.lastOddsVersion, incomingVersion),
        };
      });
    },
  };
}

function buildSnapshotState(
  match: Match,
  odds: Odds[],
  connectionStatus: LiveConnectionStatus,
): LiveMatchStoreState {
  const liveOdds = selectSnapshotOdds(match, odds);
  if (liveOdds.length > 0) {
    cacheOddsForMatch(match.id, liveOdds);
  }
  const oddsById = Object.fromEntries(liveOdds.map((odd) => [odd.id, odd]));

  const degradedState = degradedStateForMatch(match);

  return {
    match,
    oddsById,
    marketGroups: buildGroups(oddsById),
    marketSuspended: isMatchSuspended(match),
    suspensionReason: suspensionReasonForMatch(match),
    suspendedMarkets: normalizeSuspendedMarkets(
      match?.suspended_markets ||
        (match?.market_state && typeof match.market_state === "object"
          ? (match.market_state as Record<string, unknown>).suspended_markets
          : null),
    ),
    canonicalMarkets: {},
    canonicalOdds: {},
    dataHealth: {
      degraded: degradedState.degraded,
      warning: degradedState.warning,
      consensusSourceCount: 0,
      degradedSources: [],
    },
    connectionStatus,
    lastStateVersion: normalizeNumber(match.live_state_version) || 0,
    lastOddsVersion: liveOdds.reduce(
      (max, odd) => Math.max(max, oddsVersion(odd)),
      0,
    ),
  };
}

export function useLiveMatchStoreSelector<T>(
  store: LiveMatchStore,
  selector: (state: LiveMatchStoreState) => T,
) {
  const lastStateRef = useRef<LiveMatchStoreState | null>(null);
  const lastSelectionRef = useRef<T | undefined>(undefined);
  const hasSelectionRef = useRef(false);

  const getSelection = () => {
    const nextState = store.getState();

    if (lastStateRef.current === nextState && hasSelectionRef.current) {
      return lastSelectionRef.current as T;
    }

    const nextSelection = selector(nextState);

    if (
      lastStateRef.current !== null &&
      Object.is(lastSelectionRef.current, nextSelection)
    ) {
      lastStateRef.current = nextState;
      return lastSelectionRef.current as T;
    }

    lastStateRef.current = nextState;
    lastSelectionRef.current = nextSelection;
    hasSelectionRef.current = true;
    return nextSelection;
  };

  return useSyncExternalStore(store.subscribe, getSelection, getSelection);
}
