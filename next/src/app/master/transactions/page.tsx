"use client";

import { useMasterTransactions } from "@/hooks/useMasterReports";
import { useMasterDashboard } from "@/hooks/useMasterDashboard";
import { TransactionHistoryTable } from "@/components/master/TransactionHistoryTable";

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

export default function TransactionsPage() {
  const { data, isLoading } = useMasterTransactions();
  const { data: dashboardData } = useMasterDashboard();

  const transactions: Transaction[] = (data as { data?: Transaction[] })?.data || [];
  const currency = String((dashboardData as { data?: { account_currency?: string } } | undefined)?.data?.account_currency ?? "USD");

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-[var(--c-text)] mb-6">Transactions</h1>
      
      {isLoading ? (
        <p className="text-[var(--c-text-muted)]">Loading transactions...</p>
      ) : (
        <TransactionHistoryTable transactions={transactions} currency={currency} />
      )}
    </div>
  );
}
