"use client";

import Link from "next/link";
import { ApproveWithdrawalButton } from "@/components/payments/ApproveWithdrawalButton";
import { Card } from "@/components/ui/Card";
import { PaymentTransaction } from "@/lib/api";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { useSuperAdminPaymentTransactions } from "@/hooks/useSuperAdmin";

function isWithdrawal(transaction: PaymentTransaction): boolean {
  if (transaction.type === "withdrawal") return true;
  return (transaction.provider_response as Record<string, unknown> | null | undefined)?.type === "withdrawal";
}

export default function WithdrawalApprovalsPage() {
  const { data, isLoading } = useSuperAdminPaymentTransactions();
  const transactions: PaymentTransaction[] = ((data as { data?: PaymentTransaction[] } | undefined)?.data ?? []) as PaymentTransaction[];
  const pendingWithdrawals = transactions.filter((transaction) => isWithdrawal(transaction) && transaction.status === "pending");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--c-accent)]">Payments</p>
          <h1 className="mt-2 text-3xl font-semibold text-[var(--c-text)]">Withdrawal Approvals</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--c-text-muted)]">
            Pending withdrawals are derived from the payment transaction feed because the backend does not expose a separate approval queue endpoint. Approval here executes the real withdrawal completion flow.
          </p>
        </div>
        <Link href="/admin/payments/transactions" className="text-sm text-[var(--c-accent)] hover:text-[var(--c-text)]">
          View all payment transactions
        </Link>
      </div>

      {isLoading ? (
        <p className="text-[var(--c-text-muted)]">Loading withdrawals...</p>
      ) : pendingWithdrawals.length === 0 ? (
        <Card variant="surface-1" className="p-6">
          <p className="text-center text-[var(--c-text-muted)]">No pending withdrawals right now.</p>
        </Card>
      ) : (
        <Card variant="surface-1" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px]">
              <thead>
                <tr className="border-b border-[var(--c-border)] bg-[var(--c-surface-2)]/50">
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Transaction</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Player</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Amount</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Requested</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Provider Tx</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Action</th>
                </tr>
              </thead>
              <tbody>
                {pendingWithdrawals.map((transaction) => (
                  <tr key={transaction.id} className="border-b border-[var(--c-border)] last:border-b-0 hover:bg-[var(--c-surface-2)]/40">
                    <td className="px-4 py-4 font-mono text-sm text-[var(--c-text)]">{transaction.id.slice(0, 8)}...</td>
                    <td className="px-4 py-4 font-mono text-sm text-[var(--c-text-muted)]">{transaction.user_id?.slice(0, 8) ?? "-"}...</td>
                    <td className="px-4 py-4 font-mono text-sm text-[var(--c-success)]">{formatCurrency(transaction.amount)}</td>
                    <td className="px-4 py-4 text-sm text-[var(--c-text-muted)]">{formatDateTime(transaction.inserted_at)}</td>
                    <td className="px-4 py-4 font-mono text-sm text-[var(--c-text-muted)]">{transaction.provider_transaction_id ?? "Pending"}</td>
                    <td className="px-4 py-4"><ApproveWithdrawalButton transaction={transaction} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
