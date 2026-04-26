"use client";

import Link from "next/link";
import { DepositForm } from "@/components/wallet/DepositForm";
import { Card } from "@/components/ui/Card";

export default function DepositPage() {
  return (
    <div className="container mx-auto space-y-6 px-4 py-6 md:py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Wallet</p>
          <h1 className="mt-2 text-3xl font-bold text-[var(--c-text)]">Deposit</h1>
        </div>
        <Link href="/wallet" className="text-sm font-medium text-[var(--c-accent)]">
          Back to wallet
        </Link>
      </div>

      <Card variant="surface-1" className="p-4 text-sm leading-6 text-[var(--c-text-muted)]">
        Select a payment method, follow the method instructions exactly, and submit only the amount you want credited to this account.
      </Card>

      <div className="max-w-xl">
        <DepositForm />
      </div>
    </div>
  );
}
