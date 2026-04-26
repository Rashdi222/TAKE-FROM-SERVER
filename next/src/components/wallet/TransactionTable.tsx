"use client";

import { PaymentTransaction } from "@/lib/api";
import { useProfile } from "@/hooks/useProfile";
import { formatCurrency } from "@/lib/format";
import { Card } from "../ui/Card";
import { PaymentStatusBadge } from "@/components/payments/PaymentStatusBadge";

interface TransactionTableProps {
  transactions: PaymentTransaction[];
}

export function TransactionTable({ transactions }: TransactionTableProps) {
  const { data: profileData } = useProfile();
  const currency = String((profileData as { data?: { account_currency?: string } } | undefined)?.data?.account_currency ?? "USD");
  const rejectionReason = (tx: PaymentTransaction) => {
    const reason = (tx.provider_response as Record<string, unknown> | null | undefined)?.reason;
    return typeof reason === "string" ? reason : null;
  };

  if (transactions.length === 0) {
    return (
      <Card variant="surface-1" className="p-6">
        <p className="text-[var(--c-text-muted)] text-center">No transactions yet</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card variant="surface-2" className="p-4">
        <p className="text-sm leading-6 text-[var(--c-text-muted)]">
          Deposits and withdrawals stay pending until an admin reviews them. Your playable balance only changes after a request is approved.
        </p>
      </Card>

      <div className="grid gap-3 md:hidden">
        {transactions.map((tx) => (
          <Card key={`mobile-${tx.id}`} variant="surface-1" className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className={`text-base font-semibold capitalize ${tx.status === "failed" ? "text-[var(--c-text-muted)] line-through" : "text-[var(--c-text)]"}`}>{tx.type || "-"}</p>
                <p className="mt-1 text-xs text-[var(--c-text-faint)]">
                  {tx.inserted_at ? new Date(tx.inserted_at).toLocaleString() : "-"}
                </p>
              </div>
              <PaymentStatusBadge status={String(tx.status)} />
            </div>

            <div className="mt-4 flex items-end justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--c-text-faint)]">Amount</p>
                <p className="mt-1 font-mono text-lg font-semibold text-[var(--c-text)]">
                  {formatCurrency(tx.amount, currency)}
                </p>
              </div>
            </div>
            {tx.status === "pending" ? (
              <p className="mt-3 text-xs uppercase tracking-[0.14em] text-[var(--c-warning)]">
                Balance stays playable until approval
              </p>
            ) : null}
            {tx.status === "failed" && rejectionReason(tx) ? (
              <p className="mt-3 text-xs leading-5 text-[var(--c-danger)]">{rejectionReason(tx)}</p>
            ) : null}
          </Card>
        ))}
      </div>

      <Card variant="surface-1" className="hidden overflow-hidden md:block">
        <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--c-border)]">
              <th className="px-4 py-3 text-left text-sm font-medium text-[var(--c-text-muted)]">Date</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-[var(--c-text-muted)]">Type</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-[var(--c-text-muted)]">Amount</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-[var(--c-text-muted)]">Status</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((tx) => (
              <tr key={tx.id} className="border-b border-[var(--c-border)] last:border-0">
                <td className="px-4 py-3 text-sm text-[var(--c-text)]">
                  {tx.inserted_at ? new Date(tx.inserted_at).toLocaleString() : "-"}
                </td>
                <td className={`px-4 py-3 text-sm capitalize ${tx.status === "failed" ? "text-[var(--c-text-muted)] line-through" : "text-[var(--c-text)]"}`}>{tx.type || "-"}</td>
                <td className="px-4 py-3 text-sm font-mono text-[var(--c-text)]">
                  {formatCurrency(tx.amount, currency)}
                </td>
                <td className="px-4 py-3 text-sm">
                  <div className="space-y-2">
                    <PaymentStatusBadge status={String(tx.status)} />
                    {tx.status === "pending" ? (
                      <div className="text-[11px] uppercase tracking-[0.14em] text-[var(--c-warning)]">
                        Balance stays playable until approval
                      </div>
                    ) : null}
                    {tx.status === "failed" && rejectionReason(tx) ? (
                      <div className="text-xs leading-5 text-[var(--c-danger)]">
                        {rejectionReason(tx)}
                      </div>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </Card>
    </div>
  );
}
