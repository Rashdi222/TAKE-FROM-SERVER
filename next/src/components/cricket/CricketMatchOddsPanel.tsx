"use client";

import { useMemo } from "react";
import { Card } from "@/components/ui/Card";
import { Tag } from "@/components/ui/Tag";
import { useAdminOdds } from "@/hooks/useOdds";
import { formatDateTime, toNumber } from "@/lib/format";
import type { Odds } from "@/lib/api";

export function CricketMatchOddsPanel({
  matchId,
  mode,
}: {
  matchId: string;
  mode: "draft" | "published" | "live" | "all";
}) {
  const filters =
    mode === "draft"
      ? { include_unpublished: "true" as const, visibility_status: "draft" as const }
      : mode === "published"
      ? { include_unpublished: "true" as const, visibility_status: "published" as const }
      : { include_unpublished: "true" as const };

  const { data, isLoading } = useAdminOdds(matchId, filters);
  const odds = useMemo(() => ((data as { data?: Odds[] } | undefined)?.data ?? []) as Odds[], [data]);

  const filteredOdds = useMemo(() => {
    if (mode === "live") {
      return odds
        .filter((item) => item.bet_type === "in_play" || item.visibility_status === "published")
        .sort((a, b) => Number(b.version_no ?? 0) - Number(a.version_no ?? 0));
    }

    return odds.sort((a, b) => Number(b.version_no ?? 0) - Number(a.version_no ?? 0));
  }, [mode, odds]);

  if (isLoading) {
    return (
      <Card variant="surface-1" className="p-4">
        <p className="text-sm text-[var(--c-text-muted)]">Loading odds...</p>
      </Card>
    );
  }

  if (filteredOdds.length === 0) {
    return (
      <Card variant="surface-1" className="p-4">
        <p className="text-sm text-[var(--c-text-muted)]">No matching odds in this cricket view yet.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {filteredOdds.slice(0, 8).map((odd) => (
        <div
          key={odd.id}
          className="rounded-[var(--r-card)] border border-[var(--c-border)] bg-[color:color-mix(in_srgb,var(--c-surface-1)_92%,transparent)] p-3"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Tag status={String(odd.visibility_status ?? "draft")} />
                <span className="rounded-[var(--r-pill)] border border-[var(--c-border)] px-2 py-1 text-[11px] text-[var(--c-text-muted)]">
                  {odd.bet_type ?? "market"}
                </span>
                <span className="rounded-[var(--r-pill)] border border-[var(--c-border)] px-2 py-1 text-[11px] text-[var(--c-text-muted)]">
                  v{odd.version_no ?? 1}
                </span>
              </div>
              <p className="mt-2 text-sm font-semibold text-[var(--c-text)]">{odd.outcome ?? "-"}</p>
              <p className="mt-1 text-xs text-[var(--c-text-faint)]">
                Added {formatDateTime(odd.inserted_at ?? null)}
              </p>
            </div>

            <div className="text-right">
              <p className="text-lg font-semibold text-[var(--c-text)]">
                {formatOdds(odd.odds_value)}
              </p>
              <p className="mt-1 text-xs text-[var(--c-text-faint)]">
                {odd.is_active ? "Active" : "Inactive"}
              </p>
            </div>
          </div>

          {(odd.max_stake_amount || odd.max_payout_amount || odd.admin_note) ? (
            <div className="mt-3 grid gap-2 text-xs text-[var(--c-text-muted)] md:grid-cols-3">
              <div>Max stake: {formatMaybeNumber(odd.max_stake_amount)}</div>
              <div>Max payout: {formatMaybeNumber(odd.max_payout_amount)}</div>
              <div>Source: {odd.source_type ?? "platform"}</div>
              {odd.admin_note ? (
                <div className="md:col-span-3">Admin note: {odd.admin_note}</div>
              ) : null}
            </div>
          ) : null}
        </div>
      ))}

      {filteredOdds.length > 8 ? (
        <p className="text-xs text-[var(--c-text-faint)]">
          Showing 8 of {filteredOdds.length} odds rows. Use Odds Desk for the full list.
        </p>
      ) : null}
    </div>
  );
}

function formatOdds(value: unknown) {
  const numeric = toNumber(value);
  if (numeric === null) return String(value ?? "-");
  return numeric.toFixed(2);
}

function formatMaybeNumber(value: unknown) {
  const numeric = toNumber(value);
  if (numeric === null) return String(value ?? "-");
  return numeric.toFixed(2);
}
