"use client";

import { Card } from "@/components/ui/Card";
import { MarketOddsGroup } from "@/components/cricket/MarketOddsGroup";
import type { Odds } from "@/lib/api";

type GroupedOdds = {
  key: string;
  label: string;
  family?: string | null;
  rows: Odds[];
};

export function OddsList({
  odds,
  matchId,
}: {
  odds: Odds[];
  matchId: string;
}) {
  if (odds.length === 0) {
    return (
      <Card variant="surface-1" className="p-6">
        <p className="text-center text-[var(--c-text-muted)]">No odds in this workspace view.</p>
      </Card>
    );
  }

  const groups = groupOdds(odds);

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <MarketOddsGroup key={group.key} matchId={matchId} group={group} />
      ))}
    </div>
  );
}

function groupOdds(odds: Odds[]): GroupedOdds[] {
  const grouped = new Map<string, GroupedOdds>();

  odds.forEach((odd) => {
    const family = typeof odd.market_family === "string" ? odd.market_family : null;
    const marketKey = String(odd.source_market_key || odd.bet_type || "market");
    const key = `${family || "core"}:${marketKey}`;
    const existing = grouped.get(key);

    if (existing) {
      existing.rows.push(odd);
      return;
    }

    grouped.set(key, {
      key,
      label: humanizeLabel(family === "fancy_markets" ? marketKey.replace(/^fancy_/, "") : marketKey),
      family,
      rows: [odd],
    });
  });

  return Array.from(grouped.values()).sort((a, b) => {
    if (a.family === "fancy_markets" && b.family !== "fancy_markets") return 1;
    if (a.family !== "fancy_markets" && b.family === "fancy_markets") return -1;
    return a.label.localeCompare(b.label);
  });
}

function humanizeLabel(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}
