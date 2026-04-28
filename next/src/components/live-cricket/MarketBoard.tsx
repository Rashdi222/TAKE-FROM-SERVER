"use client";

import { type ReactNode, memo, useEffect, useMemo, useRef, useState } from "react";
import { Flame, Gauge, Lock, Layers3, Sparkles, UserRound } from "lucide-react";
import type { Odds } from "@/lib/api";
import { formatCricketMarketLabel } from "@/lib/cricket/cricketMarketDictionary";
import type { LiveMatchStore } from "@/lib/live/matchLiveStore";
import { useLiveMatchStoreSelector } from "@/lib/live/matchLiveStore";
import type { LiveMatchSelectionQuote } from "@/lib/live/types";
import { formatDecimal, toNumber } from "@/lib/format";

type MarketTabKey = "all" | "main" | "overs" | "player_props" | "fancy" | "session";

type MarketBoardProps = {
  store: LiveMatchStore;
  onSelect: (quote: LiveMatchSelectionQuote, odds: Odds) => void;
};

const marketTabs: Array<{ key: MarketTabKey; label: string; icon: ReactNode }> = [
  { key: "all", label: "ALL", icon: <Layers3 className="h-3.5 w-3.5" /> },
  { key: "main", label: "MAIN", icon: <Flame className="h-3.5 w-3.5" /> },
  { key: "overs", label: "OVERS", icon: <Gauge className="h-3.5 w-3.5" /> },
  { key: "player_props", label: "PLAYER PROPS", icon: <UserRound className="h-3.5 w-3.5" /> },
  { key: "fancy", label: "FANCY", icon: <Sparkles className="h-3.5 w-3.5" /> },
  { key: "session", label: "SESSION", icon: <Sparkles className="h-3.5 w-3.5" /> },
];

export function MarketBoard({ store, onSelect }: MarketBoardProps) {
  const match = useLiveMatchStoreSelector(store, (state) => state.match);
  const groups = useLiveMatchStoreSelector(store, (state) => state.marketGroups);
  const suspended = useLiveMatchStoreSelector(store, (state) => state.marketSuspended);
  const suspendedMarkets = useLiveMatchStoreSelector(store, (state) => state.suspendedMarkets);
  const dataHealth = useLiveMatchStoreSelector(store, (state) => state.dataHealth);
  const [activeTab, setActiveTab] = useState<MarketTabKey>("all");

  const filteredGroups = useMemo(
    () => groups.filter((group) => tabMatchesGroup(activeTab, group.key, group.label)),
    [activeTab, groups],
  );

  const suspensionMessage = visibleSuspensionMessage(
    match,
    filteredGroups,
    suspendedMarkets,
    suspended,
    dataHealth,
  );

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <div className="flex min-w-max gap-2 rounded-[1.25rem] border border-white/10 bg-white/[0.04] p-2 backdrop-blur-xl">
          {marketTabs.map((tab) => {
            const active = tab.key === activeTab;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={[
                  "inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold uppercase tracking-[0.18em] transition-all duration-200",
                  active
                    ? "border border-cyan-300/30 bg-[linear-gradient(135deg,rgba(34,211,238,0.28),rgba(59,130,246,0.12))] text-white shadow-[0_16px_48px_rgba(8,145,178,0.22)]"
                    : "border border-transparent text-white/58 hover:border-white/10 hover:bg-white/[0.06] hover:text-white",
                ].join(" ")}
              >
                <span className="text-cyan-200">{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {suspensionMessage ? (
        <div className="rounded-[1.2rem] border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {suspensionMessage}
        </div>
      ) : null}

      <div className="space-y-2">
        {filteredGroups.map((group) => (
          <CommandMarketRow key={group.key} store={store} group={group} onSelect={onSelect} />
        ))}
      </div>

      {filteredGroups.length === 0 ? (
        <div className="rounded-[1.4rem] border border-white/10 bg-white/[0.03] px-5 py-8 text-center text-sm text-white/60">
          {emptyMarketMessage(match, suspended, dataHealth)}
        </div>
      ) : null}
    </div>
  );
}

type MarketGroup = {
  key: string;
  label: string;
  oddsIds: string[];
};

const CommandMarketRow = memo(function CommandMarketRow({
  store,
  group,
  onSelect,
}: {
  store: LiveMatchStore;
  group: MarketGroup;
  onSelect: (quote: LiveMatchSelectionQuote, odds: Odds) => void;
}) {
  const suspendedMarkets = useLiveMatchStoreSelector(store, (state) => state.suspendedMarkets);
  const marketSuspension = suspendedMarkets[group.key];
  const marketOdds = useLiveMatchStoreSelector(store, (state) =>
    group.oddsIds.map((oddsId) => state.oddsById[oddsId]).filter(Boolean) as Odds[],
  );
  const rowVolume = useMemo(() => computeRowVolume(marketOdds), [marketOdds]);

  return (
    <div className="rounded-[1rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.035),rgba(255,255,255,0.012))] px-2.5 py-2 shadow-[0_10px_24px_rgba(0,0,0,0.14)] backdrop-blur-xl">
        <div className="grid gap-2 xl:grid-cols-[170px_minmax(0,1fr)] xl:items-center">
        <div className="xl:pr-2">
          <div className="truncate text-[12px] font-semibold tracking-[-0.02em] text-white">{humanizeLabel(group.label)}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px]">
            <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-0.5 font-medium text-cyan-100">
              {rowVolume}
            </span>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 font-medium text-white/65">
              {marketOdds.length} selections
            </span>
            {marketSuspension ? (
              <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 font-medium text-amber-100">
                {String(marketSuspension.reason || "market suspended").replace(/_/g, " ")}
              </span>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(132px,1fr))] gap-1.5 xl:border-l xl:border-white/8 xl:pl-3">
          {group.oddsIds.map((oddsId) => (
            <CommandOddsButton key={oddsId} store={store} oddsId={oddsId} onSelect={onSelect} />
          ))}
        </div>
      </div>
    </div>
  );
});

type CommandOddsButtonProps = {
  store: LiveMatchStore;
  oddsId: string;
  onSelect: (quote: LiveMatchSelectionQuote, odds: Odds) => void;
};

const CommandOddsButton = memo(function CommandOddsButton({ store, oddsId, onSelect }: CommandOddsButtonProps) {
  const odds = useLiveMatchStoreSelector(store, (state) => state.oddsById[oddsId]);
  const suspended = useLiveMatchStoreSelector(store, (state) => state.marketSuspended);
  const suspendedMarkets = useLiveMatchStoreSelector(store, (state) => state.suspendedMarkets);
  const stateVersion = useLiveMatchStoreSelector(store, (state) => state.lastStateVersion);
  const previousPrice = useRef<number | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const marketKey = String(odds?.source_market_key || odds?.bet_type || odds?.market || "market");
  const priceIdentity = stablePriceIdentity(odds);
  const marketText = `${marketKey} ${odds?.market || ""} ${odds?.bet_type || ""}`.toLowerCase();
  const isOverUnder = marketText.includes("over_under") || marketText.includes("over under") || marketText.includes("total");

  useEffect(() => {
    const currentPrice = toNumber(odds?.odds_value ?? null);
    const priorPrice = priceIdentity ? previousPricesBySelection.get(priceIdentity) ?? null : null;
    if (currentPrice === null || priorPrice === null || currentPrice === priorPrice) {
      previousPrice.current = currentPrice;
      if (priceIdentity && currentPrice !== null) previousPricesBySelection.set(priceIdentity, currentPrice);
      return;
    }

    const changeRatio = priorPrice > 0 ? Math.abs(currentPrice - priorPrice) / priorPrice : 0;
    if (changeRatio < 0.02) {
      previousPrice.current = currentPrice;
      if (priceIdentity && currentPrice !== null) previousPricesBySelection.set(priceIdentity, currentPrice);
      return;
    }

    const flashTokens =
      currentPrice > priorPrice
        ? changeRatio >= 0.05 || isOverUnder
          ? ["bg-emerald-500/28", "border-emerald-300/70", "shadow-[0_0_0_1px_rgba(52,211,153,0.34),0_0_18px_rgba(16,185,129,0.24)]", "animate-pulse", "-translate-y-0.5"]
          : ["bg-emerald-500/18", "border-emerald-400/45", "shadow-[0_0_0_1px_rgba(52,211,153,0.25)]"]
        : changeRatio >= 0.05 || isOverUnder
          ? ["bg-red-500/28", "border-red-300/70", "shadow-[0_0_0_1px_rgba(248,113,113,0.32),0_0_18px_rgba(239,68,68,0.22)]", "animate-pulse", "-translate-y-0.5"]
          : ["bg-red-500/18", "border-red-400/45", "shadow-[0_0_0_1px_rgba(248,113,113,0.22)]"];

    const node = buttonRef.current;
    node?.classList.remove(
      "bg-emerald-500/18",
      "border-emerald-400/45",
      "shadow-[0_0_0_1px_rgba(52,211,153,0.25)]",
      "bg-red-500/18",
      "border-red-400/45",
      "shadow-[0_0_0_1px_rgba(248,113,113,0.22)]",
      "bg-emerald-500/28",
      "border-emerald-300/65",
      "shadow-[0_0_0_1px_rgba(52,211,153,0.32),0_0_18px_rgba(16,185,129,0.22)]",
      "bg-red-500/28",
      "border-red-300/65",
      "shadow-[0_0_0_1px_rgba(248,113,113,0.30),0_0_18px_rgba(239,68,68,0.20)]",
      "border-emerald-300/70",
      "shadow-[0_0_0_1px_rgba(52,211,153,0.34),0_0_18px_rgba(16,185,129,0.24)]",
      "border-red-300/70",
      "shadow-[0_0_0_1px_rgba(248,113,113,0.32),0_0_18px_rgba(239,68,68,0.22)]",
      "animate-pulse",
      "-translate-y-0.5",
    );
    node?.classList.add(...flashTokens);
    previousPrice.current = currentPrice;
    if (priceIdentity && currentPrice !== null) previousPricesBySelection.set(priceIdentity, currentPrice);

    const timer = window.setTimeout(() => {
      node?.classList.remove(...flashTokens);
    }, isOverUnder ? 420 : changeRatio >= 0.05 ? 620 : 520);

    return () => {
      window.clearTimeout(timer);
      node?.classList.remove(...flashTokens);
    };
  }, [isOverUnder, odds?.odds_value, priceIdentity]);

  if (!odds) return null;

  const marketSuspension = suspendedMarkets[marketKey];
  const marketSuspended = Boolean(marketSuspension);
  const disabled = suspended || marketSuspended || odds.is_active === false || odds.is_suspended === true;
  const quotedPrice = toNumber(odds.odds_value) || 0;
  const selectionLabel = formatSelectionLabel(odds);
  const projectedLine = selectionProjectedLine(odds);
  const probabilityTag = probabilityTagForOdds(odds, quotedPrice);
  const riskChips = marketRiskChips(odds);
  const volumeLabel = marketVolumeLabel(odds);
  const toneClass = selectionTone(odds);

  const handleClick = () => {
    if (disabled) return;
    onSelect(
      {
        oddsId: odds.id,
        matchId: String(odds.match_id || ""),
        marketKey,
        selectionKey: String(odds.selection_key || odds.outcome || odds.id),
        label: selectionLabel,
        quotedPrice,
        oddsVersionNo: Number(odds.version_no || 0),
        stateVersion,
      },
      odds,
    );
  };

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className={[
        "min-w-0 rounded-[0.9rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.015))] px-2.5 py-1.5 text-left transition-all duration-300 ease-out",
        toneClass,
        disabled
          ? "cursor-not-allowed border-white/8 bg-[repeating-linear-gradient(135deg,rgba(148,163,184,0.16)_0,rgba(148,163,184,0.16)_10px,rgba(255,255,255,0.03)_10px,rgba(255,255,255,0.03)_20px)] opacity-55 shadow-none"
          : "hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.06]",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="whitespace-normal break-words text-[10px] font-semibold uppercase tracking-[0.1em] text-white/55">
            {selectionLabel}
          </div>
          {projectedLine ? (
            <div className="mt-1 inline-flex items-center rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-white/68">
              Line {projectedLine}
            </div>
          ) : null}
          <div className="mt-1 text-[1.2rem] font-semibold leading-none tracking-[-0.04em] text-white">{formatDecimal(quotedPrice)}</div>
        </div>
        <div className="flex flex-col items-end gap-1">
          {probabilityTag ? <ProbabilityTag text={probabilityTag.text} tone={probabilityTag.tone} /> : null}
        </div>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[10px] text-white/68">
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5">{volumeLabel}</span>
        {quoteFreshness(odds) ? (
          <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-0.5 text-cyan-100">
            {quoteFreshness(odds)}
          </span>
        ) : null}
        {odds.max_stake_amount ? (
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5">
            Max {formatDecimal(odds.max_stake_amount)}
          </span>
        ) : null}
        {riskChips.map((chip) => (
          <span
            key={chip.text}
            className={[
              "rounded-full border px-2 py-0.5 font-medium",
              chip.tone === "amber"
                ? "border-amber-400/20 bg-amber-400/10 text-amber-100"
                : chip.tone === "cyan"
                  ? "border-cyan-400/20 bg-cyan-400/10 text-cyan-100"
                  : "border-white/10 bg-white/[0.04] text-white/70",
            ].join(" ")}
          >
            {chip.text}
          </span>
        ))}
        {disabled ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-amber-100">
            <Lock className="h-3 w-3" />
            {String(odds.suspension_reason || marketSuspension?.reason || "temporarily_paused").replace(/_/g, " ")}
          </span>
        ) : null}
      </div>
    </button>
  );
});

function tabMatchesGroup(tab: MarketTabKey, key: string, label: string) {
  const haystack = `${key} ${label}`.toLowerCase();

  if (tab === "all") return true;

  if (tab === "main") {
    return (
      haystack.includes("match_winner") ||
      haystack.includes("winner") ||
      haystack.includes("moneyline") ||
      haystack.includes("over_under") ||
      haystack.includes("ladder") ||
      haystack.includes("total") ||
      haystack.includes("next_ball") || haystack.includes("fancy_session")
    );
  }

  if (tab === "overs") {
    return haystack.includes("over") || haystack.includes("under") || haystack.includes("total") || haystack.includes("ladder") || haystack.includes("run rate");
  }

  if (tab === "player_props") {
    return haystack.includes("player") || haystack.includes("batsman") || haystack.includes("bowler") || haystack.includes("wicket");
  }

  if (tab === "fancy") {
    return haystack.includes("fancy") || haystack.includes("runs in next");
  }

  return haystack.includes("session") || haystack.includes("fancy") || haystack.includes("in_play") || haystack.includes("next_ball");
}

function humanizeLabel(value: string) {
  return formatCricketMarketLabel(value);
}

function visibleSuspensionMessage(
  match: { market_state?: Record<string, unknown> | null; suspension_reason?: string | null },
  groups: Array<{ key: string; label: string }>,
  suspendedMarkets: Record<string, { reason?: string | null }>,
  suspended: boolean,
  dataHealth: { degraded: boolean; warning: string | null },
) {
  if (suspended) {
    return primaryLiveBoardMessage(match);
  }

  if (dataHealth.degraded && dataHealth.warning) {
    return "Live prices are refreshing in the background. Current rates stay visible while the next update arrives.";
  }

  const pausedCount = groups.filter((group) => suspendedMarkets[group.key]).length;
  if (!pausedCount) return null;
  return `${pausedCount} market ${pausedCount === 1 ? "group is" : "groups are"} temporarily paused while the rest of the live prices stay available.`;
}

function emptyMarketMessage(
  match: { market_state?: Record<string, unknown> | null; suspension_reason?: string | null; status?: string | null; start_time?: string | null },
  suspended: boolean,
  dataHealth: { degraded: boolean; warning: string | null },
) {
  if (suspended) {
    return primaryLiveBoardMessage(match);
  }

  if (dataHealth.degraded) {
    return "Live prices are in degraded mode. Last published rates remain available while fresh data catches up.";
  }

  const elapsedMinutes = elapsedMatchMinutes(match.start_time);
  if (String(match.status || "").toLowerCase() === "live") {
    if (elapsedMinutes !== null && elapsedMinutes >= 30) {
      return "Live prices are temporarily unavailable for this tab. The board is waiting for the next published refresh."
    }

    return "Live prices are being prepared for this tab. The next published update should appear here shortly."
  }

  return "Prices are not available in this tab right now.";
}

function primaryLiveBoardMessage(match: {
  market_state?: Record<string, unknown> | null;
  suspension_reason?: string | null;
  start_time?: string | null;
}) {
  const marketState =
    match.market_state && typeof match.market_state === "object"
      ? match.market_state
      : {};

  const reviewRequired =
    marketState["manual_admin_review"] === true ||
    marketState["live_ai_publish_mode"] === "review_required";

  if (reviewRequired) {
    return "Live prices have been generated and are waiting for confirmation before they are shown on this match.";
  }

  const reason = String(marketState["suspension_reason"] || match.suspension_reason || "").trim();

  switch (reason) {
    case "live_bootstrap":
    case "bootstrap_missing_board":
      if ((elapsedMatchMinutes(match.start_time) ?? 0) >= 30) {
        return "Live prices are rebuilding for this match after a temporary refresh gap. Please check again shortly."
      }
      return "Live prices are starting up for this match. Please check again shortly."
    case "provider_disconnect":
      return "The live feed is reconnecting. Prices will return once fresh data is stable."
    case "ai_engine_unavailable":
    case "bootstrap_recovery":
      return "Live prices are refreshing after a temporary sync issue. Please check again shortly."
    case "manual_admin_review":
      return "Live prices are waiting for confirmation before they are shown on this match."
    case "third_umpire_review":
      return "A review is in progress, so live prices are paused until play resumes."
    case "rain_delay":
      return "Play is delayed, so live prices are paused until the match resumes."
    default:
      return "Live prices are updating for this match. Markets will reopen as soon as the refresh completes."
  }
}

function elapsedMatchMinutes(startTime: string | null | undefined) {
  if (!startTime) return null;
  const parsed = new Date(startTime).getTime();
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.floor((Date.now() - parsed) / 60_000));
}

function selectionTone(odds: Odds) {
  const key = String(odds.selection_key || odds.outcome || odds.source_market_key || odds.id).toLowerCase();
  if (key.includes("lay") || key.includes("under") || key.includes("no") || key.includes("team2") || key.includes("away")) {
    return "hover:border-rose-300/25";
  }
  return "hover:border-cyan-300/25";
}

function selectionProjectedLine(odds: Odds) {
  const direct = asCleanString(odds.projected_line);
  if (direct) return direct;

  const snapshot = odds.provider_snapshot && typeof odds.provider_snapshot === "object" ? (odds.provider_snapshot as Record<string, unknown>) : null;
  const snapshotLine = asCleanString(snapshot?.line);
  if (snapshotLine) return snapshotLine;

  return null;
}

function formatSelectionLabel(odds: Odds) {
  const rawSelection = asCleanString(odds.outcome) || asCleanString(odds.selection_key) || "Selection";
  const normalizedSelection = prettySelection(rawSelection);
  const line = selectionProjectedLine(odds);
  if (!line) return normalizedSelection;

  const hasNumeric = /\d/.test(normalizedSelection);
  if (hasNumeric) return normalizedSelection;
  return `${normalizedSelection} ${line}`;
}

function prettySelection(value: string) {
  const normalized = value.trim();
  if (!normalized) return "Selection";

  const lower = normalized.toLowerCase();
  if (lower === "team1" || lower === "home") return "Home";
  if (lower === "team2" || lower === "away") return "Away";
  if (lower === "x" || lower === "draw") return "Draw";
  if (lower === "yes") return "Yes";
  if (lower === "no") return "No";
  if (lower === "over") return "Over";
  if (lower === "under") return "Under";

  return normalized.replace(/_/g, " ");
}

function asCleanString(value: unknown) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function marketVolumeLabel(odds: Odds) {
  const direct = toNumber(odds.matched_volume);
  const fallback =
    (toNumber(odds.max_payout_amount) || 0) * 8 +
    (toNumber(odds.max_stake_amount) || 0) * 16 +
    (toNumber(odds.liability) || 0) * 0.4;
  const base = direct !== null && direct > 0 ? direct : fallback;
  return `Volume: ${formatMillion(base)}`;
}

function computeRowVolume(odds: Odds[]) {
  const total = odds.reduce((acc, item) => {
    const direct = toNumber(item.matched_volume);
    if (direct !== null && direct > 0) return acc + direct;
    return acc + (toNumber(item.max_payout_amount) || 0) * 5 + (toNumber(item.max_stake_amount) || 0) * 10;
  }, 0);

  return `Volume ${formatMillion(total)}`;
}

function formatMillion(value: number) {
  const numeric = Number.isFinite(value) ? Math.max(value, 0) : 0;
  if (numeric >= 1_000_000) return `$${(numeric / 1_000_000).toFixed(1)}M`;
  if (numeric >= 1_000) return `$${(numeric / 1_000).toFixed(1)}K`;
  return `$${numeric.toFixed(0)}`;
}

function probabilityTagForOdds(odds: Odds, quotedPrice: number) {
  const marketText = `${odds.bet_type || ""} ${odds.market || ""} ${odds.source_market_key || ""}`.toLowerCase();
  if (!(marketText.includes("over") || marketText.includes("under") || marketText.includes("total"))) {
    return null;
  }

  if (!Number.isFinite(quotedPrice) || quotedPrice <= 1) return null;
  const implied = Math.min(99, Math.max(1, Math.round((1 / quotedPrice) * 100)));
  const tone: "high" | "medium" | "low" = implied >= 65 ? "high" : implied >= 45 ? "medium" : "low";
  return { text: `${implied}% ${tone === "high" ? "High" : tone === "medium" ? "Mid" : "Live"}`, tone };
}

function marketRiskChips(odds: Odds) {
  const chips: Array<{ text: string; tone: "amber" | "cyan" | "muted" }> = [];
  const playbooks = Array.isArray(odds.active_playbooks) ? odds.active_playbooks.filter(Boolean) : [];
  const bookmakerSummary =
    odds.bookmaker_summary && typeof odds.bookmaker_summary === "object"
      ? (odds.bookmaker_summary as Record<string, unknown>)
      : null;

  if (Boolean(odds.volatility_mode_active || bookmakerSummary?.volatility_mode_active)) {
    chips.push({ text: "High pressure", tone: "amber" });
  }

  if (Boolean(odds.elasticity_applied)) {
    chips.push({ text: "Fast repricing", tone: "cyan" });
  }

  if (playbooks.length > 0) {
    chips.push({ text: `${Math.min(playbooks.length, 9)} live factor${playbooks.length === 1 ? "" : "s"}`, tone: "muted" });
  }

  return chips;
}

function quoteFreshness(odds: Odds) {
  const validForMs = toNumber(odds.valid_for_ms ?? odds.provider_snapshot?.valid_for_ms);
  if (!validForMs || validForMs <= 0) return null;

  const timestamp =
    (typeof odds.updated_at === "string" && odds.updated_at) ||
    (typeof odds.published_at === "string" && odds.published_at) ||
    (typeof odds.inserted_at === "string" && odds.inserted_at) ||
    (typeof odds.provider_snapshot?.updated_at === "string" && odds.provider_snapshot.updated_at) ||
    null;

  if (!timestamp) return null;
  const updatedAtMs = new Date(timestamp).getTime();
  if (!Number.isFinite(updatedAtMs)) return null;

  const ageMs = Date.now() - updatedAtMs;
  if (ageMs >= validForMs * 1.25) return "Update due";
  return null;
}

function ProbabilityTag({ text, tone }: { text: string; tone: "high" | "medium" | "low" }) {
  const toneClass = {
    high: "border-emerald-400/25 bg-emerald-400/10 text-emerald-100",
    medium: "border-amber-400/25 bg-amber-400/10 text-amber-100",
    low: "border-sky-400/25 bg-sky-400/10 text-sky-100",
  }[tone];

  return <span className={["rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em]", toneClass].join(" ")}>{text}</span>;
}

const previousPricesBySelection = new Map<string, number>();

function stablePriceIdentity(odds: Odds | null | undefined) {
  if (!odds) return null;
  const marketKey =
    odds.market_family === "fancy_markets" && odds.window_label
      ? `${String(odds.source_market_key || odds.bet_type || "market")}::${String(odds.window_label)}`
      : String(odds.source_market_key || odds.bet_type || odds.market || "market");
  const lineIdentity =
    String(
      odds.projected_line ||
        odds.window_label ||
        odds.provider_snapshot?.projected_line ||
        odds.provider_snapshot?.window_label ||
        odds.provider_snapshot?.line ||
        "",
    ).trim() || "-";

  return `${marketKey}::${String(odds.selection_key || odds.outcome || odds.id || "selection")}::${lineIdentity}`;
}
