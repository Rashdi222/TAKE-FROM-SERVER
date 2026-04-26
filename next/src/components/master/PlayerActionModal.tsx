"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

export function PlayerActionModal({
  isOpen,
  onClose,
  title,
  submitLabel,
  variant = "primary",
  isPending,
  isError,
  amount,
  note,
  onAmountChange,
  onNoteChange,
  onSubmit,
  max,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  submitLabel: string;
  variant?: "primary" | "destructive";
  isPending?: boolean;
  isError?: boolean;
  amount: string;
  note: string;
  onAmountChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  onSubmit: () => Promise<void>;
  max?: string;
}) {
  const [localError, setLocalError] = useState("");

  const handleSubmit = async () => {
    if (!amount || Number(amount) <= 0) {
      setLocalError("Enter a valid amount.");
      return;
    }

    setLocalError("");
    await onSubmit();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} className="max-w-lg">
      <div className="space-y-4">
        {isError ? <Alert variant="error">Request failed. Please try again.</Alert> : null}
        {localError ? <Alert variant="error">{localError}</Alert> : null}

        <Input
          label="Amount"
          type="number"
          min="0"
          step="0.01"
          max={max}
          value={amount}
          onChange={(e) => onAmountChange(e.target.value)}
          placeholder="0.00"
        />

        <Input
          label="Note"
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          placeholder="Optional operational note"
        />

        <div className="flex gap-3">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={variant} onClick={() => void handleSubmit()} disabled={isPending}>
            {isPending ? "Processing..." : submitLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
