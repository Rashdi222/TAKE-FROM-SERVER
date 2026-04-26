"use client";

import { formatCurrency } from "@/lib/format";
import { Card } from "../ui/Card";

interface Transaction {
  id: string;
  from_user_id?: string;
  to_user_id?: string;
  counterparty_user_id?: string | null;
  amount: number | string;
  type?: string;
  transaction_type?: string;
  direction?: string;
  status: string;
  description?: string;
  inserted_at?: string;
}

interface TransactionHistoryTableProps {
  transactions: Transaction[];
  currency?: string;
}

export function TransactionHistoryTable({ transactions, currency = "USD" }: TransactionHistoryTableProps) {
  if (!transactions || transactions.length === 0) {
    return (
      <Card variant="surface-1" className="p-6">
        <p className="text-[var(--c-text-muted)] text-center">No transactions</p>
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
              <th className="px-4 py-3 text-left text-sm font-medium text-[var(--c-text-muted)]">Type</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-[var(--c-text-muted)]">Movement</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-[var(--c-text-muted)]">Counterparty</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-[var(--c-text-muted)]">Amount</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-[var(--c-text-muted)]">Details</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((tx) => (
              <tr key={tx.id} className="border-b border-[var(--c-border)] last:border-0">
                {(() => {
                  const amount = Number(tx.amount ?? 0);
                  const safeAmount = Number.isFinite(amount) ? amount : 0;

                  return (
                    <>
                <td className="px-4 py-3 text-sm text-[var(--c-text)]">
                  {tx.inserted_at ? new Date(tx.inserted_at).toLocaleString() : "-"}
                </td>
                <td className="px-4 py-3 text-sm text-[var(--c-text)] capitalize">{String(tx.type || tx.transaction_type || "-").replaceAll("_", " ")}</td>
                <td className="px-4 py-3 text-sm capitalize">
                  <span className={
                    tx.direction === "credit" ? "text-[var(--c-success)]" :
                    tx.direction === "debit" ? "text-[var(--c-danger)]" :
                    "text-[var(--c-text-muted)]"
                  }>
                    {tx.direction || "-"}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm font-mono text-[var(--c-text-muted)]">
                  {tx.counterparty_user_id ? `${tx.counterparty_user_id.slice(0, 8)}...` : "-"}
                </td>
                <td className="px-4 py-3 text-sm font-mono text-right">
                  <span className={safeAmount >= 0 ? "text-[var(--c-success)]" : "text-[var(--c-danger)]"}>
                    {tx.direction === "credit" ? "+" : tx.direction === "debit" ? "-" : safeAmount >= 0 ? "+" : ""}
                    {formatCurrency(Math.abs(safeAmount), currency)}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-[var(--c-text-muted)]">
                  {tx.description || String(tx.status || "-").replaceAll("_", " ")}
                </td>
                    </>
                  );
                })()}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
