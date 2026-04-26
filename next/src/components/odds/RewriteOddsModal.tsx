"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { useRewriteOdds } from "@/hooks/useOdds";

export function RewriteOddsModal({ matchId }: { matchId: string }) {
  const rewrite = useRewriteOdds(matchId);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");

  const handleRewrite = async () => {
    await rewrite.mutateAsync({ note });
    setOpen(false);
  };

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Rewrite
      </Button>

      <Modal isOpen={open} onClose={() => setOpen(false)} title="Rewrite Odds">
        <div className="space-y-4">
          <Input
            label="Rewrite Note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Example: tighten over/under and reduce payout risk"
          />

          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleRewrite} disabled={rewrite.isPending || !note.trim()}>
              {rewrite.isPending ? "Rewriting..." : "Rewrite"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
