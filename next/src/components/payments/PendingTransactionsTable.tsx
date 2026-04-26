"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PaymentStatusBadge } from "@/components/payments/PaymentStatusBadge";
import { ReceiptViewerModal } from "@/components/payments/ReceiptViewerModal";
import { formatCurrency, formatDateTime } from "@/lib/format";
import type { PaymentTransaction } from "@/lib/api";
import { ApiError } from "@/lib/api/errors";

type Scope = "super" | "master";

type ActionHandlers = {
  approveDeposit: (id: string) => Promise<unknown>;
  rejectDeposit: (id: string, reason?: string) => Promise<unknown>;
  approveWithdrawal: (id: string) => Promise<unknown>;
  rejectWithdrawal: (id: string, reason?: string) => Promise<unknown>;
};

export function PendingTransactionsTable({
  transactions,
  scope,
  currency = "USD",
  actions,
}: {
  transactions: PaymentTransaction[];
  scope: Scope;
  currency?: string;
  actions: ActionHandlers;
}) {
  const [receiptTxId, setReceiptTxId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"" | "deposit" | "withdrawal">("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);

  const rows = useMemo(
    () =>
      transactions.map((tx) => ({
        ...tx,
        playerLabel: tx.player?.username || tx.player?.email || tx.user_id || "-",
        methodLabel: tx.payment_method?.method_name || tx.payment_method?.provider || "-",
        hasReceipt: Boolean(tx.receipt_path),
        isDeposit: tx.type === "deposit",
      })),
    [transactions]
  );

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return rows.filter((transaction) => {
      const typeMatches = !typeFilter || transaction.type === typeFilter;
      if (!typeMatches) return false;

      const insertedAt = transaction.inserted_at ? new Date(transaction.inserted_at) : null;
      if (fromDate) {
        const from = new Date(`${fromDate}T00:00:00`);
        if (!insertedAt || insertedAt < from) return false;
      }
      if (toDate) {
        const to = new Date(`${toDate}T23:59:59`);
        if (!insertedAt || insertedAt > to) return false;
      }

      if (!query) return true;

      const haystack = [
        transaction.playerLabel,
        transaction.player?.id,
        transaction.methodLabel,
        transaction.payment_method?.bank_name,
        transaction.type,
        transaction.id,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [fromDate, rows, search, toDate, typeFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, pageSize, safePage]);

  async function handleAction(
    transaction: PaymentTransaction,
    kind: "approve" | "reject"
  ) {
    const actionLabel = `${kind} ${transaction.type}`;
    const confirmed = window.confirm(`Confirm ${actionLabel}?`);
    if (!confirmed) return;

    setBusyId(transaction.id);
    setError(null);

    try {
      if (transaction.type === "deposit") {
        if (kind === "approve") await actions.approveDeposit(transaction.id);
        else {
          const reason = window.prompt("Optional rejection reason", "") ?? undefined;
          await actions.rejectDeposit(transaction.id, reason);
        }
      } else {
        if (kind === "approve") await actions.approveWithdrawal(transaction.id);
        else {
          const reason = window.prompt("Optional rejection reason", "") ?? undefined;
          await actions.rejectWithdrawal(transaction.id, reason);
        }
      }
    } catch (err) {
      const message = err instanceof ApiError ? err.message : err instanceof Error ? err.message : `Failed to ${actionLabel}`;

      if (kind === "approve" && transaction.type === "withdrawal" && message.toLowerCase().includes("insufficient balance")) {
        const defaultReason = "Player used the available balance before this withdrawal was approved. Submit a new withdrawal request with the current available balance.";
        const shouldReject = window.confirm(
          "This withdrawal can no longer be approved because the player used the balance after requesting it. Reject this request with a clear reason now?"
        );

        if (shouldReject) {
          try {
            await actions.rejectWithdrawal(transaction.id, defaultReason);
            return;
          } catch (rejectError) {
            setError(rejectError instanceof Error ? rejectError.message : "Failed to reject the withdrawal request.");
            return;
          }
        }

        setError("This withdrawal can no longer be approved because the player used the balance after requesting it. Reject the request and ask the player to submit a new one with the current available balance.");
        return;
      }

      setError(message);
    } finally {
      setBusyId(null);
    }
  }

  function handleExportCsv() {
    const lines = [
      ["date", "player", "player_id", "type", "amount", "method", "bank", "status", "transaction_id"].join(","),
      ...filteredRows.map((transaction) =>
        [
          escapeCsv(formatDateTime(transaction.inserted_at)),
          escapeCsv(transaction.playerLabel),
          escapeCsv(transaction.player?.id ?? ""),
          escapeCsv(transaction.type ?? ""),
          escapeCsv(String(transaction.amount ?? "")),
          escapeCsv(transaction.methodLabel),
          escapeCsv(transaction.payment_method?.bank_name ?? ""),
          escapeCsv(String(transaction.status ?? "")),
          escapeCsv(transaction.id),
        ].join(",")
      ),
    ];

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "payment-approval-queue.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="space-y-4">
        {error ? (
          <Card variant="surface-1" className="border-[rgba(255,60,60,0.25)] p-4 text-sm text-[var(--c-danger)]">
            {error}
          </Card>
        ) : null}

        <Card variant="surface-2" className="p-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <div className="flex flex-col gap-2 xl:col-span-2">
              <label className="text-sm font-medium text-[var(--c-text)]">Search queue</label>
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Search player, method, bank, or transaction id"
                className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-2 text-[var(--c-text)]"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-[var(--c-text)]">Type</label>
              <select
                value={typeFilter}
                onChange={(event) => {
                  setTypeFilter(event.target.value as "" | "deposit" | "withdrawal");
                  setPage(1);
                }}
                className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-2 text-[var(--c-text)]"
              >
                <option value="">All types</option>
                <option value="deposit">Deposit</option>
                <option value="withdrawal">Withdrawal</option>
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-[var(--c-text)]">From</label>
              <input
                type="date"
                value={fromDate}
                onChange={(event) => {
                  setFromDate(event.target.value);
                  setPage(1);
                }}
                className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-2 text-[var(--c-text)]"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-[var(--c-text)]">To</label>
              <input
                type="date"
                value={toDate}
                onChange={(event) => {
                  setToDate(event.target.value);
                  setPage(1);
                }}
                className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-2 text-[var(--c-text)]"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-[var(--c-text)]">Rows per page</label>
              <select
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setPage(1);
                }}
                className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-2 text-[var(--c-text)]"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </div>
            <div className="flex items-end">
              <Button type="button" variant="secondary" className="w-full" onClick={handleExportCsv}>
                Export CSV
              </Button>
            </div>
          </div>
        </Card>

        {filteredRows.length === 0 ? (
          <Card variant="surface-1" className="p-8 text-center text-[var(--c-text-muted)]">
            No pending payment requests matched the current filters.
          </Card>
        ) : (
          <Card variant="surface-1" className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1120px]">
                <thead>
                  <tr className="border-b border-[var(--c-border)] bg-[var(--c-surface-2)]/50">
                    <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Date</th>
                    <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Player</th>
                    <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Type</th>
                    <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Amount</th>
                    <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Method</th>
                    <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Receipt</th>
                    <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Status</th>
                    <th className="px-4 py-3 text-right text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map((transaction) => {
                    const isBusy = busyId === transaction.id;
                    const providerResponse = (transaction.provider_response ?? {}) as Record<string, unknown>;
                    const withdrawalAccountTitle = typeof providerResponse.destination_account_title === "string" ? providerResponse.destination_account_title : null;
                    const withdrawalAccountNumber = typeof providerResponse.destination_account_number === "string" ? providerResponse.destination_account_number : null;

                    return (
                      <tr key={transaction.id} className="border-b border-[var(--c-border)] last:border-b-0 hover:bg-[var(--c-surface-2)]/40">
                        <td className="px-4 py-4 text-sm text-[var(--c-text-muted)]">{formatDateTime(transaction.inserted_at)}</td>
                        <td className="px-4 py-4">
                          <div className="text-sm font-medium text-[var(--c-text)]">{transaction.playerLabel}</div>
                          <div className="mt-1 font-mono text-xs text-[var(--c-text-faint)]">{transaction.player?.id?.slice(0, 8) ?? "-"}</div>
                        </td>
                        <td className="px-4 py-4 text-sm font-medium capitalize text-[var(--c-text)]">{transaction.type}</td>
                        <td className="px-4 py-4 font-mono text-sm text-[var(--c-text)]">{formatCurrency(transaction.amount, currency)}</td>
                        <td className="px-4 py-4">
                          <div className="text-sm text-[var(--c-text)]">{transaction.methodLabel}</div>
                          <div className="mt-1 text-xs text-[var(--c-text-faint)]">{transaction.payment_method?.bank_name ?? transaction.payment_method?.provider ?? "-"}</div>
                          {transaction.type === "withdrawal" && (withdrawalAccountTitle || withdrawalAccountNumber) ? (
                            <div className="mt-2 space-y-1 rounded-[var(--r-sm)] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-3 py-2 text-xs text-[var(--c-text-muted)]">
                              <div>
                                <span className="text-[var(--c-text-faint)]">Payout title:</span>{" "}
                                <span className="text-[var(--c-text)]">{withdrawalAccountTitle ?? "-"}</span>
                              </div>
                              <div>
                                <span className="text-[var(--c-text-faint)]">Payout account:</span>{" "}
                                <span className="font-mono text-[var(--c-text)]">{withdrawalAccountNumber ?? "-"}</span>
                              </div>
                            </div>
                          ) : null}
                        </td>
                        <td className="px-4 py-4">
                          {transaction.hasReceipt ? (
                            <button
                              type="button"
                              onClick={() => setReceiptTxId(transaction.id)}
                              className="rounded-full border border-[var(--c-accent)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--c-accent)] transition hover:bg-[var(--c-accent-soft)]"
                            >
                              View receipt
                            </button>
                          ) : (
                            <span className="text-xs uppercase tracking-[0.14em] text-[var(--c-text-faint)]">No file</span>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <PaymentStatusBadge status={transaction.status} />
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              className="min-w-[8rem] bg-[var(--c-success)] shadow-[0_10px_28px_rgba(100,181,19,0.18)] hover:bg-[#5ab10a]"
                              disabled={isBusy}
                              onClick={() => handleAction(transaction, "approve")}
                            >
                              {isBusy ? "Working..." : "Approve"}
                            </Button>
                            <Button
                              type="button"
                              variant="destructive"
                              className="min-w-[8rem]"
                              disabled={isBusy}
                              onClick={() => handleAction(transaction, "reject")}
                            >
                              {isBusy ? "Working..." : "Reject"}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col gap-3 border-t border-[var(--c-border)] px-4 py-4 md:flex-row md:items-center md:justify-between">
              <div className="text-sm text-[var(--c-text-muted)]">
                Showing {(safePage - 1) * pageSize + 1}-
                {Math.min(safePage * pageSize, filteredRows.length)} of {filteredRows.length}
              </div>
              <div className="flex items-center justify-end gap-2">
                <Button variant="secondary" type="button" className="px-4 py-2 text-xs" disabled={safePage <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>
                  Previous
                </Button>
                <span className="px-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--c-text-faint)]">
                  Page {safePage} / {totalPages}
                </span>
                <Button variant="secondary" type="button" className="px-4 py-2 text-xs" disabled={safePage >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>
                  Next
                </Button>
              </div>
            </div>
          </Card>
        )}
      </div>

      <ReceiptViewerModal
        isOpen={Boolean(receiptTxId)}
        onClose={() => setReceiptTxId(null)}
        transactionId={receiptTxId}
        scope={scope}
      />
    </>
  );
}

function escapeCsv(value: string) {
  const normalized = value.replaceAll("\"", "\"\"");
  return `"${normalized}"`;
}
