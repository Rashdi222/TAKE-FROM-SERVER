"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAdminOdds } from "@/hooks/useOdds";
import type { Match, Odds } from "@/lib/api";

type MarketRow = {
  key: string;
  label: string;
  count: number;
  suspended: boolean;
  reason?: string | null;
};

export function CricketLiveMarketControlPanel({
  match,
  busyKey,
  onSuspend,
  onResume,
}: {
  match: Match;
  busyKey?: string | null;
  onSuspend: (match: Match, marketKey: string) => Promise<void> | void;
  onResume: (match: Match, marketKey: string) => Promise<void> | void;
}) {
  const { data: oddsData } = useAdminOdds(String(match.id), {
    include_unpublished: "true",
    visibility_status: "published",
    active_only: "true",
  });

  const markets = useMemo(() => {
    const odds = (((oddsData as { data?: Odds[] } | undefined)?.data ?? []) as Odds[]) || [];
    const suspendedMarkets = (match.suspended_markets as Record<string, { reason?: string | null }> | null) || {};
    const grouped = new Map<string, MarketRow>();

    odds.forEach((odd) => {
      const key = String(odd.source_market_key || odd.bet_type || odd.market || "market");
      const existing = grouped.get(key);

      if (existing) {
        existing.count += 1;
      } else {
        grouped.set(key, {
          key,
          label: humanizeLabel(key),
          count: 1,
          suspended: Boolean(suspendedMarkets[key]),
          reason: suspendedMarkets[key]?.reason || null,
        });
      }
    });

    for (const [key, value] of Object.entries(suspendedMarkets)) {
      if (!grouped.has(key)) {
        grouped.set(key, {
          key,
          label: humanizeLabel(key),
          count: 0,
          suspended: true,
          reason: value?.reason || null,
        });
      }
    }

    return Array.from(grouped.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [match.suspended_markets, oddsData]);

  if (markets.length === 0) {
    return (
      <Card variant="surface-1" className="p-4">
        <p className="text-sm text-[var(--c-text-muted)]">
          No published live markets are available yet for {String(match.team1 || "Team 1")} vs{" "}
          {String(match.team2 || "Team 2")}.
        </p>
      </Card>
    );
  }

  return (
    <Card variant="surface-2" className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--c-text-faint)]">Granular Market Control</p>
          <h3 className="mt-2 text-lg font-semibold text-[var(--c-text)]">
            {String(match.team1 || "Team 1")} vs {String(match.team2 || "Team 2")}
          </h3>
        </div>
        <div className="text-xs uppercase tracking-[0.16em] text-[var(--c-text-faint)]">
          {markets.length} market{markets.length === 1 ? "" : "s"}
        </div>
      </div>

      <div className="mt-4 grid gap-3">
        {markets.map((market) => {
          const key = `${match.id}:${market.key}`;
          const isBusy = busyKey === key;

          return (
            <div
              key={market.key}
              className="flex flex-col gap-3 rounded-[var(--r-md)] border border-[var(--c-border)] bg-[rgba(255,255,255,0.02)] px-4 py-3 md:flex-row md:items-center md:justify-between"
            >
              <div>
                <p className="text-sm font-medium text-[var(--c-text)]">{market.label}</p>
                <p className="mt-1 text-xs text-[var(--c-text-faint)]">
                  {market.count} selection{market.count === 1 ? "" : "s"}
                  {market.suspended ? ` · suspended${market.reason ? ` (${market.reason.replace(/_/g, " ")})` : ""}` : " · open"}
                </p>
              </div>

              {market.suspended ? (
                <Button variant="secondary" disabled={isBusy} onClick={() => void onResume(match, market.key)}>
                  {isBusy ? "Working..." : "Resume Market"}
                </Button>
              ) : (
                <Button variant="destructive" disabled={isBusy} onClick={() => void onSuspend(match, market.key)}>
                  {isBusy ? "Working..." : "Suspend Market"}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function humanizeLabel(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}
