"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import {
  useCancelMatch,
  useCloseMatch,
  useSettleMatch,
  useStartLiveMatch,
} from "@/hooks/useMatches";

export function MatchActions({
  matchId,
  status,
}: {
  matchId: string;
  status?: string;
}) {
  const startLive = useStartLiveMatch(matchId);
  const close = useCloseMatch(matchId);
  const cancel = useCancelMatch(matchId);
  const settle = useSettleMatch(matchId);
  const [settleOpen, setSettleOpen] = useState(false);
  const [winner, setWinner] = useState("");

  const isUpcoming = status === "upcoming";
  const isLive = status === "live";
  const isClosed = status === "closed";
  const isFinal = status === "settled" || status === "cancelled";

  return (
    <>
      <div className="flex flex-wrap gap-3">
        <Button variant="primary" onClick={() => startLive.mutate()} disabled={!isUpcoming || startLive.isPending}>
          {startLive.isPending ? "Starting..." : "Start Live"}
        </Button>
        <Button variant="secondary" onClick={() => close.mutate()} disabled={!(isUpcoming || isLive) || close.isPending}>
          {close.isPending ? "Closing..." : "Close Match"}
        </Button>
        <Button variant="secondary" onClick={() => setSettleOpen(true)} disabled={!isClosed || settle.isPending}>
          {settle.isPending ? "Settling..." : "Settle Match"}
        </Button>
        <Button variant="destructive" onClick={() => cancel.mutate()} disabled={isFinal || cancel.isPending}>
          {cancel.isPending ? "Cancelling..." : "Cancel Match"}
        </Button>
      </div>

      <Modal isOpen={settleOpen} onClose={() => setSettleOpen(false)} title="Settle Match">
        {(settle.isError || !winner.trim()) && settle.isError ? (
          <Alert variant="error" className="mb-4">
            Failed to settle match.
          </Alert>
        ) : null}

        <div className="space-y-4">
          <Input
            label="Winner"
            value={winner}
            onChange={(e) => setWinner(e.target.value)}
            placeholder="Enter exact winner name"
          />

          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setSettleOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={async () => {
                await settle.mutateAsync(winner);
                setSettleOpen(false);
                setWinner("");
              }}
              disabled={settle.isPending || !winner.trim()}
            >
              {settle.isPending ? "Settling..." : "Confirm Settlement"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
