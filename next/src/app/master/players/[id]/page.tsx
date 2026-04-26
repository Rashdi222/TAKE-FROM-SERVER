"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { PlayerDetailHeader } from "@/components/master/PlayerDetailHeader";
import { PlayerLedgerTable } from "@/components/master/PlayerLedgerTable";
import { PlayerStatsCard } from "@/components/master/PlayerStatsCard";
import { PlayerBetsReport } from "@/components/master/PlayerBetsReport";
import { ReportExportCard } from "@/components/master/ReportExportCard";
import { PlayerActionModal } from "@/components/master/PlayerActionModal";
import { PlayerPasswordModal } from "@/components/master/PlayerPasswordModal";
import { PlayerResetLinkModal } from "@/components/master/PlayerResetLinkModal";
import { ReportRangeTabs } from "@/components/master/ReportRangeTabs";
import { Alert } from "@/components/ui/Alert";
import { Card } from "@/components/ui/Card";
import {
  useMasterPlayer,
  useMasterPlayerBetsReport,
  useMasterPlayerLedger,
  useMasterPlayerReportExport,
  useMasterPlayerStats,
  useTopupPlayer,
  useDeductPlayer,
  useSetPlayerPassword,
  useGeneratePlayerResetLink,
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
      period: "custom",
    };
  }

  return {
    from: start.toISOString(),
    to: now.toISOString(),
    period: range === "1d" ? "daily" : range === "1w" ? "weekly" : "monthly",
  };
}

export default function PlayerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [tab, setTab] = useState<"overview" | "ledger" | "bets" | "reports">("overview");
  const [range, setRange] = useState<"1d" | "1w" | "1m" | "custom">("1d");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [showTopupModal, setShowTopupModal] = useState(false);
  const [showDeductModal, setShowDeductModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showResetLinkModal, setShowResetLinkModal] = useState(false);
  const [topupAmount, setTopupAmount] = useState("");
  const [deductAmount, setDeductAmount] = useState("");
  const [topupNote, setTopupNote] = useState("");
  const [deductNote, setDeductNote] = useState("");
  const [resetUrl, setResetUrl] = useState<string | null>(null);
  const [resetExpiresAt, setResetExpiresAt] = useState<string | null>(null);

  const filters = useMemo(() => rangeToFilters(range, from, to), [range, from, to]);
  const { data: player } = useMasterPlayer(id);
  const { data: ledgerData } = useMasterPlayerLedger(id, filters);
  const { data: statsData } = useMasterPlayerStats(id);
  const { data: betsData } = useMasterPlayerBetsReport(id, { ...filters, limit: 100 });
  const { data: exportData } = useMasterPlayerReportExport(id, filters);
  const topup = useTopupPlayer();
  const deduct = useDeductPlayer();
  const setPassword = useSetPlayerPassword();
  const generateResetLink = useGeneratePlayerResetLink();

  const playerRecord = player as
    | {
        id: string;
        username?: string | null;
        email?: string;
        account_currency?: string;
        balance?: number | string;
        is_active?: boolean;
      }
    | null;
  const currency = String(playerRecord?.account_currency ?? "USD");
  const ledger =
    ((ledgerData as { data?: Array<Record<string, unknown>> } | undefined)?.data ?? []) as Array<
      Record<string, unknown>
    >;
  const stats = (statsData as { data?: Record<string, unknown> } | undefined)?.data || {};
  const bets =
    ((betsData as { data?: { bets?: Array<Record<string, unknown>> } } | undefined)?.data?.bets ??
      []) as Array<Record<string, unknown>>;
  const reportExport = (exportData as { data?: Record<string, unknown> } | undefined)?.data;

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "ledger", label: "Ledger" },
    { id: "bets", label: "Bets" },
    { id: "reports", label: "Reports" },
  ] as const;

  const handleTopup = async () => {
    await topup.mutateAsync({
      id,
      body: { amount: Number(topupAmount), note: topupNote },
    });
    setShowTopupModal(false);
    setTopupAmount("");
    setTopupNote("");
  };

  const handleDeduct = async () => {
    await deduct.mutateAsync({
      id,
      body: { amount: Number(deductAmount), note: deductNote },
    });
    setShowDeductModal(false);
    setDeductAmount("");
    setDeductNote("");
  };

  const handleSetPassword = async (password: string, passwordConfirmation: string) => {
    await setPassword.mutateAsync({
      id,
      body: { password, password_confirmation: passwordConfirmation },
    });
    setShowPasswordModal(false);
  };

  const handleGenerateResetLink = async () => {
    const result = (await generateResetLink.mutateAsync({
      id,
      body: { reset_base_url: `${window.location.origin}/reset-password` },
    })) as { data?: { reset_url?: string; expires_at?: string } };

    setResetUrl(result.data?.reset_url ?? null);
    setResetExpiresAt(result.data?.expires_at ?? null);
  };

  return (
    <div className="space-y-6">
      <div>
        <Link href="/master/players" className="text-sm text-[var(--c-accent)]">
          Back to Players
        </Link>
      </div>

      {playerRecord ? (
        <PlayerDetailHeader
          player={playerRecord}
          onTopup={() => setShowTopupModal(true)}
          onDeduct={() => setShowDeductModal(true)}
        />
      ) : (
        <Alert variant="warning">Player not found.</Alert>
      )}

      <Card variant="surface-2" className="p-4">
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
      </Card>

      <ReportRangeTabs
        range={range}
        onRangeChange={setRange}
        from={from}
        to={to}
        onFromChange={setFrom}
        onToChange={setTo}
      />

      {tab === "overview" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <PlayerStatsCard stats={stats} currency={currency} />
          <ReportExportCard exportData={reportExport} playerId={id} />
          <Card variant="surface-2" className="p-6 lg:col-span-2">
            <h2 className="text-lg font-semibold text-[var(--c-text)]">Password Access</h2>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setShowPasswordModal(true)}
                className="rounded-[var(--r-pill)] border border-[var(--c-border)] px-4 py-2 text-sm text-[var(--c-text)]"
              >
                Set password directly
              </button>
              <button
                type="button"
                onClick={() => setShowResetLinkModal(true)}
                className="rounded-[var(--r-pill)] border border-[var(--c-border)] px-4 py-2 text-sm text-[var(--c-text)]"
              >
                Generate reset link
              </button>
            </div>
            <p className="mt-3 text-sm text-[var(--c-text-muted)]">
              Use direct password set for support cases. Use reset link when you want the player to set their own password through WhatsApp.
            </p>
          </Card>
        </div>
      ) : null}

      {tab === "ledger" ? (
        <div>
          <h2 className="mb-4 text-xl font-bold text-[var(--c-text)]">Ledger</h2>
          <PlayerLedgerTable ledger={ledger as never[]} currency={currency} />
        </div>
      ) : null}

      {tab === "bets" ? (
        <div>
          <h2 className="mb-4 text-xl font-bold text-[var(--c-text)]">Bet Activity</h2>
          <PlayerBetsReport bets={bets as never[]} currency={currency} />
        </div>
      ) : null}

      {tab === "reports" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card variant="surface-2" className="p-6">
            <h2 className="text-lg font-semibold text-[var(--c-text)]">Performance Summary</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-sm text-[var(--c-text-muted)]">Total Bets</p>
                <p className="text-xl font-mono text-[var(--c-text)]">{Number(stats.total_bets ?? 0)}</p>
              </div>
              <div>
                <p className="text-sm text-[var(--c-text-muted)]">Pending Bets</p>
                <p className="text-xl font-mono text-[var(--c-warning)]">{Number(stats.pending_bets ?? 0)}</p>
              </div>
              <div>
                <p className="text-sm text-[var(--c-text-muted)]">Won Bets</p>
                <p className="text-xl font-mono text-[var(--c-success)]">{Number(stats.won_bets ?? 0)}</p>
              </div>
              <div>
                <p className="text-sm text-[var(--c-text-muted)]">Lost Bets</p>
                <p className="text-xl font-mono text-[var(--c-danger)]">{Number(stats.lost_bets ?? 0)}</p>
              </div>
            </div>
          </Card>

          <ReportExportCard exportData={reportExport} playerId={id} />
        </div>
      ) : null}

      <PlayerActionModal
        isOpen={showTopupModal}
        onClose={() => setShowTopupModal(false)}
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
        isOpen={showDeductModal}
        onClose={() => setShowDeductModal(false)}
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
        max={String(playerRecord?.balance ?? 0)}
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
    </div>
  );
}
