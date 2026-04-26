"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Alert } from "@/components/ui/Alert";
import { PaymentMethod } from "@/lib/api";
import { useSetPaymentMethodActive } from "@/hooks/useSuperAdmin";

interface MethodToggleProps {
  method: PaymentMethod;
}

export function MethodToggle({ method }: MethodToggleProps) {
  const [open, setOpen] = useState(false);
  const toggle = useSetPaymentMethodActive();
  const targetState = !method.is_active;

  const handleConfirm = async () => {
    try {
      await toggle.mutateAsync({ id: method.id, active: targetState });
      setOpen(false);
    } catch {
      // Error surfaced through mutation state.
    }
  };

  return (
    <>
      <Button
        variant={method.is_active ? "secondary" : "primary"}
        className="px-3 py-2 text-xs"
        onClick={() => setOpen(true)}
      >
        {method.is_active ? "Deactivate" : "Activate"}
      </Button>

      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title={`${targetState ? "Activate" : "Deactivate"} ${String(method.provider)}`}
      >
        {toggle.isError ? <Alert variant="error" className="mb-4">Unable to update payment method.</Alert> : null}
        <p className="mb-5 text-sm leading-6 text-[var(--c-text-muted)]">
          {targetState
            ? "This method will become available for future payment operations."
            : "This method will be disabled for future payment operations."}
        </p>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant={targetState ? "primary" : "destructive"} onClick={handleConfirm} disabled={toggle.isPending}>
            {toggle.isPending ? "Saving..." : targetState ? "Activate" : "Deactivate"}
          </Button>
        </div>
      </Modal>
    </>
  );
}
