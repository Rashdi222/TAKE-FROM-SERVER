"use client";

import Link from "next/link";
import { Bet } from "@/lib/api";
import { useProfile } from "@/hooks/useProfile";
import { formatCurrency } from "@/lib/format";
import { Card } from "../ui/Card";
import { Tag } from "../ui/Tag";

interface BetCardProps {
  bet: Bet;
}

function getStatusTag(status: string): "scheduled" | "live" | "finished" | "settled" | "cancelled" {
  switch (status) {
    case "pending":
    case "active":
      return "live";
    case "won":
    case "lost":
      return "finished";
    case "cancelled":
    case "rejected":
      return "cancelled";
    default:
      return "scheduled";
  }
}

export function BetCard({ bet }: BetCardProps) {
  const status = getStatusTag(bet.status);
  const { data: profileData } = useProfile();
  const currency = String((profileData as { data?: { account_currency?: string } } | undefined)?.data?.account_currency ?? "USD");

  return (
    <Link href={`/bets/${bet.id}`}>
      <Card variant="surface-2" className="p-6 hover:border-[var(--c-accent)] transition-colors cursor-pointer">
        <div className="flex items-center justify-between mb-4">
          <Tag status={status} />
          <span className="text-sm text-[var(--c-text-faint)]">
            {bet.inserted_at ? new Date(bet.inserted_at).toLocaleDateString() : "-"}
          </span>
        </div>
        
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-sm text-[var(--c-text-muted)]">Stake</span>
            <span className="font-mono text-[var(--c-text)]">{formatCurrency(bet.stake, currency)}</span>
          </div>
          {bet.potential_win && (
            <div className="flex justify-between">
              <span className="text-sm text-[var(--c-text-muted)]">Potential Win</span>
              <span className="font-mono text-[var(--c-success)]">{formatCurrency(bet.potential_win, currency)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-sm text-[var(--c-text-muted)]">Status</span>
            <span className="capitalize text-[var(--c-text)]">{bet.status}</span>
          </div>
        </div>
      </Card>
    </Link>
  );
}
