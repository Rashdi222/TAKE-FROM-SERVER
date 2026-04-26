"use client";

import { Bet } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Tag } from "@/components/ui/Tag";
import { formatCurrency, formatDateTime } from "@/lib/format";

interface AdminBetTableProps {
  bets: Bet[];
}

function shortId(value?: string | null): string {
  if (!value) return "-";
  return `${value.slice(0, 8)}...`;
}

export function AdminBetTable({ bets }: AdminBetTableProps) {
  if (bets.length === 0) {
    return (
      <Card variant="surface-1" className="p-6">
        <p className="text-center text-[var(--c-text-muted)]">No bets matched the current filters.</p>
      </Card>
    );
  }

  return (
    <Card variant="surface-1" className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px]">
          <thead>
            <tr className="border-b border-[var(--c-border)] bg-[var(--c-surface-2)]/50">
              <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Bet</th>
              <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Player</th>
              <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Match</th>
              <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Stake</th>
              <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Potential Win</th>
              <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Status</th>
              <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Mode</th>
              <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Placed</th>
            </tr>
          </thead>
          <tbody>
            {bets.map((bet) => (
              <tr key={bet.id} className="border-b border-[var(--c-border)] last:border-b-0 hover:bg-[var(--c-surface-2)]/40">
                <td className="px-4 py-4 font-mono text-sm text-[var(--c-text)]">{shortId(bet.id)}</td>
                <td className="px-4 py-4 font-mono text-sm text-[var(--c-text-muted)]">{shortId(bet.user_id)}</td>
                <td className="px-4 py-4 font-mono text-sm text-[var(--c-text-muted)]">{shortId(bet.match_id)}</td>
                <td className="px-4 py-4 font-mono text-sm text-[var(--c-text)]">{formatCurrency(bet.stake)}</td>
                <td className="px-4 py-4 font-mono text-sm text-[var(--c-success)]">{formatCurrency(bet.potential_win ?? "-")}</td>
                <td className="px-4 py-4"><Tag status={String(bet.status)} /></td>
                <td className="px-4 py-4 text-sm text-[var(--c-text)]">{bet.is_in_play ? "In-play" : "Pre-match"}</td>
                <td className="px-4 py-4 text-sm text-[var(--c-text-muted)]">{formatDateTime(bet.inserted_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
