"use client";

import { useState } from "react";
import { AdminBetTable } from "@/components/bets/AdminBetTable";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Bet } from "@/lib/api";
import { useSuperAdminBets } from "@/hooks/useSuperAdmin";

const statusOptions = ["", "pending", "active", "won", "lost", "cancelled", "rejected"];

export default function AdminBetsPage() {
  const [draftStatus, setDraftStatus] = useState("");
  const [draftMatchId, setDraftMatchId] = useState("");
  const [filters, setFilters] = useState<{ status?: string; match_id?: string }>({});
  const { data, isLoading } = useSuperAdminBets(filters);

  const bets: Bet[] = ((data as { data?: Bet[] } | undefined)?.data ?? []) as Bet[];

  const applyFilters = () => {
    setFilters({
      status: draftStatus || undefined,
      match_id: draftMatchId.trim() || undefined,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.24em] text-[var(--c-accent)]">Super Admin</p>
        <h1 className="mt-2 text-3xl font-semibold text-[var(--c-text)]">Bet Oversight</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--c-text-muted)]">
          Review all platform bets by status or match identifier. The current backend returns raw bet records only, so this screen focuses on operational traceability instead of joined player or match labels.
        </p>
      </div>

      <Card variant="surface-2" className="p-6">
        <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto]">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-[var(--c-text)]">Status</label>
            <select
              value={draftStatus}
              onChange={(event) => setDraftStatus(event.target.value)}
              className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-2 text-[var(--c-text)]"
            >
              {statusOptions.map((status) => (
                <option key={status || "all"} value={status}>
                  {status ? status : "All statuses"}
                </option>
              ))}
            </select>
          </div>

          <Input
            label="Match ID"
            value={draftMatchId}
            onChange={(event) => setDraftMatchId(event.target.value)}
            placeholder="Filter by exact match UUID"
          />

          <div className="flex items-end gap-3">
            <Button variant="primary" onClick={applyFilters}>
              Apply Filters
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setDraftStatus("");
                setDraftMatchId("");
                setFilters({});
              }}
            >
              Reset
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card variant="surface-2" className="p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Visible Bets</p>
          <p className="mt-3 font-mono text-3xl text-[var(--c-text)]">{bets.length}</p>
        </Card>
        <Card variant="surface-2" className="p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Active Window</p>
          <p className="mt-3 font-mono text-3xl text-[var(--c-info)]">
            {bets.filter((bet) => bet.status === "pending" || bet.status === "active").length}
          </p>
        </Card>
        <Card variant="surface-2" className="p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Settled / Closed</p>
          <p className="mt-3 font-mono text-3xl text-[var(--c-success)]">
            {bets.filter((bet) => ["won", "lost", "cancelled", "rejected"].includes(String(bet.status))).length}
          </p>
        </Card>
      </div>

      {isLoading ? <p className="text-[var(--c-text-muted)]">Loading admin bets...</p> : <AdminBetTable bets={bets} />}
    </div>
  );
}
