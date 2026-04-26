"use client";

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import type { SportMarketConfig } from "@/lib/api";

export function SportMarketTemplateCard({
  sport,
  configs,
}: {
  sport?: string;
  configs: SportMarketConfig[];
}) {
  const enabled = configs.filter((item) => item.is_enabled);

  return (
    <Card variant="surface-2" className="p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-[var(--c-text-faint)]">
            Market Template
          </p>
          <h2 className="mt-2 text-lg font-semibold text-[var(--c-text)]">
            {sport ? `${sport} defaults` : "Sport defaults"}
          </h2>
          <p className="mt-2 text-sm text-[var(--c-text-muted)]">
            Enabled templates drive generation choices, stake defaults, and payout defaults.
          </p>
        </div>

        <Link href="/admin/settings/market-templates">
          <Button variant="secondary">Manage Templates</Button>
        </Link>
      </div>

      <div className="mt-5 space-y-3">
        {enabled.length === 0 ? (
          <p className="text-sm text-[var(--c-text-muted)]">
            No enabled template found for this sport. Generation will fall back to page presets.
          </p>
        ) : (
          enabled.map((config) => (
            <div
              key={config.id}
              className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-[var(--c-text)]">{config.bet_type}</div>
                  <div className="mt-1 text-xs text-[var(--c-text-muted)]">
                    Odds {config.default_min_odds || "-"} to {config.default_max_odds || "-"}
                  </div>
                </div>

                <div className="flex flex-wrap gap-4 text-xs text-[var(--c-text-muted)]">
                  <span>Stake {config.default_max_stake_amount || "-"}</span>
                  <span>Payout {config.default_max_payout_amount || "-"}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
