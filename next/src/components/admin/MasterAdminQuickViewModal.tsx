"use client";

import { useState } from "react";
import { formatCurrency } from "@/lib/format";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Alert } from "../ui/Alert";
import {
  useDeductMasterAdmin,
  useSuperAdminMasterAdminStats,
  useTopupMasterAdmin,
} from "@/hooks/useSuperAdmin";

type MasterAdminStats = {
  id: string;
  username?: string | null;
  email?: string;
  phone_number?: string | null;
  account_currency?: string;
  supported_account_currencies?: string[] | null;
  balance?: string | number | null;
  is_active?: boolean;
  total_players?: number;
  active_players?: number;
  total_bets?: number;
  active_bets?: number;
  won_bets?: number;
  lost_bets?: number;
  total_stake?: string | number | null;
  total_winnings?: string | number | null;
  recent_players?: Array<{
    id: string;
    username?: string | null;
    email?: string;
    is_active?: boolean;
    account_currency?: string;
    balance?: string | number | null;
  }>;
  recent_activity?: Array<{
    bet_id: string;
    username?: string | null;
    stake?: string | number | null;
    potential_win?: string | number | null;
    status?: string;
  }>;
};

function formatMoney(value: string | number | null | undefined, currency = "USD") {
  return formatCurrency(value ?? 0, currency);
}

interface MasterAdminQuickViewModalProps {
  masterAdminId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export function MasterAdminQuickViewModal({
  masterAdminId,
  isOpen,
  onClose,
}: MasterAdminQuickViewModalProps) {
  const [topupAmount, setTopupAmount] = useState("");
  const [deductAmount, setDeductAmount] = useState("");
  const [actionError, setActionError] = useState("");
  const { data, isLoading, isError } = useSuperAdminMasterAdminStats(masterAdminId || "");
  const topup = useTopupMasterAdmin();
  const deduct = useDeductMasterAdmin();

  const stats = ((data as { data?: MasterAdminStats } | undefined)?.data || null) as MasterAdminStats | null;
  const currency = String(stats?.account_currency ?? "USD");

  const handleTopup = async () => {
    if (!masterAdminId || !topupAmount) return;
    setActionError("");

    try {
      await topup.mutateAsync({ id: masterAdminId, amount: topupAmount });
      setTopupAmount("");
    } catch {
      setActionError("Unable to add balance right now.");
    }
  };

  const handleDeduct = async () => {
    if (!masterAdminId || !deductAmount) return;
    setActionError("");

    try {
      await deduct.mutateAsync({ id: masterAdminId, amount: deductAmount });
      setDeductAmount("");
    } catch {
      setActionError("Unable to deduct balance right now.");
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Master Admin Overview"
      className="max-w-5xl"
      contentClassName="max-h-[calc(92vh-72px)]"
    >
      {isLoading ? (
        <p className="text-sm text-[var(--c-text-muted)]">Loading master admin data...</p>
      ) : isError || !stats ? (
        <Alert variant="error">Unable to load master admin stats.</Alert>
      ) : (
        <div className="space-y-6">
          {actionError && <Alert variant="error">{actionError}</Alert>}

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-[var(--r-md)] border border-[var(--c-border)] bg-[var(--c-surface-1)] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--c-text-faint)]">Master Admin</p>
              <p className="mt-2 text-lg font-semibold text-[var(--c-text)]">{stats.username || "-"}</p>
              <p className="text-sm text-[var(--c-text-muted)]">{stats.email || "-"}</p>
              <p className="mt-3 text-sm text-[var(--c-text-muted)]">Available Balance</p>
              <p className="text-2xl font-mono font-bold text-[var(--c-success)]">{formatMoney(stats.balance, currency)}</p>
              <p className="mt-1 text-xs uppercase tracking-[0.12em] text-[var(--c-text-faint)]">{currency}</p>
              <p className="mt-3 text-sm text-[var(--c-text-muted)]">Supported Currencies</p>
              <p className="mt-1 text-sm text-[var(--c-text)]">{(stats.supported_account_currencies || [currency]).join(", ")}</p>
            </div>

            <div className="rounded-[var(--r-md)] border border-[var(--c-border)] bg-[var(--c-surface-1)] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--c-text-faint)]">Operations</p>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-[var(--c-text-muted)]">Players</p>
                  <p className="text-[var(--c-text)]">{stats.total_players ?? 0}</p>
                </div>
                <div>
                  <p className="text-[var(--c-text-muted)]">Active Players</p>
                  <p className="text-[var(--c-text)]">{stats.active_players ?? 0}</p>
                </div>
                <div>
                  <p className="text-[var(--c-text-muted)]">Total Bets</p>
                  <p className="text-[var(--c-text)]">{stats.total_bets ?? 0}</p>
                </div>
                <div>
                  <p className="text-[var(--c-text-muted)]">Active Bets</p>
                  <p className="text-[var(--c-text)]">{stats.active_bets ?? 0}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-[var(--r-md)] border border-[var(--c-border)] bg-[var(--c-surface-1)] p-4">
              <p className="mb-3 text-sm font-medium text-[var(--c-text)]">Adjust Master Balance</p>
              <div className="space-y-3">
                <Input
                  label="Top Up Amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={topupAmount}
                  onChange={(e) => setTopupAmount(e.target.value)}
                  placeholder="1000"
                />
                <Button
                  type="button"
                  className="w-full"
                  disabled={topup.isPending || !topupAmount}
                  onClick={handleTopup}
                >
                  {topup.isPending ? "Applying..." : "Add Balance"}
                </Button>

                <Input
                  label="Deduct Amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={deductAmount}
                  onChange={(e) => setDeductAmount(e.target.value)}
                  placeholder="500"
                />
                <Button
                  type="button"
                  variant="destructive"
                  className="w-full"
                  disabled={deduct.isPending || !deductAmount}
                  onClick={handleDeduct}
                >
                  {deduct.isPending ? "Applying..." : "Deduct Balance"}
                </Button>
              </div>
            </div>

            <div className="rounded-[var(--r-md)] border border-[var(--c-border)] bg-[var(--c-surface-1)] p-4">
              <p className="mb-3 text-sm font-medium text-[var(--c-text)]">Betting Snapshot</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-[var(--c-text-muted)]">Won Bets</p>
                  <p className="text-[var(--c-text)]">{stats.won_bets ?? 0}</p>
                </div>
                <div>
                  <p className="text-[var(--c-text-muted)]">Lost Bets</p>
                  <p className="text-[var(--c-text)]">{stats.lost_bets ?? 0}</p>
                </div>
                <div>
                  <p className="text-[var(--c-text-muted)]">Total Stake</p>
                  <p className="text-[var(--c-text)]">{formatMoney(stats.total_stake, currency)}</p>
                </div>
                <div>
                  <p className="text-[var(--c-text-muted)]">Total Winnings</p>
                  <p className="text-[var(--c-text)]">{formatMoney(stats.total_winnings, currency)}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-[var(--r-md)] border border-[var(--c-border)] bg-[var(--c-surface-1)] p-4">
              <p className="mb-3 text-sm font-medium text-[var(--c-text)]">Recent Players</p>
              <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                {(stats.recent_players || []).slice(0, 5).map((player) => (
                  <div key={player.id} className="flex items-center justify-between rounded-[var(--r-sm)] border border-[var(--c-border)] px-3 py-2">
                    <div>
                      <p className="text-sm text-[var(--c-text)]">{player.username || "-"}</p>
                      <p className="text-xs text-[var(--c-text-muted)]">{player.email || "-"}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-[var(--c-text)]">{formatMoney(player.balance, player.account_currency ?? currency)}</p>
                      <p className={`text-xs ${player.is_active ? "text-[var(--c-success)]" : "text-[var(--c-danger)]"}`}>
                        {player.is_active ? "Active" : "Inactive"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[var(--r-md)] border border-[var(--c-border)] bg-[var(--c-surface-1)] p-4">
              <p className="mb-3 text-sm font-medium text-[var(--c-text)]">Recent Player Activity</p>
              <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                {(stats.recent_activity || []).slice(0, 6).map((activity) => (
                  <div key={activity.bet_id} className="rounded-[var(--r-sm)] border border-[var(--c-border)] px-3 py-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-[var(--c-text)]">{activity.username || "-"}</p>
                      <p className="text-xs uppercase text-[var(--c-text-faint)]">{activity.status || "-"}</p>
                    </div>
                    <p className="mt-1 text-xs text-[var(--c-text-muted)]">
                      Stake {formatMoney(activity.stake, currency)} · Potential {formatMoney(activity.potential_win, currency)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
