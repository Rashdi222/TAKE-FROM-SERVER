"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { useOrchestrateOdds } from "@/hooks/useOdds";

export function OrchestrateButton({ matchId }: { matchId: string }) {
  const orchestrate = useOrchestrateOdds(matchId);
  const [open, setOpen] = useState(false);
  const [adminNote, setAdminNote] = useState("");

  const handleRun = async () => {
    await orchestrate.mutateAsync({ admin_note: adminNote || undefined });
    setOpen(false);
  };

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        Orchestrate
      </Button>

      <Modal isOpen={open} onClose={() => setOpen(false)} title="AI Orchestrator">
        <div className="space-y-4">
          <Input
            label="Admin Note"
            value={adminNote}
            onChange={(e) => setAdminNote(e.target.value)}
            placeholder="Optional instruction for the orchestrator"
          />

          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleRun} disabled={orchestrate.isPending}>
              {orchestrate.isPending ? "Running..." : "Run Orchestrator"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
