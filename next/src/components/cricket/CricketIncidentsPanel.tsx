"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { Match } from "@/lib/api";

export function CricketIncidentsPanel({
  incidents,
  busyId,
  onResume,
  onForceReprice,
}: {
  incidents: Match[];
  busyId?: string | null;
  onResume: (match: Match) => Promise<void> | void;
  onForceReprice: (match: Match) => Promise<void> | void;
}) {
  if (incidents.length === 0) {
    return (
      <Card variant="surface-1" className="p-6">
        <p className="text-sm text-[var(--c-text-muted)]">
          No cricket incidents are currently flagged for provider disconnect or manual admin review.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {incidents.map((match) => {
        const isBusy = busyId === String(match.id);
        const reason =
          match.suspension_reason ||
          ((match.market_state as Record<string, unknown> | undefined)?.manual_admin_review ? "manual_admin_review" : null) ||
          "incident";

        return (
          <Card key={String(match.id)} variant="surface-2" className="p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--c-danger)]">Incident</p>
                <h3 className="mt-2 text-lg font-semibold text-[var(--c-text)]">
                  {String(match.team1 || "Team 1")} vs {String(match.team2 || "Team 2")}
                </h3>
                <p className="mt-1 text-sm text-[var(--c-text-muted)]">
                  {match.start_time ? new Date(match.start_time).toLocaleString() : "No start time"}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-full border border-[rgba(255,60,60,0.22)] bg-[rgba(255,60,60,0.12)] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--c-danger)]">
                    {String(reason).replace(/_/g, " ")}
                  </span>
                  {match.live_state_version != null ? (
                    <span className="rounded-full border border-[var(--c-border)] px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-[var(--c-text-faint)]">
                      State v{match.live_state_version}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button variant="secondary" disabled={isBusy} onClick={() => void onResume(match)}>
                  {isBusy ? "Working..." : "Acknowledge & Resume"}
                </Button>
                <Button disabled={isBusy} onClick={() => void onForceReprice(match)}>
                  {isBusy ? "Working..." : "Force Reprice"}
                </Button>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
