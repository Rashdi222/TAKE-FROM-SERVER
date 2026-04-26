"use client";

import { Alert } from "@/components/ui/Alert";

export function ManagedWalletNotice() {
  return (
    <Alert variant="info">
      Your wallet is managed by your master admin. Deposits and withdrawals are handled manually through your assigned operator.
    </Alert>
  );
}
