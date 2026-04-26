"use client";

import { useState } from "react";
import { formatCurrency } from "@/lib/format";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { Alert } from "../ui/Alert";
import { useDeactivateUser, useRevokeSession } from "@/hooks/useSuperAdmin";
import { RiskControlsForm } from "./RiskControlsForm";

interface Player {
  id: string;
  username?: string | null;
  email?: string;
  account_currency?: string;
  balance?: number | string;
  is_active?: boolean;
  role?: string;
  max_stake_per_bet?: number | string | null;
  daily_max_exposure?: number | string | null;
  betting_locked?: boolean;
  payments_locked?: boolean;
}

interface PlayerAdminTableProps {
  players: Player[];
}

export function PlayerAdminTable({ players }: PlayerAdminTableProps) {
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [showRiskModal, setShowRiskModal] = useState(false);
  const [showDeactivateModal, setShowDeactivateModal] = useState(false);
  const [showRevokeModal, setShowRevokeModal] = useState(false);

  const deactivate = useDeactivateUser();
  const revoke = useRevokeSession();

  if (players.length === 0) {
    return (
      <Card variant="surface-1" className="p-6">
        <p className="text-[var(--c-text-muted)] text-center">No players found</p>
      </Card>
    );
  }

  const handleDeactivate = async () => {
    if (!selectedPlayer) return;

    try {
      await deactivate.mutateAsync(selectedPlayer.id);
      setShowDeactivateModal(false);
      setSelectedPlayer(null);
    } catch {
      // Error handled by mutation state.
    }
  };

  const handleRevoke = async () => {
    if (!selectedPlayer) return;

    try {
      await revoke.mutateAsync(selectedPlayer.id);
      setShowRevokeModal(false);
      setSelectedPlayer(null);
    } catch {
      // Error handled by mutation state.
    }
  };

  return (
    <>
      <Card variant="surface-1" className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--c-border)]">
                <th className="px-4 py-3 text-left text-sm font-medium text-[var(--c-text-muted)]">Username</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-[var(--c-text-muted)]">Email</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-[var(--c-text-muted)]">Balance</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-[var(--c-text-muted)]">Currency</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-[var(--c-text-muted)]">Status</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-[var(--c-text-muted)]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {players.map((player) => (
                <tr
                  key={player.id}
                  className="border-b border-[var(--c-border)] last:border-0 hover:bg-[var(--c-surface-2)]"
                >
                  <td className="px-4 py-3 text-sm text-[var(--c-text)]">{player.username || "-"}</td>
                  <td className="px-4 py-3 text-sm text-[var(--c-text)]">{player.email || "-"}</td>
                  <td className="px-4 py-3 text-sm font-mono text-[var(--c-text)]">
                    {formatCurrency(player.balance ?? 0, String(player.account_currency ?? "USD"))}
                  </td>
                  <td className="px-4 py-3 text-xs uppercase tracking-[0.12em] text-[var(--c-text-faint)]">{player.account_currency || "-"}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className={player.is_active ? "text-[var(--c-success)]" : "text-[var(--c-danger)]"}>
                      {player.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        className="text-xs px-2 py-1"
                        onClick={() => {
                          setSelectedPlayer(player);
                          setShowRiskModal(true);
                        }}
                      >
                        Risk
                      </Button>
                      <Button
                        variant="secondary"
                        className="text-xs px-2 py-1"
                        onClick={() => {
                          setSelectedPlayer(player);
                          setShowRevokeModal(true);
                        }}
                      >
                        Revoke
                      </Button>
                      <Button
                        variant="destructive"
                        className="text-xs px-2 py-1"
                        onClick={() => {
                          setSelectedPlayer(player);
                          setShowDeactivateModal(true);
                        }}
                      >
                        Deactivate
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        isOpen={showRiskModal}
        onClose={() => {
          setShowRiskModal(false);
          setSelectedPlayer(null);
        }}
        title="Risk Controls"
      >
        {selectedPlayer && (
          <RiskControlsForm
            userId={selectedPlayer.id}
            initialValues={{
              max_stake_per_bet: selectedPlayer.max_stake_per_bet,
              daily_max_exposure: selectedPlayer.daily_max_exposure,
              betting_locked: selectedPlayer.betting_locked,
              payments_locked: selectedPlayer.payments_locked,
            }}
          />
        )}
      </Modal>

      <Modal
        isOpen={showDeactivateModal}
        onClose={() => {
          setShowDeactivateModal(false);
          setSelectedPlayer(null);
        }}
        title="Deactivate User"
      >
        {deactivate.isError && <Alert variant="error" className="mb-4">Failed to deactivate user</Alert>}
        <p className="text-[var(--c-text-muted)] mb-4">
          Are you sure you want to deactivate this user? They will no longer be able to log in.
        </p>
        <div className="flex gap-3">
          <Button
            variant="secondary"
            onClick={() => {
              setShowDeactivateModal(false);
              setSelectedPlayer(null);
            }}
          >
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDeactivate} disabled={deactivate.isPending}>
            {deactivate.isPending ? "Deactivating..." : "Deactivate"}
          </Button>
        </div>
      </Modal>

      <Modal
        isOpen={showRevokeModal}
        onClose={() => {
          setShowRevokeModal(false);
          setSelectedPlayer(null);
        }}
        title="Revoke Session"
      >
        {revoke.isError && <Alert variant="error" className="mb-4">Failed to revoke session</Alert>}
        <p className="text-[var(--c-text-muted)] mb-4">
          This will force the user to log out. They will need to log in again.
        </p>
        <div className="flex gap-3">
          <Button
            variant="secondary"
            onClick={() => {
              setShowRevokeModal(false);
              setSelectedPlayer(null);
            }}
          >
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleRevoke} disabled={revoke.isPending}>
            {revoke.isPending ? "Revoking..." : "Revoke Session"}
          </Button>
        </div>
      </Modal>
    </>
  );
}
