"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import type { CricketQuoteCalibrationReport, CricketQuoteCalibrationRow } from "@/lib/api";
import { useSuperAdminCricketQuoteCalibration } from "@/hooks/useSuperAdmin";

function asNumber(value: number | string | null | undefined) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function pct(value: number | string | null | undefined) {
  const numeric = asNumber(value);
  return numeric == null ? "-" : `${(numeric * 100).toFixed(2)}%`;
}

function odds(value: number | string | null | undefined) {
  const numeric = asNumber(value);
  return numeric == null ? "-" : numeric.toFixed(2);
}

function matchLabel(row: CricketQuoteCalibrationRow) {
  if (row.team1 || row.team2) return `${row.team1 || "Team 1"} vs ${row.team2 || "Team 2"}`;
  return row.match_id;
}

export default function CricketCalibrationReportPage() {
  const [limit, setLimit] = useState(60);
  const { data, isLoading } = useSuperAdminCricketQuoteCalibration(limit);
  const report = ((data as { data?: CricketQuoteCalibrationReport } | undefined)?.data ?? {}) as CricketQuoteCalibrationReport;
  const rows = report.recent_quotes ?? [];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.24em] text-[var(--c-accent)]">Reports</p>
        <h1 className="mt-2 text-3xl font-semibold text-[var(--c-text)]">Cricket Calibration Report</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--c-text-muted)]">
          This report reads directly from stored AI quote audit rows. Use it to spot soft cricket prices, large 1xBet drift, and unresolved match calibration coverage.
        </p>
      </div>

      <Card variant="surface-2" className="p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-[var(--c-text)]">Recent rows</label>
            <input
              type="number"
              min={20}
              max={500}
              step={20}
              value={limit}
              onChange={(event) => setLimit(Math.max(20, Math.min(500, Number(event.target.value) || 60)))}
              className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-2 text-[var(--c-text)]"
            />
          </div>
          <Button variant="secondary" onClick={() => setLimit(60)}>Reset</Button>
        </div>
      </Card>

      {isLoading ? (
        <p className="text-[var(--c-text-muted)]">Loading cricket calibration report...</p>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-5">
            <MetricCard label="Total Quotes" value={String(report.total_quotes ?? 0)} />
            <MetricCard label="With Reference" value={String(report.with_reference_count ?? 0)} />
            <MetricCard label="Resolved" value={String(report.resolved_count ?? 0)} />
            <MetricCard label="High Drift" value={String(report.high_drift_count ?? 0)} />
            <MetricCard label="Avg Drift" value={pct(report.average_reference_drift)} />
          </div>

          <Card variant="surface-1" className="overflow-hidden">
            <div className="border-b border-[var(--c-border)] px-6 py-4">
              <h2 className="text-xl font-semibold text-[var(--c-text)]">Recent Cricket Quote Audits</h2>
              <p className="mt-1 text-sm text-[var(--c-text-muted)]">
                Review how the AI published live cricket prices, what playbooks were active, and where drift against 1xBet was largest.
              </p>
            </div>
            {rows.length === 0 ? (
              <div className="p-6 text-[var(--c-text-muted)]">No cricket quote audit rows available yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1280px]">
                  <thead>
                    <tr className="border-b border-[var(--c-border)] bg-[var(--c-surface-2)]/50">
                      {["Match", "Market", "AI Price", "AI Prob", "Ref Price", "Ref Drift", "Reviewer", "Playbooks", "Resolved", "Observed"].map((label) => (
                        <th key={label} className="px-4 py-3 text-left text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id} className="border-b border-[var(--c-border)] last:border-b-0 hover:bg-[var(--c-surface-2)]/40">
                        <td className="px-4 py-4 text-sm text-[var(--c-text)]">
                          <div className="font-medium">{matchLabel(row)}</div>
                          <div className="mt-1 text-xs text-[var(--c-text-faint)]">{row.match_status || "-"}</div>
                        </td>
                        <td className="px-4 py-4 text-sm text-[var(--c-text)]">
                          <div>{row.market_key}</div>
                          <div className="mt-1 text-xs text-[var(--c-text-faint)]">{row.selection_key}</div>
                        </td>
                        <td className="px-4 py-4 font-mono text-sm text-[var(--c-text)]">{odds(row.published_price)}</td>
                        <td className="px-4 py-4 text-sm text-[var(--c-text)]">
                          <div>{pct(row.approved_probability)}</div>
                          <div className="mt-1 text-xs text-[var(--c-text-faint)]">conf {row.confidence_score?.toFixed?.(2) ?? row.confidence_score ?? "-"}</div>
                        </td>
                        <td className="px-4 py-4 text-sm text-[var(--c-text)]">
                          <div>{odds(row.reference_price)}</div>
                          <div className="mt-1 text-xs text-[var(--c-text-faint)]">{row.reference_source || "-"}</div>
                        </td>
                        <td className="px-4 py-4 font-mono text-sm text-[var(--c-text)]">{pct(row.reference_probability_delta)}</td>
                        <td className="px-4 py-4 text-sm text-[var(--c-text)]">{row.reviewer_decision || "-"}</td>
                        <td className="px-4 py-4 text-sm text-[var(--c-text)]">
                          {(row.active_playbooks ?? []).length ? (row.active_playbooks ?? []).join(", ") : "-"}
                        </td>
                        <td className="px-4 py-4 text-sm text-[var(--c-text)]">
                          <div>{row.eventual_match_status || "open"}</div>
                          <div className="mt-1 text-xs text-[var(--c-text-faint)]">{row.eventual_winner || "-"}</div>
                        </td>
                        <td className="px-4 py-4 text-sm text-[var(--c-text)]">{row.inserted_at ? new Date(row.inserted_at).toLocaleString() : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card variant="surface-2" className="p-5">
      <p className="text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">{label}</p>
      <p className="mt-3 font-mono text-2xl text-[var(--c-text)]">{value}</p>
    </Card>
  );
}
