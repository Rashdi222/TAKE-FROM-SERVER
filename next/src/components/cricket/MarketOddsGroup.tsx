"use client";

import { memo } from "react";
import type { Odds } from "@/lib/api";
import { MarketOddsRow, marketOddsRowColumns } from "@/components/cricket/MarketOddsRow";

type Group = {
  key: string;
  label: string;
  family?: string | null;
  rows: Odds[];
  signature?: string;
};

function MarketOddsGroupComponent({
  matchId,
  group,
}: {
  matchId: string;
  group: Group;
}) {
  const isFancy = group.family === "fancy_markets";

  return (
    <section
      className={`overflow-hidden border-b ${
        isFancy ? "border-[rgba(238,180,58,0.18)]" : "border-[rgba(255,255,255,0.08)]"
      }`}
    >
      <div
        className={`grid ${marketOddsRowColumns} items-center gap-3 px-3 py-1.5 ${
          isFancy
            ? "bg-[rgba(238,180,58,0.06)] text-[rgb(238,180,58)]"
            : "bg-[rgba(255,255,255,0.03)] text-[var(--c-text-faint)]"
        }`}
      >
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em]">
          {group.label}
        </div>
        <div className="text-[10px] uppercase tracking-[0.14em]">
          {isFancy ? "Yes / No Session" : "Selections"}
        </div>
        <div className="text-right text-[10px] uppercase tracking-[0.14em]">Price</div>
        <div className="text-[10px] uppercase tracking-[0.14em]">Volume / P&L</div>
        <div className="text-[10px] uppercase tracking-[0.14em]">State</div>
        <div className="text-right text-[10px] uppercase tracking-[0.14em]">Actions</div>
        <div className="text-right text-[10px] uppercase tracking-[0.14em]">Intel</div>
      </div>

      <div>
        {group.rows.map((odd) => (
          <MarketOddsRow key={String(odd.id)} matchId={matchId} odd={odd} />
        ))}
      </div>
    </section>
  );
}

export const MarketOddsGroup = memo(MarketOddsGroupComponent, areGroupsEqual);

function areGroupsEqual(
  prev: Readonly<{ matchId: string; group: Group }>,
  next: Readonly<{ matchId: string; group: Group }>,
) {
  return (
    prev.matchId === next.matchId &&
    prev.group.key === next.group.key &&
    prev.group.label === next.group.label &&
    prev.group.family === next.group.family &&
    (prev.group.signature || "") === (next.group.signature || "")
  );
}
