"use client";

import { formatCurrency } from "@/lib/format";
import { Card } from "../ui/Card";

interface PlayerStats {
  total_bets?: number;
  won_bets?: number;
  lost_bets?: number;
  total_stake?: number | string;
  total_winnings?: number | string;
}

interface PlayerStatsCardProps {
  stats: PlayerStats;
  currency?: string;
}

export function PlayerStatsCard({ stats, currency = "USD" }: PlayerStatsCardProps) {
  const totalStake = Number(stats?.total_stake ?? 0);
  const totalWinnings = Number(stats?.total_winnings ?? 0);

  return (
    <Card variant="surface-2" className="p-6">
      <h3 className="text-lg font-semibold text-[var(--c-text)] mb-4">Player Statistics</h3>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <p className="text-sm text-[var(--c-text-muted)]">Total Bets</p>
          <p className="text-xl font-mono text-[var(--c-text)]">{stats?.total_bets ?? 0}</p>
        </div>
        <div>
          <p className="text-sm text-[var(--c-text-muted)]">Bets Won</p>
          <p className="text-xl font-mono text-[var(--c-success)]">{stats?.won_bets ?? 0}</p>
        </div>
        <div>
          <p className="text-sm text-[var(--c-text-muted)]">Bets Lost</p>
          <p className="text-xl font-mono text-[var(--c-danger)]">{stats?.lost_bets ?? 0}</p>
        </div>
        <div>
          <p className="text-sm text-[var(--c-text-muted)]">Total Staked</p>
          <p className="text-xl font-mono text-[var(--c-text)]">{formatCurrency(totalStake, currency)}</p>
        </div>
        <div className="md:col-span-2">
          <p className="text-sm text-[var(--c-text-muted)]">Total Winnings</p>
          <p className="text-xl font-mono text-[var(--c-success)]">{formatCurrency(totalWinnings, currency)}</p>
        </div>
      </div>
    </Card>
  );
}
