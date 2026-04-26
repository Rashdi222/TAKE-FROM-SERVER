"use client";

import Link from "next/link";
import { usePaymentTransactions } from "@/hooks/usePayments";
import { TransactionTable } from "@/components/wallet/TransactionTable";
import { Card } from "@/components/ui/Card";

export default function TransactionsPage() {
  const { data, isLoading } = usePaymentTransactions();

  return (
    <div className="container mx-auto space-y-6 px-4 py-6 md:py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Wallet</p>
          <h1 className="mt-2 text-3xl font-bold text-[var(--c-text)]">Transactions</h1>
        </div>
        <Link href="/wallet" className="text-sm font-medium text-[var(--c-accent)]">
          Back to wallet
        </Link>
      </div>
      
      {isLoading ? (
        <Card variant="surface-1" className="p-6">
          <p className="text-[var(--c-text-muted)]">Loading transactions...</p>
        </Card>
      ) : (
        <TransactionTable transactions={data?.data || []} />
      )}
    </div>
  );
}
