"use client";

import Link from "next/link";
import { BalanceCard } from "@/components/wallet/BalanceCard";
import { Card } from "@/components/ui/Card";
import { usePaymentTransactions } from "@/hooks/usePayments";
import { useBalance } from "@/hooks/useProfile";
import { formatCurrency } from "@/lib/format";

export default function WalletPage() {
  const { data: transactionsData, isLoading: transactionsLoading } = usePaymentTransactions();
  const { data: balanceData } = useBalance();
  const transactions = transactionsData?.data ?? [];
  const pendingTransactions = transactions.filter((tx) => String(tx.status) === "pending");
  const pendingDeposits = pendingTransactions.filter((tx) => String(tx.type) === "deposit");
  const pendingWithdrawals = pendingTransactions.filter((tx) => String(tx.type) === "withdrawal");
  const recentPending = pendingTransactions.slice(0, 3);
  const currency = String(balanceData?.account_currency ?? "USD");

  return (
    <div className="container mx-auto space-y-6 px-4 py-6 md:py-8">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Wallet</p>
        <h1 className="mt-2 text-3xl font-bold text-[var(--c-text)]">Funds and transfers</h1>
      </div>

      <div>
        <BalanceCard />
      </div>

      <Card variant="surface-2" className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--c-text-faint)]">Pending Requests</p>
            <h2 className="mt-2 text-xl font-semibold text-[var(--c-text)]">Approvals waiting</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--c-text-muted)]">
              Deposits and withdrawals stay here until your assigned admin approves or rejects them.
            </p>
          </div>
          <Link href="/wallet/transactions" className="text-sm font-medium text-[var(--c-accent)]">
            View all transactions
          </Link>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <PendingMetric label="Pending deposits" value={transactionsLoading ? "..." : String(pendingDeposits.length)} />
          <PendingMetric label="Pending withdrawals" value={transactionsLoading ? "..." : String(pendingWithdrawals.length)} />
          <PendingMetric label="Total pending" value={transactionsLoading ? "..." : String(pendingTransactions.length)} />
          <PendingMetric
            label="Latest request"
            value={
              transactionsLoading
                ? "..."
                : recentPending[0]?.inserted_at
                  ? new Date(recentPending[0].inserted_at).toLocaleString()
                  : "None"
            }
          />
        </div>

        {!transactionsLoading && recentPending.length > 0 ? (
          <div className="mt-5 grid gap-3 lg:grid-cols-3">
            {recentPending.map((tx) => (
              <div
                key={String(tx.id)}
                className="rounded-[var(--r-md)] border border-[var(--c-border)] bg-[rgba(255,255,255,0.03)] p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold capitalize text-[var(--c-text)]">{String(tx.type || "request")}</p>
                    <p className="mt-1 text-xs text-[var(--c-text-faint)]">
                      {tx.inserted_at ? new Date(tx.inserted_at).toLocaleString() : "-"}
                    </p>
                  </div>
                  <span className="rounded-full border border-[rgba(245,158,11,0.28)] bg-[rgba(245,158,11,0.12)] px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-[var(--c-warning)]">
                    Pending
                  </span>
                </div>
                <p className="mt-4 font-mono text-lg font-semibold text-[var(--c-text)]">
                  {formatCurrency(tx.amount, currency)}
                </p>
                <p className="mt-2 text-sm text-[var(--c-text-muted)]">
                  Waiting for approval. Your playable balance changes only after confirmation.
                </p>
              </div>
            ))}
          </div>
        ) : null}

        {!transactionsLoading && pendingTransactions.length === 0 ? (
          <div className="mt-5 rounded-[var(--r-md)] border border-[var(--c-border)] bg-[rgba(255,255,255,0.02)] p-4 text-sm text-[var(--c-text-muted)]">
            No pending deposit or withdrawal requests right now.
          </div>
        ) : null}
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <WalletActionCard
          href="/wallet/deposit"
          title="Deposit"
          body="Send funds through the payment methods assigned to your account and upload the receipt for approval."
          accent
        />
        <WalletActionCard
          href="/wallet/withdraw"
          title="Withdraw"
          body="Request a payout through the payment methods assigned to your account. Withdrawals stay pending until approved."
        />
        <WalletActionCard
          href="/wallet/transactions"
          title="Transactions"
          body="Review your deposit, withdrawal, and wallet activity history."
        />
      </div>
    </div>
  );
}

function PendingMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--r-md)] border border-[var(--c-border)] bg-[rgba(255,255,255,0.03)] p-4">
      <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--c-text-faint)]">{label}</p>
      <p className="mt-2 text-xl font-semibold text-[var(--c-text)]">{value}</p>
    </div>
  );
}

function WalletActionCard({
  href,
  title,
  body,
  accent = false,
}: {
  href: string;
  title: string;
  body: string;
  accent?: boolean;
}) {
  return (
    <Link href={href} className="block">
      <Card
        variant="surface-2"
        className={[
          "h-full p-5 transition-colors",
          accent
            ? "border-[rgba(58,139,255,0.28)] bg-[linear-gradient(180deg,rgba(58,139,255,0.14),rgba(255,255,255,0.02))]"
            : "hover:border-[var(--c-accent)]",
        ].join(" ")}
      >
        <p className="text-lg font-semibold text-[var(--c-text)]">{title}</p>
        <p className="mt-2 text-sm leading-6 text-[var(--c-text-muted)]">{body}</p>
      </Card>
    </Link>
  );
}
