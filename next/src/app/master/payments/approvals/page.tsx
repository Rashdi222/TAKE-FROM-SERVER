"use client";

import { Card } from "@/components/ui/Card";
import { PendingTransactionsTable } from "@/components/payments/PendingTransactionsTable";
import { PendingPaymentsWidget } from "@/components/payments/PendingPaymentsWidget";
import type { PaymentApprovalSummary, PaymentTransaction } from "@/lib/api";
import {
  useMasterApproveDeposit,
  useMasterApproveWithdrawal,
  useMasterPaymentApprovals,
  useMasterPaymentApprovalSummary,
  useMasterRejectDeposit,
  useMasterRejectWithdrawal,
} from "@/hooks/useMasterPayments";

export default function MasterPaymentApprovalsPage() {
  const { data, isLoading, isError } = useMasterPaymentApprovals();
  const { data: summaryData } = useMasterPaymentApprovalSummary();
  const approveDeposit = useMasterApproveDeposit();
  const rejectDeposit = useMasterRejectDeposit();
  const approveWithdrawal = useMasterApproveWithdrawal();
  const rejectWithdrawal = useMasterRejectWithdrawal();

  const transactions = ((data as { data?: PaymentTransaction[] } | undefined)?.data ?? []) as PaymentTransaction[];
  const summary = ((summaryData as { data?: PaymentApprovalSummary } | undefined)?.data ?? null) as PaymentApprovalSummary | null;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.24em] text-[var(--c-accent)]">Payments</p>
        <h1 className="mt-2 text-3xl font-semibold text-[var(--c-text)]">Master Approval Desk</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--c-text-muted)]">
          Review deposit receipts and payout requests for players assigned to your account only. Approval ownership is enforced by the backend.
        </p>
      </div>

      <PendingPaymentsWidget summary={summary} />

      {isLoading ? (
        <Card variant="surface-1" className="p-8 text-center text-[var(--c-text-muted)]">
          Loading approval queue...
        </Card>
      ) : isError ? (
        <Card variant="surface-1" className="p-8 text-center text-[var(--c-danger)]">
          Approval queue could not be loaded.
        </Card>
      ) : (
        <PendingTransactionsTable
          scope="master"
          transactions={transactions}
          actions={{
            approveDeposit: (id) => approveDeposit.mutateAsync(id),
            rejectDeposit: (id, reason) => rejectDeposit.mutateAsync({ id, reason }),
            approveWithdrawal: (id) => approveWithdrawal.mutateAsync(id),
            rejectWithdrawal: (id, reason) => rejectWithdrawal.mutateAsync({ id, reason }),
          }}
        />
      )}
    </div>
  );
}
