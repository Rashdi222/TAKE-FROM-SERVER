"use client";

import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { LiveMatchStore } from "@/lib/live/matchLiveStore";
import { useLiveMatchStoreSelector } from "@/lib/live/matchLiveStore";
import type { LiveMatchSelectionQuote } from "@/lib/live/types";
import type { Odds } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { formatFootballMarketLabel, normalizeFootballMarketKey } from "@/lib/football/footballMarketDictionary";
import { FootballRateField } from "./FootballRateField";

type MarketTabKey = "all" | "popular" | "match_winner" | "totals" | "btts" | "in_play";

type CanonicalMarketState = {
  status: "active" | "suspended" | "closed";
  isSuspended: boolean;
  reason: string | null;
};

const marketTabs: Array<{ key: MarketTabKey; label: string }> = [
  { key: "all", label: "All" },
  { key: "popular", label: "Popular" },
  { key: "match_winner", label: "Match Winner" },
  { key: "totals", label: "Over / Under" },
  { key: "btts", label: "BTTS" },
  { key: "in_play", label: "In-Play" },
];

export function FootballMarketBoard({
  store,
  onSelect,
}: {
  store: LiveMatchStore;
  onSelect: (quote: LiveMatchSelectionQuote) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const groups = useLiveMatchStoreSelector(store, (state) => state.marketGroups);
  const oddsById = useLiveMatchStoreSelector(store, (state) => state.oddsById);
  const suspendedMarkets = useLiveMatchStoreSelector(store, (state) => state.suspendedMarkets);
  const canonicalMarkets = useLiveMatchStoreSelector(store, (state) => state.canonicalMarkets);
  const dataHealth = useLiveMatchStoreSelector(store, (state) => state.dataHealth);
  const activeTab = resolveMarketTab(searchParams.get("marketTab"));

  const filteredGroups = useMemo(() => {
    if (activeTab === "all") return groups;

    if (activeTab === "popular") {
      return groups.filter((group) => {
        const key = normalizeFootballMarketKey(group.key);
        return key === "match_winner" || key === "over_under" || key === "btts" || key === "in_play";
      });
    }

    if (activeTab === "match_winner") {
      return groups.filter((group) => normalizeFootballMarketKey(group.key) === "match_winner");
    }

    if (activeTab === "totals") {
      return groups.filter((group) => {
        const key = normalizeFootballMarketKey(group.key);
        return key === "over_under" || key.includes("total");
      });
    }

    if (activeTab === "btts") {
      return groups.filter((group) => normalizeFootballMarketKey(group.key) === "btts");
    }

    if (activeTab === "in_play") {
      return groups.filter((group) => normalizeFootballMarketKey(group.key) === "in_play");
    }

    return groups;
  }, [activeTab, groups]);

  const setActiveTab = (tab: MarketTabKey) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("marketTab", tab);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const suspensionMessage = visibleSuspensionMessage(filteredGroups, suspendedMarkets, canonicalMarkets);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <div className="flex min-w-max gap-2 rounded-[var(--r-md)] border border-[var(--c-border)] bg-[rgba(255,255,255,0.03)] p-2">
          {marketTabs.map((tab) => {
            const active = tab.key === activeTab;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={[
                  "rounded-[var(--r-pill)] px-4 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-[var(--c-accent)] text-[var(--c-text)] shadow-[0_8px_24px_rgba(99,32,232,0.24)]"
                    : "text-[var(--c-text-muted)] hover:bg-[rgba(255,255,255,0.05)] hover:text-[var(--c-text)]",
                ].join(" ")}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {dataHealth.degraded ? (
        <Card variant="surface-1" className="border-amber-500/25 bg-amber-500/10 p-4 text-sm text-amber-100">
          {dataHealth.warning || "Live feed interrupted - reconnecting..."}
        </Card>
      ) : null}

      {suspensionMessage && !dataHealth.degraded ? (
        <Card variant="surface-1" className="border-amber-500/25 bg-amber-500/10 p-4 text-sm text-amber-100">
          {suspensionMessage}
        </Card>
      ) : null}

      {filteredGroups.map((group) => (
        <Card key={group.key} variant="surface-1" className="overflow-hidden">
          <div className="border-b border-[var(--c-border)] px-4 py-2.5 sm:px-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Market</div>
            <div className="mt-1 text-base font-semibold text-[var(--c-text)] sm:text-lg">
              {formatFootballMarketLabel(group.label, {
                selections: group.oddsIds.map((oddsId) => String(oddsById[oddsId]?.outcome || "")),
              })}
            </div>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_112px] border-b border-[var(--c-border)] bg-[rgba(255,255,255,0.02)] px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--c-text-faint)] sm:px-5">
            <span>Selection</span>
            <span className="text-right">Odds</span>
          </div>
          <div className="space-y-2 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0))] p-3 sm:p-4">
            {buildMarketRows(group.oddsIds, oddsById).map((row) => {
              const columnClass =
                row.oddsIds.length >= 3 ? "grid-cols-3" : row.oddsIds.length === 2 ? "grid-cols-2" : "grid-cols-1";

              return (
                <div
                  key={row.key}
                  className="rounded-[var(--r-md)] border border-[rgba(255,255,255,0.1)] bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015))] p-2.5 shadow-[0_10px_24px_rgba(7,10,25,0.28)]"
                >
                  {row.lineLabel ? (
                    <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--c-text-faint)]">
                      {row.lineLabel}
                    </div>
                  ) : null}
                  <div className={`grid gap-2 ${columnClass}`}>
                    {row.oddsIds.map((oddsId) => (
                      <FootballRateField
                        key={oddsId}
                        store={store}
                        oddsId={oddsId}
                        onSelect={onSelect}
                        compact
                        className="h-full"
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ))}

      {filteredGroups.length === 0 ? (
        <Card variant="surface-1" className="p-6 text-sm text-[var(--c-text-muted)]">
          No live football markets are available in this tab right now.
        </Card>
      ) : null}
    </div>
  );
}

type DisplayRow = {
  key: string;
  lineLabel: string | null;
  oddsIds: string[];
};

function buildMarketRows(oddsIds: string[], oddsById: Record<string, Odds>): DisplayRow[] {
  const rowBuckets = new Map<string, { lineLabel: string | null; odds: Odds[] }>();

  for (const oddsId of oddsIds) {
    const odd = oddsById[oddsId];
    if (!odd) continue;
    const rowKey = rowKeyForOdds(odd);
    const existing = rowBuckets.get(rowKey);
    if (existing) {
      existing.odds.push(odd);
    } else {
      rowBuckets.set(rowKey, { lineLabel: lineLabelForOdds(odd), odds: [odd] });
    }
  }

  return Array.from(rowBuckets.entries())
    .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
    .map(([key, bucket]) => ({
      key,
      lineLabel: bucket.lineLabel,
      oddsIds: dedupeOddsWithinRow(bucket.odds).sort(compareOddsForRow).map((odd) => odd.id),
    }));
}

function dedupeOddsWithinRow(odds: Odds[]) {
  const bySelection = new Map<string, Odds>();

  for (const odd of odds) {
    const key = selectionToken(odd);
    const existing = bySelection.get(key);
    if (!existing) {
      bySelection.set(key, odd);
      continue;
    }
    bySelection.set(key, pickPreferredOdd(existing, odd));
  }

  return Array.from(bySelection.values());
}

function pickPreferredOdd(left: Odds, right: Odds) {
  const leftRank = oddRank(left);
  const rightRank = oddRank(right);
  if (rightRank > leftRank) return right;
  if (rightRank < leftRank) return left;

  const leftValue = numberOrNaN(left.odds_value);
  const rightValue = numberOrNaN(right.odds_value);
  if (Number.isFinite(rightValue) && Number.isFinite(leftValue) && rightValue > leftValue) return right;
  return left;
}

function oddRank(odd: Odds) {
  const snapshot = (odd.provider_snapshot as Record<string, unknown> | null) || null;
  const selection =
    snapshot && snapshot.selection && typeof snapshot.selection === "object" && !Array.isArray(snapshot.selection)
      ? (snapshot.selection as Record<string, unknown>)
      : null;
  const market =
    snapshot && snapshot.market && typeof snapshot.market === "object" && !Array.isArray(snapshot.market)
      ? (snapshot.market as Record<string, unknown>)
      : null;
  const availability = String(odd.is_active === false ? "suspended" : (snapshot?.availability_status as string | undefined) || "active");
  const main = selection?.main;
  const bookmaker = String(market?.bookmaker || "");

  let rank = 0;
  if (availability === "active") rank += 30;
  if (main === true || String(main) === "1" || String(main).toLowerCase() === "true") rank += 10;
  if (bookmaker === "api_sports_live") rank += 20;
  return rank;
}

function numberOrNaN(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function rowKeyForOdds(odd: Odds) {
  const snapshot = (odd.provider_snapshot as Record<string, unknown> | null) || null;
  const selection =
    snapshot && snapshot.selection && typeof snapshot.selection === "object" && !Array.isArray(snapshot.selection)
      ? (snapshot.selection as Record<string, unknown>)
      : null;
  const line =
    stringValue(odd.projected_line) ||
    stringValue(odd.window_label) ||
    stringValue(selection?.line) ||
    stringValue(selection?.handicap) ||
    stringValue(snapshot?.line) ||
    stringValue(snapshot?.handicap) ||
    "__default__";
  return `${String(odd.source_market_key || odd.bet_type || odd.market || "market")}::${line}`;
}

function lineLabelForOdds(odd: Odds) {
  const snapshot = (odd.provider_snapshot as Record<string, unknown> | null) || null;
  const selection =
    snapshot && snapshot.selection && typeof snapshot.selection === "object" && !Array.isArray(snapshot.selection)
      ? (snapshot.selection as Record<string, unknown>)
      : null;
  const projected = stringValue(odd.projected_line);
  if (projected) return `Line ${projected}`;
  const windowLabel = stringValue(odd.window_label);
  if (windowLabel) return windowLabel;
  const lineFromSelection = stringValue(selection?.line) || stringValue(selection?.handicap);
  if (lineFromSelection) return `Line ${lineFromSelection}`;
  const lineFromSnapshot = stringValue(snapshot?.line);
  if (lineFromSnapshot) return `Line ${lineFromSnapshot}`;
  const handicap = stringValue(snapshot?.handicap);
  if (handicap) return `Handicap ${handicap}`;
  return null;
}

function compareOddsForRow(a: Odds, b: Odds) {
  return rankSelection(a) - rankSelection(b) || selectionToken(a).localeCompare(selectionToken(b));
}

function rankSelection(odd: Odds) {
  const token = selectionToken(odd);
  const marketKey = String(odd.source_market_key || odd.bet_type || odd.market || "").toLowerCase();

  if (marketKey.includes("match_winner") || marketKey.includes("winner")) {
    if (token.includes("team1") || token.includes("home") || token === "1" || token === "a") return 10;
    if (token.includes("draw") || token === "x") return 20;
    if (token.includes("team2") || token.includes("away") || token === "2" || token === "b") return 30;
  }

  if (marketKey.includes("over_under") || marketKey.includes("total")) {
    if (token.includes("over")) return 10;
    if (token.includes("under")) return 20;
  }

  if (marketKey.includes("btts")) {
    if (token.includes("yes")) return 10;
    if (token.includes("no")) return 20;
  }

  if (token.includes("team1") || token.includes("home")) return 10;
  if (token === "1" || token === "a") return 11;
  if (token.includes("draw") || token === "x") return 20;
  if (token.includes("team2") || token.includes("away")) return 30;
  if (token === "2" || token === "b") return 31;
  if (token.includes("over") || token.includes("yes")) return 40;
  if (token.includes("under") || token.includes("no")) return 50;
  return 100;
}

function selectionToken(odd: Odds) {
  return String(odd.selection_key || odd.outcome || odd.id || "")
    .trim()
    .toLowerCase();
}

function stringValue(value: unknown) {
  if (value == null) return null;
  const rendered = String(value).trim();
  return rendered.length > 0 ? rendered : null;
}

function resolveMarketTab(value: string | null): MarketTabKey {
  switch (value) {
    case "all":
    case "popular":
    case "match_winner":
    case "totals":
    case "btts":
    case "in_play":
      return value;
    default:
      return "all";
  }
}

function visibleSuspensionMessage(
  groups: Array<{ key: string }>,
  suspendedMarkets: Record<string, { reason?: string | null }>,
  canonicalMarkets: Record<string, CanonicalMarketState>,
) {
  const visible = groups.find((group) => {
    const canonical = canonicalMarkets[group.key];
    if (canonical) return canonical.isSuspended;
    return Boolean(suspendedMarkets[group.key]);
  });

  if (!visible) return null;

  const canonical = canonicalMarkets[visible.key];
  const reason = String(canonical ? canonical.reason || "" : suspendedMarkets[visible.key]?.reason || "").trim();

  switch (reason) {
    case "provider_disconnect":
      return "Live feed interrupted. Awaiting connection."
    case "provider_import_failure":
      return `Live pricing is temporarily unavailable (${formatFootballMarketLabel(visible.key)}).`;
    case "manual_admin_review":
      return `Markets are under review: ${formatFootballMarketLabel(visible.key)}.`;
    case "var_review":
      return `VAR check in progress (${formatFootballMarketLabel(visible.key)}).`;
    case "goal_scored":
      return `Goal confirmed. Live prices are temporarily paused for ${formatFootballMarketLabel(visible.key)}.`;
    case "red_card":
      return `Red card confirmed. Live prices are temporarily paused for ${formatFootballMarketLabel(visible.key)}.`;
    case "penalty_review":
      return `Penalty review in progress (${formatFootballMarketLabel(visible.key)}).`;
    default:
      return `Market update in progress: ${formatFootballMarketLabel(visible.key)}.`;
  }
}
