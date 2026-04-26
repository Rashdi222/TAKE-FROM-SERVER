"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { useBet, useCancelBet } from "@/hooks/useBets";
import { useProfile } from "@/hooks/useProfile";
import { formatCurrency } from "@/lib/format";
import { Card } from "@/components/ui/Card";
import { Tag } from "@/components/ui/Tag";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Alert } from "@/components/ui/Alert";

export default function BetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data, isLoading } = useBet(id);
  const { data: profileData } = useProfile();
  const cancelBet = useCancelBet();
  const [showCancelModal, setShowCancelModal] = useState(false);

  const bet = data?.data;
  const currency = String((profileData as { data?: { account_currency?: string } } | undefined)?.data?.account_currency ?? "USD");
  const canCancel = bet && (bet.status === "pending" || bet.status === "active");

  const handleCancel = async () => {
    try {
      await cancelBet.mutateAsync(id);
      setShowCancelModal(false);
      router.refresh();
    } catch {
      // Error handled in mutation
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <p className="text-[var(--c-text-muted)]">Loading bet...</p>
      </div>
    );
  }

  if (!bet) {
    return (
      <div className="container mx-auto px-4 py-8">
        <p className="text-[var(--c-text-muted)]">Bet not found</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-[var(--c-text)] mb-6">Bet Details</h1>

      {cancelBet.isError && (
        <Alert variant="error" className="mb-4">
          Failed to cancel bet. Please try again.
        </Alert>
      )}

      <Card variant="surface-2" className="p-6 mb-6">
        <div className="flex items-center justify-between mb-6">
          <Tag status={bet.status === "cancelled" || bet.status === "rejected" ? "cancelled" : bet.status === "won" || bet.status === "lost" ? "finished" : "live"} />
          <span className="text-sm text-[var(--c-text-faint)]">
            {bet.inserted_at ? new Date(bet.inserted_at).toLocaleString() : "-"}
          </span>
        </div>

        <div className="space-y-4">
          <div className="flex justify-between">
            <span className="text-[var(--c-text-muted)]">Bet ID</span>
            <span className="font-mono text-[var(--c-text)]">{bet.id}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--c-text-muted)]">Match ID</span>
            <span className="font-mono text-[var(--c-text)]">{bet.match_id}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--c-text-muted)]">Stake</span>
            <span className="font-mono text-[var(--c-text)]">{formatCurrency(bet.stake, currency)}</span>
          </div>
          {bet.potential_win && (
            <div className="flex justify-between">
              <span className="text-[var(--c-text-muted)]">Potential Win</span>
              <span className="font-mono text-[var(--c-success)]">{formatCurrency(bet.potential_win, currency)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-[var(--c-text-muted)]">Status</span>
            <span className="capitalize text-[var(--c-text)]">{bet.status}</span>
          </div>
          {bet.result && (
            <div className="flex justify-between">
              <span className="text-[var(--c-text-muted)]">Result</span>
              <span className="text-[var(--c-text)]">{bet.result}</span>
            </div>
          )}
        </div>

        {canCancel && (
          <div className="mt-6 pt-6 border-t border-[var(--c-border)]">
            <Button variant="destructive" onClick={() => setShowCancelModal(true)}>
              Cancel Bet
            </Button>
          </div>
        )}
      </Card>

      <Modal isOpen={showCancelModal} onClose={() => setShowCancelModal(false)} title="Cancel Bet">
        <p className="text-[var(--c-text-muted)] mb-4">
          Are you sure you want to cancel this bet? This action cannot be undone.
        </p>
        <div className="flex gap-4">
          <Button variant="secondary" onClick={() => setShowCancelModal(false)}>
            No, Keep It
          </Button>
          <Button variant="destructive" onClick={handleCancel} disabled={cancelBet.isPending}>
            {cancelBet.isPending ? "Cancelling..." : "Yes, Cancel"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
