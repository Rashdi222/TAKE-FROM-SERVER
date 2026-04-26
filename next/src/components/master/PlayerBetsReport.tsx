"use client";

import { formatCurrency } from "@/lib/format";
import { Card } from "../ui/Card";

interface BetReportEntry {
  id: string;
  stake: number | string;
  potential_win?: number | string | null;
  status: string;
  placed_at?: string;
}

interface PlayerBetsReportProps {
  bets: BetReportEntry[];
  currency?: string;
}

export function PlayerBetsReport({ bets, currency = "USD" }: PlayerBetsReportProps) {
  if (!bets || bets.length === 0) {
    return (
      <Card variant="surface-1" className="p-6">
        <p className="text-[var(--c-text-muted)] text-center">No bets recorded</p>
      </Card>
    );
  }

  return (
    <Card variant="surface-1" className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--c-border)]">
              <th className="px-4 py-3 text-left text-sm font-medium text-[var(--c-text-muted)]">Date</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-[var(--c-text-muted)]">Stake</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-[var(--c-text-muted)]">Potential Win</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-[var(--c-text-muted)]">Status</th>
            </tr>
          </thead>
          <tbody>
            {bets.map((bet) => (
              <tr key={bet.id} className="border-b border-[var(--c-border)] last:border-0">
                <td className="px-4 py-3 text-sm text-[var(--c-text)]">
                  {bet.placed_at ? new Date(bet.placed_at).toLocaleDateString() : "-"}
                </td>
                <td className="px-4 py-3 text-sm font-mono text-[var(--c-text)]">
                  {formatCurrency(bet.stake ?? 0, currency)}
                </td>
                <td className="px-4 py-3 text-sm font-mono text-[var(--c-text)]">
                  {formatCurrency(bet.potential_win ?? 0, currency)}
                </td>
                <td className="px-4 py-3 text-sm capitalize">
                  <span className={
                    bet.status === "won" ? "text-[var(--c-success)]" :
                    bet.status === "lost" ? "text-[var(--c-danger)]" :
                    bet.status === "cancelled" ? "text-[var(--c-warning)]" :
                    "text-[var(--c-text-muted)]"
                  }>
                    {bet.status}
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
