"use client";

import { useEffect, useMemo, useRef } from "react";
import { Lock } from "lucide-react";
import type { LiveMatchSelectionQuote } from "@/lib/live/types";
import type { LiveMatchStore } from "@/lib/live/matchLiveStore";
import { useLiveMatchStoreSelector } from "@/lib/live/matchLiveStore";
import { formatDecimal, toNumber } from "@/lib/format";

type RateFieldProps = {
  store: LiveMatchStore;
  oddsId: string;
  onSelect: (quote: LiveMatchSelectionQuote) => void;
};

export function RateField({ store, oddsId, onSelect }: RateFieldProps) {
  const odds = useLiveMatchStoreSelector(store, (state) => state.oddsById[oddsId]);
  const suspended = useLiveMatchStoreSelector(store, (state) => state.marketSuspended);
  const suspendedMarkets = useLiveMatchStoreSelector(store, (state) => state.suspendedMarkets);
  const stateVersion = useLiveMatchStoreSelector(store, (state) => state.lastStateVersion);
  const previousPrice = useRef<number | null>(toNumber(odds?.odds_value ?? null));
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const marketKey = String(odds?.source_market_key || odds?.bet_type || odds?.market || "market");
  const marketText = `${marketKey} ${odds?.market || ""} ${odds?.bet_type || ""}`.toLowerCase();
  const isOverUnder = marketText.includes("over_under") || marketText.includes("over under") || marketText.includes("total");

  useEffect(() => {
    const currentPrice = toNumber(odds?.odds_value ?? null);
    const priorPrice = previousPrice.current;
    if (currentPrice === null || priorPrice === null || currentPrice === priorPrice) {
      previousPrice.current = currentPrice;
      return;
    }

    const changeRatio = priorPrice > 0 ? Math.abs(currentPrice - priorPrice) / priorPrice : 0;
    if (changeRatio < 0.02) {
      previousPrice.current = currentPrice;
      return;
    }

    const flashTokens =
      currentPrice > priorPrice
        ? changeRatio >= 0.05 || isOverUnder
          ? ["bg-emerald-500/55", "border-emerald-300/70", "shadow-[0_0_0_1px_rgba(52,211,153,0.32),0_0_16px_rgba(16,185,129,0.18)]", "animate-pulse"]
          : ["bg-emerald-500/40", "border-emerald-400/60"]
        : changeRatio >= 0.05 || isOverUnder
          ? ["bg-red-500/55", "border-red-300/70", "shadow-[0_0_0_1px_rgba(248,113,113,0.32),0_0_16px_rgba(239,68,68,0.18)]", "animate-pulse"]
          : ["bg-red-500/45", "border-red-400/60"];
    const node = buttonRef.current;
    node?.classList.remove(
      "bg-red-500/45",
      "border-red-400/60",
      "bg-emerald-500/40",
      "border-emerald-400/60",
      "bg-red-500/55",
      "border-red-300/70",
      "shadow-[0_0_0_1px_rgba(248,113,113,0.32),0_0_16px_rgba(239,68,68,0.18)]",
      "bg-emerald-500/50",
      "border-emerald-300/70",
      "shadow-[0_0_0_1px_rgba(52,211,153,0.32),0_0_16px_rgba(16,185,129,0.18)]",
      "bg-emerald-500/55",
      "bg-red-500/55",
      "animate-pulse",
    );
    node?.classList.add(...flashTokens);
    previousPrice.current = currentPrice;
    const timer = window.setTimeout(() => {
      node?.classList.remove("bg-red-500/45", "border-red-400/60", "bg-emerald-500/40", "border-emerald-400/60", "animate-pulse");
    }, isOverUnder ? 420 : changeRatio >= 0.05 ? 620 : 520);
    return () => {
      window.clearTimeout(timer);
      node?.classList.remove("bg-red-500/45", "border-red-400/60", "bg-emerald-500/40", "border-emerald-400/60", "animate-pulse");
    };
  }, [isOverUnder, odds?.odds_value]);

  const marketSuspension = suspendedMarkets[marketKey];
  const marketSuspended = Boolean(marketSuspension);
  const disabled = suspended || marketSuspended || !odds || odds.is_active === false;
  const toneClass = useMemo(() => {
    const key = String(odds?.selection_key || odds?.outcome || odds?.source_market_key || oddsId).toLowerCase();
    if (key.includes("team2") || key.includes("under") || key.includes("no")) {
      return "border-pink-500/30 bg-pink-500/10 text-pink-100 hover:bg-pink-500/16";
    }
    return "border-sky-500/30 bg-sky-500/10 text-sky-100 hover:bg-sky-500/16";
  }, [odds, oddsId]);

  if (!odds) {
    return (
      <div className="rounded-[var(--r-md)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-4 text-sm text-[var(--c-text-faint)]">
        Unavailable
      </div>
    );
  }

  const quotedPrice = toNumber(odds.odds_value) || 0;
  const handleClick = () => {
    if (disabled) return;
    onSelect({
      oddsId: odds.id,
      matchId: String(odds.match_id || ""),
      marketKey: String(odds.source_market_key || odds.bet_type || odds.market || "market"),
      selectionKey: String(odds.selection_key || odds.outcome || odds.id),
      label: String(odds.outcome || odds.selection_key || "Selection"),
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
      className={[
        "group relative min-w-[140px] rounded-[var(--r-md)] border px-4 py-3 text-left transition-colors duration-200 ease-out [transition-property:background-color,border-color,color]",
        toneClass,
        disabled
          ? "cursor-not-allowed border-[var(--c-border)] bg-[repeating-linear-gradient(135deg,rgba(148,163,184,0.18)_0,rgba(148,163,184,0.18)_8px,rgba(255,255,255,0.04)_8px,rgba(255,255,255,0.04)_16px)] text-[var(--c-text-faint)] opacity-60 shadow-none"
          : "",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[11px] font-semibold uppercase tracking-[0.18em] text-current/70">
            {String(odds.outcome || odds.selection_key || "Selection")}
          </div>
          <div className="mt-2 text-2xl font-bold tracking-[-0.04em] text-current">{formatDecimal(quotedPrice)}</div>
        </div>
        {disabled ? <Lock className="mt-1 h-4 w-4 shrink-0 text-current/75" /> : null}
      </div>
      <div className="mt-2 text-[11px] text-current/70">
        v{Number(odds.version_no || 0)} · state {stateVersion}
      </div>
      {disabled ? (
        <div className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-current/75">
          <Lock className="h-3.5 w-3.5 shrink-0" />
          {suspended ? "Board temporarily paused" : "Temporarily unavailable"}
        </div>
      ) : null}
    </button>
  );
}
