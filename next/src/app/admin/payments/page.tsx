"use client";

import { Card } from "@/components/ui/Card";
import { PendingPaymentsWidget } from "@/components/payments/PendingPaymentsWidget";
import { PaymentsWorkspaceTile } from "@/components/payments/PaymentsWorkspaceTile";
import type { PaymentApprovalSummary, PaymentMethod, PaymentTransaction } from "@/lib/api";
import {
  useSuperAdminPaymentApprovalSummary,
  useSuperAdminPaymentMethods,
  useSuperAdminPaymentTransactions,
} from "@/hooks/useSuperAdmin";

export default function AdminPaymentsHubPage() {
  const { data: summaryData } = useSuperAdminPaymentApprovalSummary();
  const { data: methodsData, isLoading: methodsLoading } = useSuperAdminPaymentMethods();
  const { data: transactionsData, isLoading: transactionsLoading } = useSuperAdminPaymentTransactions();

  const summary = ((summaryData as { data?: PaymentApprovalSummary } | undefined)?.data ?? null) as PaymentApprovalSummary | null;
  const methods = ((methodsData as { data?: PaymentMethod[] } | undefined)?.data ?? []) as PaymentMethod[];
  const transactions = ((transactionsData as { data?: PaymentTransaction[] } | undefined)?.data ?? []) as PaymentTransaction[];

  const activeMethods = methods.filter((method) => method.is_active).length;
  const totalTransactions = transactions.length;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.24em] text-[var(--c-accent)]">Payments</p>
        <h1 className="mt-2 text-3xl font-semibold text-[var(--c-text)]">Payments Command Desk</h1>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-[var(--c-text-muted)]">
          One control surface for manual payment rails, approval queues, and payment transaction history. Use this workspace to manage self-service player deposits and withdrawals end to end.
        </p>
      </div>

      <PendingPaymentsWidget summary={summary} />

      <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-4">
        <PaymentsWorkspaceTile
          href="/admin/payments/approvals"
          eyebrow="Queue"
          title="Approval Desk"
          description="Review pending deposit receipts and withdrawal requests with authenticated receipt access."
          metric={`${summary?.pending_deposits ?? 0} deposits / ${summary?.pending_withdrawals ?? 0} withdrawals`}
          tone={Number(summary?.stale_pending_count ?? 0) > 0 ? "warning" : "success"}
        />
        <PaymentsWorkspaceTile
          href="/admin/payments/methods"
          eyebrow="Rails"
          title="Payment Methods"
          description="Maintain the structured bank and wallet destinations shown to self-service players."
          metric={methodsLoading ? "..." : `${activeMethods}/${methods.length} active`}
          tone={activeMethods > 0 ? "success" : "warning"}
        />
        <PaymentsWorkspaceTile
          href="/admin/payments/withdrawals"
          eyebrow="Cash Out"
          title="Withdrawal Desk"
          description="Fast lane for pending withdrawals when operations need to clear payout requests quickly."
          metric={transactionsLoading ? "..." : `${summary?.pending_withdrawals ?? 0} pending`}
          tone={Number(summary?.pending_withdrawals ?? 0) > 0 ? "warning" : "default"}
        />
        <PaymentsWorkspaceTile
          href="/admin/payments/transactions"
          eyebrow="Ledger"
          title="Transaction History"
          description="Inspect the full payment request history with method, player, status, and provider metadata."
          metric={transactionsLoading ? "..." : `${totalTransactions} rows`}
        />
      </div>

      <Card variant="surface-1" className="p-5">
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--c-text-faint)]">Operating rule</p>
        <p className="mt-2 text-sm leading-6 text-[var(--c-text-muted)]">
          Deposits do not touch playable balance until approved. Receipt review, approval ownership, and wallet crediting all stay server-side.
        </p>
      </Card>
    </div>
  );
}
