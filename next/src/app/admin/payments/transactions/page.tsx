"use client";

import { PaymentTransactionsHistoryTable } from "@/components/payments/PaymentTransactionsHistoryTable";
import type { PaymentTransaction } from "@/lib/api";
import { useSuperAdminPaymentTransactions } from "@/hooks/useSuperAdmin";

export default function PaymentTransactionsPage() {
  const { data, isLoading } = useSuperAdminPaymentTransactions();
  const transactions: PaymentTransaction[] = ((data as { data?: PaymentTransaction[] } | undefined)?.data ?? []) as PaymentTransaction[];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.24em] text-[var(--c-accent)]">Payments</p>
        <h1 className="mt-2 text-3xl font-semibold text-[var(--c-text)]">Payment Transactions</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--c-text-muted)]">
          Full payment transaction history across the self-service payment desk, including player, method, approval state, and provider metadata.
        </p>
      </div>

      <PaymentTransactionsHistoryTable transactions={transactions} isLoading={isLoading} />
    </div>
  );
}
