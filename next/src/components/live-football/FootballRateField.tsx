"use client";

import { useEffect, useMemo, useRef } from "react";
import { Lock } from "lucide-react";
import type { LiveMatchSelectionQuote } from "@/lib/live/types";
import type { LiveMatchStore } from "@/lib/live/matchLiveStore";
import { useLiveMatchStoreSelector } from "@/lib/live/matchLiveStore";
import { shouldUseCanonicalLiveTrading } from "@/lib/live/flags";
import { formatFootballSelectionLabel } from "@/lib/football/footballMarketDictionary";
import { formatDecimal, toNumber } from "@/lib/format";

type FootballRateFieldProps = {
  store: LiveMatchStore;
  oddsId: string;
  onSelect: (quote: LiveMatchSelectionQuote) => void;
  compact?: boolean;
  className?: string;
};

type CanonicalMarketState = {
  status: "active" | "suspended" | "closed";
  isSuspended: boolean;
  reason: string | null;
};

type CanonicalOddsState = {
  price: number | null;
  status: "active" | "suspended" | "closed";
  isSuspended: boolean;
  lastConsensusSource: string | null;
};

export function FootballRateField({ store, oddsId, onSelect, compact = false, className = "" }: FootballRateFieldProps) {
  const odds = useLiveMatchStoreSelector(store, (state) => state.oddsById[oddsId]);
  const suspended = useLiveMatchStoreSelector(store, (state) => state.marketSuspended);
  const suspendedMarkets = useLiveMatchStoreSelector(store, (state) => state.suspendedMarkets);
  const canonicalMarkets = useLiveMatchStoreSelector(store, (state) => state.canonicalMarkets);
  const canonicalOdds = useLiveMatchStoreSelector(store, (state) => state.canonicalOdds);
  const dataHealth = useLiveMatchStoreSelector(store, (state) => state.dataHealth);
  const stateVersion = useLiveMatchStoreSelector(store, (state) => state.lastStateVersion);
  const match = useLiveMatchStoreSelector(store, (state) => state.match);
  const marketKey = String(odds?.source_market_key || odds?.bet_type || odds?.market || "market");
  const selectionKey = String(odds?.selection_key || odds?.outcome || oddsId);
  const canonicalOddsKey = `${marketKey}::${selectionKey}`;
  const canonicalOddsState = canonicalOdds[canonicalOddsKey] as CanonicalOddsState | undefined;
  const canonicalMode = shouldUseCanonicalLiveTrading(match);
  const legacyPrice = toNumber(odds?.odds_value ?? null);
  const displayPrice = canonicalMode ? canonicalOddsState?.price ?? null : canonicalOddsState?.price ?? legacyPrice;
  const previousPrice = useRef<number | null>(displayPrice);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const currentPrice = displayPrice;
    const priorPrice = previousPrice.current;
    if (currentPrice === null || priorPrice === null || currentPrice === priorPrice) {
      previousPrice.current = currentPrice;
      return;
    }

    const flashTokens =
      currentPrice > priorPrice
        ? ["bg-emerald-500/40", "border-emerald-400/60"]
        : ["bg-red-500/45", "border-red-400/60"];
    const node = buttonRef.current;
    node?.classList.remove("bg-red-500/45", "border-red-400/60", "bg-emerald-500/40", "border-emerald-400/60");
    node?.classList.add(...flashTokens);
    previousPrice.current = currentPrice;
    const timer = window.setTimeout(() => {
      node?.classList.remove("bg-red-500/45", "border-red-400/60", "bg-emerald-500/40", "border-emerald-400/60");
    }, 800);
    return () => {
      window.clearTimeout(timer);
      node?.classList.remove("bg-red-500/45", "border-red-400/60", "bg-emerald-500/40", "border-emerald-400/60");
    };
  }, [displayPrice]);

  const marketSuspension = suspendedMarkets[marketKey];
  const canonicalMarket = canonicalMarkets[marketKey] as CanonicalMarketState | undefined;
  const marketSuspended = canonicalMarket ? canonicalMarket.isSuspended : Boolean(marketSuspension);
  const canonicalLocked =
    canonicalMarket?.status === "suspended" ||
    canonicalMarket?.status === "closed" ||
    canonicalOddsState?.status === "suspended" ||
    canonicalOddsState?.status === "closed";
  const disabled =
    dataHealth.degraded ||
    suspended ||
    marketSuspended ||
    canonicalLocked ||
    !odds ||
    (!canonicalMode && odds.is_active === false) ||
    (canonicalMode && !canonicalOddsState);
  const toneClass = useMemo(() => {
    const marketToken = String(odds?.source_market_key || odds?.bet_type || odds?.market || "").toLowerCase();
    const key = String(odds?.selection_key || odds?.outcome || oddsId).toLowerCase();

    if (marketToken.includes("match_winner") || marketToken.includes("winner")) {
      if (key.includes("draw") || key === "x") {
        return "border-amber-400/35 bg-amber-400/10 text-amber-100 hover:bg-amber-400/16";
      }
      if (key.includes("team2") || key.includes("away") || key === "2" || key === "b") {
        return "border-red-400/35 bg-red-500/12 text-red-100 hover:bg-red-500/18";
      }
      return "border-emerald-400/35 bg-emerald-500/12 text-emerald-100 hover:bg-emerald-500/18";
    }

    if (marketToken.includes("over_under") || marketToken.includes("total")) {
      if (key.includes("under")) {
        return "border-red-400/35 bg-red-500/12 text-red-100 hover:bg-red-500/18";
      }
      if (key.includes("over")) {
        return "border-emerald-400/35 bg-emerald-500/12 text-emerald-100 hover:bg-emerald-500/18";
      }
    }

    if (marketToken.includes("btts")) {
      if (key.includes("no")) {
        return "border-red-400/35 bg-red-500/12 text-red-100 hover:bg-red-500/18";
      }
      if (key.includes("yes")) {
        return "border-emerald-400/35 bg-emerald-500/12 text-emerald-100 hover:bg-emerald-500/18";
      }
    }

    if (key.includes("draw") || key === "x") {
      return "border-amber-400/35 bg-amber-400/10 text-amber-100 hover:bg-amber-400/16";
    }

    return "border-sky-400/35 bg-sky-500/12 text-sky-100 hover:bg-sky-500/18";
  }, [odds, oddsId]);

  if (!odds) {
    return (
      <div className="rounded-[var(--r-md)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-4 text-sm text-[var(--c-text-faint)]">
        Unavailable
      </div>
    );
  }

  const quotedPrice = displayPrice ?? legacyPrice ?? 0;
  const disabledReason = String(
    canonicalMarket?.reason ||
      odds.suspension_reason ||
      marketSuspension?.reason ||
      (suspended ? "board_temporarily_paused" : "temporarily_unavailable"),
  ).replace(/_/g, " ");
  const selectionLabel = formatFootballSelectionLabel(String(odds.outcome || odds.selection_key || "Selection"), {
    marketKey,
    team1: match?.team1 || null,
    team2: match?.team2 || null,
  });
  const handleClick = () => {
    if (disabled) return;
    onSelect({
      oddsId: odds.id,
      matchId: String(odds.match_id || ""),
      marketKey: String(odds.source_market_key || odds.bet_type || odds.market || "market"),
      selectionKey: String(odds.selection_key || odds.outcome || odds.id),
      label: selectionLabel,
      quotedPrice,
      oddsVersionNo: Number(odds.version_no || 0),
      stateVersion,
    });
  };

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={handleClick}
      disabled={disabled}
      aria-disabled={disabled}
      className={[
        "group relative rounded-[var(--r-md)] border px-3 py-2.5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-colors duration-200 ease-out [transition-property:background-color,border-color,color]",
        compact ? "min-w-0 w-full" : "min-w-[118px]",
        toneClass,
        disabled
          ? "cursor-not-allowed border-[var(--c-border)] bg-[repeating-linear-gradient(135deg,rgba(148,163,184,0.18)_0,rgba(148,163,184,0.18)_8px,rgba(255,255,255,0.04)_8px,rgba(255,255,255,0.04)_16px)] text-[var(--c-text-faint)] opacity-60 shadow-none"
          : "",
        className,
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-current/70">
            {selectionLabel}
          </div>
          <div className="mt-1.5 text-xl font-bold tracking-[-0.04em] text-current">
            {disabled && (odds.is_suspended || canonicalLocked)
              ? "Paused"
              : canonicalMode && displayPrice === null
                ? "Syncing"
                : formatDecimal(displayPrice || quotedPrice)}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          {disabled ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-amber-100">
              <Lock className="h-3 w-3 shrink-0" />
              Temporarily unavailable
            </span>
          ) : null}
          {disabled ? <Lock className="mt-1 h-4 w-4 shrink-0 text-current/75" /> : null}
        </div>
      </div>
      <div className="mt-1.5 text-[10px] text-current/70">
        {canonicalOddsState?.lastConsensusSource
          ? `${canonicalOddsState.lastConsensusSource} canonical`
          : canonicalMode
            ? "canonical live"
            : `v${Number(odds.version_no || 0)}`}{" "}
        · state {stateVersion}
      </div>
      {disabled ? (
        <div className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-medium text-current/75">
          <Lock className="h-3.5 w-3.5 shrink-0" />
          {dataHealth.degraded
            ? dataHealth.warning || "Live feed interrupted - reconnecting..."
            : canonicalMode && !canonicalOddsState
              ? "Awaiting canonical live price"
            : canonicalLocked
              ? "Market locked by live consensus"
              : suspended
                ? "Board temporarily paused"
                : disabledReason}
        </div>
      ) : null}
    </button>
  );
}
