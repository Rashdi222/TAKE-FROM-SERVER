"use client";

import type { SportMarketConfig } from "@/lib/api";
import { Card } from "@/components/ui/Card";

export function SportMarketTemplateTable({ configs }: { configs: SportMarketConfig[] }) {
  if (configs.length === 0) {
    return (
      <Card variant="surface-1" className="p-6">
        <p className="text-sm text-[var(--c-text-muted)]">No market templates configured for this filter.</p>
      </Card>
    );
  }

  return (
    <Card variant="surface-2" className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[var(--c-surface-1)] text-[var(--c-text-muted)]">
            <tr>
              <th className="px-4 py-3 font-medium">Sport</th>
              <th className="px-4 py-3 font-medium">Bet Type</th>
              <th className="px-4 py-3 font-medium">Odds Range</th>
              <th className="px-4 py-3 font-medium">Default Stake</th>
              <th className="px-4 py-3 font-medium">Default Payout</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {configs.map((config) => (
              <tr key={config.id} className="border-t border-[var(--c-border)]">
                <td className="px-4 py-3 text-[var(--c-text)]">{config.sport}</td>
                <td className="px-4 py-3 text-[var(--c-text)]">{config.bet_type}</td>
                <td className="px-4 py-3 text-[var(--c-text-muted)]">
                  {config.default_min_odds || "-"} to {config.default_max_odds || "-"}
                </td>
                <td className="px-4 py-3 text-[var(--c-text-muted)]">
                  {config.default_max_stake_amount || "-"}
                </td>
                <td className="px-4 py-3 text-[var(--c-text-muted)]">
                  {config.default_max_payout_amount || "-"}
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-[var(--r-pill)] border border-[var(--c-border)] px-2 py-1 text-xs text-[var(--c-text-muted)]">
                    {config.is_enabled ? "Enabled" : "Disabled"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
