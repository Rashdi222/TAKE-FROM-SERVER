"use client";

import { memo } from "react";
import { BarChart3 } from "lucide-react";
import type { TennisLiveOdds } from "@/lib/api";
import { formatDecimal } from "@/lib/format";
import { formatTennisMarketLabel, formatTennisSelectionLabel } from "@/lib/tennis/tennisMarketDictionary";

type Props = {
  odds: TennisLiveOdds[];
};

export const TennisMarketBoard = memo(function TennisMarketBoard({ odds }: Props) {
  const groups = odds.reduce<Record<string, TennisLiveOdds[]>>((acc, odd) => {
    const key = formatTennisMarketLabel(odd.market_name || odd.market_key || "Market");
    acc[key] = acc[key] ?? [];
    acc[key].push(odd);
    return acc;
  }, {});

  const entries = Object.entries(groups);

  return (
    <section className="rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,#07111b_0%,#04080e_100%)] p-5 text-white">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.28em] text-white/40">Live Markets</p>
          <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">Current tennis prices</h2>
        </div>
        <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100/80">
          {odds.length} live quotes
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-white/10 bg-white/5 px-4 py-10 text-center text-sm text-white/55">
          No live odds are available for this court yet.
        </div>
      ) : (
        <div className="mt-6 grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {entries.map(([market, rows]) => (
            <div key={market} className="overflow-hidden rounded-[1.2rem] border border-white/8 bg-white/[0.03]">
              <div className="flex items-center justify-between border-b border-white/8 px-3 py-2.5">
                <div className="truncate pr-3 text-sm font-semibold text-white">{market}</div>
                <BarChart3 className="h-4 w-4 text-cyan-300/75" />
              </div>
              <div className="divide-y divide-white/6">
                {rows.map((odd, index) => (
                  <div key={`${odd.market_key}-${odd.selection_key}-${index}`} className="grid grid-cols-[minmax(0,1fr)_92px] items-center gap-3 px-3 py-2.5">
                    <div className="min-w-0">
                      <div className="truncate text-sm text-white/90">
                        {formatTennisSelectionLabel(odd.selection_name || odd.selection_key || "Selection")}
                      </div>
                      <div className="truncate text-[10px] uppercase tracking-[0.14em] text-white/45">
                        {odd.line ? `Line ${odd.line}` : formatTennisSelectionLabel(odd.scope || "match")}
                      </div>
                    </div>
                    <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-center font-mono text-sm font-semibold text-emerald-200">
                      {formatDecimal(odd.odds_value ?? 0)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
});
