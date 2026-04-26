"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatCurrency } from "@/lib/format";
import { Modal } from "@/components/ui/Modal";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { PlayerLedgerTable } from "@/components/master/PlayerLedgerTable";
import { PlayerBetsReport } from "@/components/master/PlayerBetsReport";
import { PlayerStatsCard } from "@/components/master/PlayerStatsCard";
import { PlayerActionModal } from "@/components/master/PlayerActionModal";
import { PlayerPasswordModal } from "@/components/master/PlayerPasswordModal";
import { PlayerResetLinkModal } from "@/components/master/PlayerResetLinkModal";
import { ReportRangeTabs } from "@/components/master/ReportRangeTabs";
import {
  useDeductPlayer,
  useGeneratePlayerResetLink,
  useMasterPlayerBetsReport,
  useMasterPlayerLedger,
  useMasterPlayerStats,
  useSetPlayerPassword,
  useTopupPlayer,
} from "@/hooks/useMasterPlayers";

function rangeToFilters(range: "1d" | "1w" | "1m" | "custom", from: string, to: string) {
  const now = new Date();
  const start = new Date(now);

  if (range === "1d") start.setDate(now.getDate() - 1);
  if (range === "1w") start.setDate(now.getDate() - 7);
  if (range === "1m") start.setMonth(now.getMonth() - 1);

  if (range === "custom") {
    return {
      from: from ? new Date(from).toISOString() : undefined,
      to: to ? new Date(to).toISOString() : undefined,
    };
  }

  return {
    from: start.toISOString(),
    to: now.toISOString(),
  };
}

export function PlayerQuickViewModal({
  isOpen,
  onClose,
  player,
}: {
  isOpen: boolean;
  onClose: () => void;
  player: {
    id: string;
    username?: string | null;
    email?: string;
    account_currency?: string;
    balance?: number | string;
    is_active?: boolean;
  } | null;
}) {
  const [tab, setTab] = useState<"overview" | "ledger" | "bets" | "reports">("overview");
  const [range, setRange] = useState<"1d" | "1w" | "1m" | "custom">("1d");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [showTopup, setShowTopup] = useState(false);
  const [showDeduct, setShowDeduct] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showResetLinkModal, setShowResetLinkModal] = useState(false);
  const [topupAmount, setTopupAmount] = useState("");
  const [deductAmount, setDeductAmount] = useState("");
  const [topupNote, setTopupNote] = useState("");
  const [deductNote, setDeductNote] = useState("");
  const [resetUrl, setResetUrl] = useState<string | null>(null);
  const [resetExpiresAt, setResetExpiresAt] = useState<string | null>(null);

  const filters = useMemo(() => rangeToFilters(range, from, to), [range, from, to]);

  const { data: statsData } = useMasterPlayerStats(player?.id || "");
  const { data: ledgerData } = useMasterPlayerLedger(player?.id || "", filters);
  const { data: betsData } = useMasterPlayerBetsReport(player?.id || "", {
    ...filters,
    limit: 50,
  });
  const topup = useTopupPlayer();
  const deduct = useDeductPlayer();
  const setPassword = useSetPlayerPassword();
  const generateResetLink = useGeneratePlayerResetLink();

  const stats = (statsData as { data?: Record<string, unknown> } | undefined)?.data || {};
  const ledger =
    ((ledgerData as { data?: Array<Record<string, unknown>> } | undefined)?.data ?? []) as Array<
      Record<string, unknown>
    >;
  const bets =
    ((betsData as { data?: { bets?: Array<Record<string, unknown>> } } | undefined)?.data?.bets ??
      []) as Array<Record<string, unknown>>;

  const handleTopup = async () => {
    if (!player) return;
    await topup.mutateAsync({ id: player.id, body: { amount: Number(topupAmount), note: topupNote } });
    setShowTopup(false);
    setTopupAmount("");
    setTopupNote("");
  };

  const handleDeduct = async () => {
    if (!player) return;
    await deduct.mutateAsync({
      id: player.id,
      body: { amount: Number(deductAmount), note: deductNote },
    });
    setShowDeduct(false);
    setDeductAmount("");
    setDeductNote("");
  };

  const handleSetPassword = async (password: string, passwordConfirmation: string) => {
    if (!player) return;
    await setPassword.mutateAsync({
      id: player.id,
      body: {
        password,
        password_confirmation: passwordConfirmation,
      },
    });
    setShowPasswordModal(false);
  };

  const handleGenerateResetLink = async () => {
    if (!player) return;
    const result = (await generateResetLink.mutateAsync({
      id: player.id,
      body: { reset_base_url: `${window.location.origin}/reset-password` },
    })) as { data?: { reset_url?: string; expires_at?: string } };

    setResetUrl(result.data?.reset_url ?? null);
    setResetExpiresAt(result.data?.expires_at ?? null);
  };

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "ledger", label: "Ledger" },
    { id: "bets", label: "Bets" },
    { id: "reports", label: "Reports" },
  ] as const;
  const currency = String(player?.account_currency ?? "USD");

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={player ? `Player: ${player.username || player.email || player.id}` : "Player"}
        className="max-w-6xl"
        contentClassName="space-y-6"
      >
        {!player ? null : (
          <>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-sm text-[var(--c-text-muted)]">{player.email || "-"}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="rounded-[var(--r-pill)] border border-[var(--c-border)] px-2 py-1 text-xs text-[var(--c-text-muted)]">
                    {player.is_active ? "Active" : "Inactive"}
                  </span>
                  <span className="rounded-[var(--r-pill)] border border-[var(--c-border)] px-2 py-1 text-xs text-[var(--c-text-muted)]">
                    Balance {formatCurrency(player.balance ?? 0, currency)}
                  </span>
                  <span className="rounded-[var(--r-pill)] border border-[var(--c-border)] px-2 py-1 text-xs uppercase tracking-[0.12em] text-[var(--c-text-muted)]">
                    {currency}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button variant="primary" onClick={() => setShowTopup(true)}>
                  Topup
                </Button>
                <Button variant="destructive" onClick={() => setShowDeduct(true)}>
                  Deduct
                </Button>
                <Button variant="secondary" onClick={() => setShowPasswordModal(true)}>
                  Set Password
                </Button>
                <Button variant="secondary" onClick={() => setShowResetLinkModal(true)}>
                  Reset Link
                </Button>
                <Link href={`/master/players/${player.id}`}>
                  <Button variant="secondary">Open Full Page</Button>
                </Link>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {tabs.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`rounded-[var(--r-pill)] border px-3 py-1 text-sm ${
                    tab === item.id
                      ? "border-[var(--c-accent)] bg-[var(--c-accent-soft)] text-[var(--c-text)]"
                      : "border-[var(--c-border)] text-[var(--c-text-muted)]"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <ReportRangeTabs
              range={range}
              onRangeChange={setRange}
              from={from}
              to={to}
              onFromChange={setFrom}
              onToChange={setTo}
            />

            {tab === "overview" ? (
              <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
                <PlayerStatsCard stats={stats} currency={currency} />
                <Card variant="surface-2" className="p-6">
                  <h3 className="text-lg font-semibold text-[var(--c-text)]">Recent Activity</h3>
                  <div className="mt-4 space-y-3">
                    {bets.slice(0, 5).map((bet) => (
                      <div
                        key={String(bet.id)}
                        className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] p-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-medium text-[var(--c-text)]">
                              {String((bet.match as { team1?: string; team2?: string } | undefined)?.team1 || "-")} vs{" "}
                              {String((bet.match as { team1?: string; team2?: string } | undefined)?.team2 || "-")}
                            </div>
                            <div className="mt-1 text-xs text-[var(--c-text-muted)]">
                              {String((bet.odds as { bet_type?: string; outcome?: string } | undefined)?.bet_type || "-")} ·{" "}
                              {String((bet.odds as { outcome?: string } | undefined)?.outcome || "-")}
                            </div>
                          </div>
                          <div className="text-right text-sm text-[var(--c-text-muted)]">
                            <div>{formatCurrency(bet.stake ?? 0, currency)}</div>
                            <div className="capitalize">{String(bet.status || "-")}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            ) : null}

            {tab === "ledger" ? <PlayerLedgerTable ledger={ledger as never[]} currency={currency} /> : null}
            {tab === "bets" ? <PlayerBetsReport bets={bets as never[]} currency={currency} /> : null}

            {tab === "reports" ? (
              <Card variant="surface-2" className="p-6">
                <h3 className="text-lg font-semibold text-[var(--c-text)]">Report Summary</h3>
                <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <p className="text-sm text-[var(--c-text-muted)]">Total Bets</p>
                    <p className="text-xl font-mono text-[var(--c-text)]">{Number(stats.total_bets ?? 0)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-[var(--c-text-muted)]">Pending Bets</p>
                    <p className="text-xl font-mono text-[var(--c-warning)]">{Number(stats.pending_bets ?? 0)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-[var(--c-text-muted)]">Won</p>
                    <p className="text-xl font-mono text-[var(--c-success)]">{Number(stats.won_bets ?? 0)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-[var(--c-text-muted)]">Lost</p>
                    <p className="text-xl font-mono text-[var(--c-danger)]">{Number(stats.lost_bets ?? 0)}</p>
                  </div>
                </div>
                <Alert variant="info" className="mt-5">
                  This range is already applied to ledger and bet activity above. Use the full player page for the export block and deeper drill-down.
                </Alert>
              </Card>
            ) : null}
          </>
        )}
      </Modal>

      <PlayerActionModal
        isOpen={showTopup}
        onClose={() => setShowTopup(false)}
        title="Topup Player"
        submitLabel="Topup"
        amount={topupAmount}
        note={topupNote}
        onAmountChange={setTopupAmount}
        onNoteChange={setTopupNote}
        onSubmit={handleTopup}
        isPending={topup.isPending}
        isError={topup.isError}
      />

      <PlayerActionModal
        isOpen={showDeduct}
        onClose={() => setShowDeduct(false)}
        title="Deduct Player"
        submitLabel="Deduct"
        variant="destructive"
        amount={deductAmount}
        note={deductNote}
        onAmountChange={setDeductAmount}
        onNoteChange={setDeductNote}
        onSubmit={handleDeduct}
        isPending={deduct.isPending}
        isError={deduct.isError}
        max={String(player?.balance ?? 0)}
      />

      <PlayerPasswordModal
        isOpen={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
        onSubmit={handleSetPassword}
        isPending={setPassword.isPending}
        isError={setPassword.isError}
      />

      <PlayerResetLinkModal
        isOpen={showResetLinkModal}
        onClose={() => setShowResetLinkModal(false)}
        onGenerate={handleGenerateResetLink}
        resetUrl={resetUrl}
        expiresAt={resetExpiresAt}
        isPending={generateResetLink.isPending}
        isError={generateResetLink.isError}
      />
    </>
  );
}
