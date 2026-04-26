"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PaymentStatusBadge } from "@/components/payments/PaymentStatusBadge";
import type { PaymentTransaction } from "@/lib/api";
import { formatCurrency, formatDateTime } from "@/lib/format";

export function PaymentTransactionsHistoryTable({
  transactions,
  isLoading,
}: {
  transactions: PaymentTransaction[];
  isLoading?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);

  const stableTransactions = useMemo(() => transactions, [transactions]);

  const filteredTransactions = useMemo(() => {
    const query = search.trim().toLowerCase();

    return stableTransactions.filter((transaction) => {
      const typeMatches = !typeFilter || transaction.type === typeFilter;
      const statusMatches = !statusFilter || transaction.status === statusFilter;
      if (!typeMatches || !statusMatches) return false;

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
        transaction.id,
        transaction.player?.username,
        transaction.player?.email,
        transaction.player?.id,
        transaction.payment_method?.method_name,
        transaction.payment_method?.bank_name,
        transaction.payment_method?.provider,
        transaction.provider_transaction_id,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [fromDate, search, stableTransactions, statusFilter, toDate, typeFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedTransactions = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredTransactions.slice(start, start + pageSize);
  }, [filteredTransactions, pageSize, safePage]);

  function handleExportCsv() {
    const lines = [
      ["date", "player", "player_id", "method", "bank", "type", "status", "amount", "provider_ref", "transaction_id"].join(","),
      ...filteredTransactions.map((transaction) =>
        [
          escapeCsv(formatDateTime(transaction.inserted_at)),
          escapeCsv(transaction.player?.username ?? transaction.player?.email ?? ""),
          escapeCsv(transaction.player?.id ?? transaction.user_id ?? ""),
          escapeCsv(transaction.payment_method?.method_name ?? ""),
          escapeCsv(transaction.payment_method?.bank_name ?? transaction.payment_method?.provider ?? ""),
          escapeCsv(String(transaction.type ?? "")),
          escapeCsv(String(transaction.status ?? "")),
          escapeCsv(String(transaction.amount ?? "")),
          escapeCsv(transaction.provider_transaction_id ?? ""),
          escapeCsv(transaction.id),
        ].join(",")
      ),
    ];

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "payment-transactions.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <Card variant="surface-2" className="p-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-7">
          <div className="flex flex-col gap-2 xl:col-span-2">
            <label className="text-sm font-medium text-[var(--c-text)]">Search</label>
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search player, method, provider ref, or transaction id"
              className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-2 text-[var(--c-text)]"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-[var(--c-text)]">Type</label>
            <select
              value={typeFilter}
              onChange={(event) => {
                setTypeFilter(event.target.value);
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
            <label className="text-sm font-medium text-[var(--c-text)]">Status</label>
            <select
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value);
                setPage(1);
              }}
              className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-2 text-[var(--c-text)]"
            >
              <option value="">All statuses</option>
              <option value="pending">Pending</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="cancelled">Cancelled</option>
            </select>
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
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
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
          <div className="flex items-end">
            <Button type="button" variant="secondary" className="w-full" onClick={handleExportCsv}>
              Export CSV
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card variant="surface-1" className="p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Rows</p>
            <p className="mt-3 font-mono text-2xl text-[var(--c-text)]">{filteredTransactions.length}</p>
          </Card>
          <Card variant="surface-1" className="p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Pending Value</p>
            <p className="mt-3 font-mono text-2xl text-[var(--c-warning)]">
              {formatCurrency(
                filteredTransactions
                  .filter((transaction) => transaction.status === "pending")
                  .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0)
              )}
            </p>
          </Card>
        </div>
      </Card>

      {isLoading ? (
        <p className="text-[var(--c-text-muted)]">Loading payment transactions...</p>
      ) : filteredTransactions.length === 0 ? (
        <Card variant="surface-1" className="p-6">
          <p className="text-center text-[var(--c-text-muted)]">No transactions matched the current filters.</p>
        </Card>
      ) : (
        <Card variant="surface-1" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px]">
              <thead>
                <tr className="border-b border-[var(--c-border)] bg-[var(--c-surface-2)]/50">
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Transaction</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Player</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Method</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Type</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Status</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Amount</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Provider Ref</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Created</th>
                </tr>
              </thead>
              <tbody>
                {pagedTransactions.map((transaction) => (
                  (() => {
                    const providerResponse = (transaction.provider_response ?? {}) as Record<string, unknown>;
                    const rejectionReason = typeof providerResponse.reason === "string" ? providerResponse.reason : null;

                    return (
                  <tr key={transaction.id} className="border-b border-[var(--c-border)] last:border-b-0 hover:bg-[var(--c-surface-2)]/40">
                    <td className="px-4 py-4 font-mono text-sm text-[var(--c-text)]">{transaction.id.slice(0, 8)}...</td>
                    <td className="px-4 py-4">
                      <div className="text-sm text-[var(--c-text)]">{transaction.player?.username ?? transaction.player?.email ?? transaction.user_id?.slice(0, 8) ?? "-"}</div>
                      <div className="mt-1 font-mono text-xs text-[var(--c-text-faint)]">{transaction.player?.id?.slice(0, 8) ?? transaction.user_id?.slice(0, 8) ?? "-"}</div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-sm text-[var(--c-text)]">{transaction.payment_method?.method_name ?? transaction.payment_method_id?.slice(0, 8) ?? "-"}</div>
                      <div className="mt-1 text-xs text-[var(--c-text-faint)]">{transaction.payment_method?.bank_name ?? transaction.payment_method?.provider ?? "-"}</div>
                    </td>
                    <td className="px-4 py-4 text-sm capitalize text-[var(--c-text)]">{transaction.type ?? "-"}</td>
                    <td className="px-4 py-4 text-sm"><PaymentStatusBadge status={transaction.status} /></td>
                    <td className="px-4 py-4 font-mono text-sm text-[var(--c-text)]">{formatCurrency(transaction.amount)}</td>
                    <td className="px-4 py-4 font-mono text-sm text-[var(--c-text-muted)]">{transaction.provider_transaction_id ?? "-"}</td>
                    <td className="px-4 py-4 text-sm text-[var(--c-text-muted)]">
                      <div>{formatDateTime(transaction.inserted_at)}</div>
                      {rejectionReason ? <div className="mt-2 text-xs leading-5 text-[var(--c-danger)]">{rejectionReason}</div> : null}
                    </td>
                  </tr>
                    );
                  })()
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-3 border-t border-[var(--c-border)] px-4 py-4 md:flex-row md:items-center md:justify-between">
            <div className="text-sm text-[var(--c-text-muted)]">
              Showing {(safePage - 1) * pageSize + 1}-{Math.min(safePage * pageSize, filteredTransactions.length)} of {filteredTransactions.length}
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
  );
}

function escapeCsv(value: string) {
  const normalized = value.replaceAll("\"", "\"\"");
  return `"${normalized}"`;
}
