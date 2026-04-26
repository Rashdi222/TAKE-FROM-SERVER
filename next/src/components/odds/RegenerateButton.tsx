"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { useRegenerateOdds } from "@/hooks/useOdds";

export function RegenerateButton({ matchId }: { matchId: string }) {
  const regenerate = useRegenerateOdds(matchId);
  const [open, setOpen] = useState(false);
  const [adminNote, setAdminNote] = useState("");

  const handleRegenerate = async () => {
    await regenerate.mutateAsync({ admin_note: adminNote || undefined });
    setOpen(false);
  };

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Regenerate
      </Button>

      <Modal isOpen={open} onClose={() => setOpen(false)} title="Regenerate Odds">
        <div className="space-y-4">
          <Input
            label="Admin Note"
            value={adminNote}
            onChange={(e) => setAdminNote(e.target.value)}
            placeholder="Optional direction for the regeneration pass"
          />

          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleRegenerate} disabled={regenerate.isPending}>
              {regenerate.isPending ? "Regenerating..." : "Regenerate"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
