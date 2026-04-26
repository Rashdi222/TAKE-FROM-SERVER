"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

export function PlayerPasswordModal({
  isOpen,
  onClose,
  onSubmit,
  isPending,
  isError,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (password: string, passwordConfirmation: string) => Promise<void>;
  isPending?: boolean;
  isError?: boolean;
}) {
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [localError, setLocalError] = useState("");

  const handleSubmit = async () => {
    if (password.length < 8) {
      setLocalError("Password must be at least 8 characters.");
      return;
    }

    if (password !== passwordConfirmation) {
      setLocalError("Password confirmation does not match.");
      return;
    }

    setLocalError("");
    await onSubmit(password, passwordConfirmation);
    setPassword("");
    setPasswordConfirmation("");
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Set Player Password" className="max-w-lg">
      <div className="space-y-4">
        {isError ? <Alert variant="error">Request failed. Please try again.</Alert> : null}
        {localError ? <Alert variant="error">{localError}</Alert> : null}

        <Alert variant="info">
          This changes the player&apos;s password immediately and revokes older sessions.
        </Alert>

        <Input
          label="New password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Minimum 8 characters"
        />

        <Input
          label="Confirm password"
          type="password"
          value={passwordConfirmation}
          onChange={(event) => setPasswordConfirmation(event.target.value)}
          placeholder="Repeat password"
        />

        <div className="flex gap-3">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void handleSubmit()} disabled={isPending}>
            {isPending ? "Saving..." : "Set password"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
