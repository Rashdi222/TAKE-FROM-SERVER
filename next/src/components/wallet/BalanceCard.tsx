"use client";

import { useBalance } from "@/hooks/useProfile";
import { formatCurrency } from "@/lib/format";
import { Card } from "../ui/Card";

export function BalanceCard() {
  const { data, isLoading } = useBalance();
  const balance = Number(data?.balance ?? 0);
  const displayBalance = Number.isFinite(balance) ? balance : 0;
  const currency = String(data?.account_currency ?? "USD");

  return (
    <Card variant="surface-2" className="p-6">
      <h3 className="text-sm font-medium text-[var(--c-text-muted)] mb-2">Available Balance</h3>
      {isLoading ? (
        <div className="text-3xl font-mono text-[var(--c-text)]">---</div>
      ) : (
        <div>
          <div className="text-3xl font-mono font-bold text-[var(--c-success)]">
            {formatCurrency(displayBalance, currency)}
          </div>
          <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[var(--c-text-faint)]">{currency} account</p>
        </div>
      )}
    </Card>
  );
}
