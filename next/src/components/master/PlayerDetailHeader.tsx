"use client";

import { formatCurrency } from "@/lib/format";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";

interface PlayerDetailHeaderProps {
  player: {
    username?: string | null;
    email?: string;
    account_currency?: string;
    balance?: number | string;
  };
  onTopup: () => void;
  onDeduct: () => void;
}

export function PlayerDetailHeader({ player, onTopup, onDeduct }: PlayerDetailHeaderProps) {
  return (
    <Card variant="surface-2" className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[var(--c-text)] mb-1">
            {String(player.username || "Unknown")}
          </h2>
          <p className="text-[var(--c-text-muted)]">{String(player.email || "-")}</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-[var(--c-text-muted)]">Balance</p>
          <p className="text-3xl font-mono font-bold text-[var(--c-success)]">
            {formatCurrency(player.balance ?? 0, String(player.account_currency ?? "USD"))}
          </p>
          <p className="mt-1 text-xs uppercase tracking-[0.14em] text-[var(--c-text-faint)]">{player.account_currency || "-"}</p>
        </div>
      </div>
      <div className="flex gap-3 mt-6">
        <Button variant="primary" onClick={onTopup}>Topup</Button>
        <Button variant="destructive" onClick={onDeduct}>Deduct</Button>
      </div>
    </Card>
  );
}
