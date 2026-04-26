"use client";

import { useState } from "react";
import { useRevokeSession } from "@/hooks/useSuperAdmin";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { Alert } from "../ui/Alert";

interface RevokeSessionButtonProps {
  userId: string;
}

export function RevokeSessionButton({ userId }: RevokeSessionButtonProps) {
  const [showModal, setShowModal] = useState(false);
  const revoke = useRevokeSession();

  const handleRevoke = async () => {
    try {
      await revoke.mutateAsync(userId);
      setShowModal(false);
    } catch {
      // Error handled
    }
  };

  return (
    <>
      <Button variant="destructive" onClick={() => setShowModal(true)}>
        Revoke Session
      </Button>
      
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Revoke Session">
        {revoke.isError && <Alert variant="error" className="mb-4">Failed to revoke session</Alert>}
        <p className="text-[var(--c-text-muted)] mb-4">
          This will force the user to log out. They will need to log in again to access their account.
        </p>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
          <Button variant="destructive" onClick={handleRevoke} disabled={revoke.isPending}>
            {revoke.isPending ? "Revoking..." : "Revoke Session"}
          </Button>
        </div>
      </Modal>
    </>
  );
}
