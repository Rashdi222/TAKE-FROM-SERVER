"use client";

import { formatCurrency } from "@/lib/format";
import { Card } from "../ui/Card";

interface LedgerEntry {
  id: string;
  amount: number | string;
  transaction_type: string;
  description?: string | null;
  inserted_at?: string;
}

interface PlayerLedgerTableProps {
  ledger: LedgerEntry[];
  currency?: string;
}

export function PlayerLedgerTable({ ledger, currency = "USD" }: PlayerLedgerTableProps) {
  if (!ledger || ledger.length === 0) {
    return (
      <Card variant="surface-1" className="p-6">
        <p className="text-center text-[var(--c-text-muted)]">No ledger entries</p>
      </Card>
    );
  }

  return (
    <Card variant="surface-1" className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--c-border)]">
              <th className="px-4 py-3 text-left text-sm font-medium text-[var(--c-text-muted)]">
                Date
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-[var(--c-text-muted)]">
                Type
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-[var(--c-text-muted)]">
                Description
              </th>
              <th className="px-4 py-3 text-right text-sm font-medium text-[var(--c-text-muted)]">
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {ledger.map((entry) => {
              const amount = Number(entry.amount ?? 0);

              return (
                <tr key={entry.id} className="border-b border-[var(--c-border)] last:border-0">
                  <td className="px-4 py-3 text-sm text-[var(--c-text)]">
                    {entry.inserted_at ? new Date(entry.inserted_at).toLocaleString() : "-"}
                  </td>
                  <td className="px-4 py-3 text-sm capitalize text-[var(--c-text)]">
                    {entry.transaction_type || "-"}
                  </td>
                  <td className="px-4 py-3 text-sm text-[var(--c-text-muted)]">
                    {entry.description || "-"}
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-mono">
                    <span
                      className={
                        amount >= 0 ? "text-[var(--c-success)]" : "text-[var(--c-danger)]"
                      }
                    >
                      {amount >= 0 ? "+" : ""}
                      {formatCurrency(Math.abs(amount), currency)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
