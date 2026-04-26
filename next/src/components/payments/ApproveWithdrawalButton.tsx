"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Alert } from "@/components/ui/Alert";
import { PaymentTransaction } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import { useApproveWithdrawal } from "@/hooks/useSuperAdmin";

interface ApproveWithdrawalButtonProps {
  transaction: PaymentTransaction;
}

export function ApproveWithdrawalButton({ transaction }: ApproveWithdrawalButtonProps) {
  const [open, setOpen] = useState(false);
  const approve = useApproveWithdrawal();

  const handleApprove = async () => {
    try {
      await approve.mutateAsync(transaction.id);
      setOpen(false);
    } catch {
      // Error surfaced through mutation state.
    }
  };

  return (
    <>
      <Button variant="primary" className="px-3 py-2 text-xs" onClick={() => setOpen(true)}>
        Approve
      </Button>

      <Modal isOpen={open} onClose={() => setOpen(false)} title="Approve Withdrawal">
        {approve.isError ? <Alert variant="error" className="mb-4">Unable to approve this withdrawal.</Alert> : null}
        <div className="space-y-3 text-sm text-[var(--c-text-muted)]">
          <p>This action deducts the player balance and marks the withdrawal as completed.</p>
          <div className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-2)] p-4">
            <div className="flex justify-between gap-4">
              <span>Transaction</span>
              <span className="font-mono text-[var(--c-text)]">{transaction.id.slice(0, 8)}...</span>
            </div>
            <div className="mt-2 flex justify-between gap-4">
              <span>Amount</span>
              <span className="font-mono text-[var(--c-success)]">{formatCurrency(transaction.amount)}</span>
            </div>
          </div>
        </div>
        <div className="mt-6 flex gap-3">
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleApprove} disabled={approve.isPending}>
            {approve.isPending ? "Approving..." : "Confirm Approval"}
          </Button>
        </div>
      </Modal>
    </>
  );
}
