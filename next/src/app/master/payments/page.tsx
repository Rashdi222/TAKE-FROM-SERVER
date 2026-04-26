"use client";

import { Card } from "@/components/ui/Card";
import { PendingPaymentsWidget } from "@/components/payments/PendingPaymentsWidget";
import { PaymentsWorkspaceTile } from "@/components/payments/PaymentsWorkspaceTile";
import type { PaymentApprovalSummary, PaymentMethod, PaymentTransaction } from "@/lib/api";
import {
  useMasterPaymentApprovalSummary,
  useMasterPaymentMethods,
  useMasterPaymentTransactions,
} from "@/hooks/useMasterPayments";

export default function MasterPaymentsHubPage() {
  const { data: summaryData, isLoading: summaryLoading } = useMasterPaymentApprovalSummary();
  const { data: methodsData, isLoading: methodsLoading } = useMasterPaymentMethods();
  const { data: transactionsData, isLoading: transactionsLoading } = useMasterPaymentTransactions();

  const summary = ((summaryData as { data?: PaymentApprovalSummary } | undefined)?.data ?? null) as PaymentApprovalSummary | null;
  const methods = ((methodsData as { data?: PaymentMethod[] } | undefined)?.data ?? []) as PaymentMethod[];
  const transactions = ((transactionsData as { data?: PaymentTransaction[] } | undefined)?.data ?? []) as PaymentTransaction[];

  const activeMethods = methods.filter((method) => method.is_active).length;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.24em] text-[var(--c-accent)]">Payments</p>
        <h1 className="mt-2 text-3xl font-semibold text-[var(--c-text)]">Managed Payments Desk</h1>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-[var(--c-text-muted)]">
          Control the payment methods and manual approval queue for players assigned to your account. This workspace is owner-scoped and isolated from super-admin payment rails.
        </p>
      </div>

      <PendingPaymentsWidget summary={summary} />

      <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
        <PaymentsWorkspaceTile
          href="/master/payments/approvals"
          eyebrow="Queue"
          title="Approval Desk"
          description="Approve or reject receipt-backed deposits and withdrawals for your managed players only."
          metric={summaryLoading ? "..." : `${summary?.pending_deposits ?? 0} deposits / ${summary?.pending_withdrawals ?? 0} withdrawals`}
          tone={Number(summary?.stale_pending_count ?? 0) > 0 ? "warning" : "success"}
        />
        <PaymentsWorkspaceTile
          href="/master/payments/methods"
          eyebrow="Rails"
          title="Payment Methods"
          description="Define the structured bank and wallet destinations your players should use during deposits and withdrawals."
          metric={methodsLoading ? "..." : `${activeMethods}/${methods.length} active`}
          tone={activeMethods > 0 ? "success" : "warning"}
        />
        <PaymentsWorkspaceTile
          href="/master/payments/transactions"
          eyebrow="Ledger"
          title="Transaction History"
          description="Inspect your full owner-scoped payment request history with the same export and filtering depth as the main approval desk."
          metric={transactionsLoading ? "..." : `${transactions.length} rows`}
        />
        <PaymentsWorkspaceTile
          href="/master/payments/approvals"
          eyebrow="Aging"
          title="Queue Health"
          description="Use the approval desk to clear stale requests and keep pending items from aging past the 24-hour threshold."
          metric={`${summary?.stale_pending_count ?? 0} older than 24h`}
          tone={Number(summary?.stale_pending_count ?? 0) > 0 ? "warning" : "default"}
        />
      </div>

      <Card variant="surface-1" className="p-5">
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--c-text-faint)]">Operating rule</p>
        <p className="mt-2 text-sm leading-6 text-[var(--c-text-muted)]">
          Your players only see your payment methods. Their wallet balances move only when you approve the pending request in the approval desk.
        </p>
      </Card>
    </div>
  );
}
