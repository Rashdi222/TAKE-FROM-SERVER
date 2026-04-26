"use client";

import { useMemo, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { CompetitionFeed, CricketCompetitionDiscoveryItem } from "@/lib/api";

export function CricketCompetitionDiscoveryPanel({
  competitions,
  existingFeeds,
  onRefresh,
  onCreateAndImport,
  refreshing,
}: {
  competitions: CricketCompetitionDiscoveryItem[];
  existingFeeds: CompetitionFeed[];
  onRefresh: () => Promise<void>;
  onCreateAndImport: (competition: CricketCompetitionDiscoveryItem) => Promise<void>;
  refreshing?: boolean;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string>("");

  const grouped = useMemo(() => {
    return competitions.reduce<Record<string, CricketCompetitionDiscoveryItem[]>>((acc, item) => {
      const key = item.category_label || "Other";
      acc[key] = acc[key] ?? [];
      acc[key].push(item);
      return acc;
    }, {});
  }, [competitions]);

  const existingBySeason = useMemo(() => {
    return new Set(
      existingFeeds
        .filter((feed) => feed.provider?.name === "sportmonks")
        .map((feed) => `${feed.league_id ?? ""}:${feed.season_id ?? ""}`),
    );
  }, [existingFeeds]);

  const handleCreateAndImport = async (competition: CricketCompetitionDiscoveryItem) => {
    setBusyId(competition.id);
    setError("");

    try {
      await onCreateAndImport(competition);
    } catch {
      setError(`Unable to add ${competition.display_name ?? competition.name} right now.`);
    } finally {
      setBusyId(null);
    }
  };

  const handleRefresh = async () => {
    setError("");

    try {
      await onRefresh();
    } catch {
      setError("Unable to refresh the SportMonks cricket catalog right now.");
    }
  };

  return (
    <Card variant="surface-2" className="p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[var(--c-text)]">SportMonks Cricket Discovery</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--c-text-muted)]">
            Fetch current cricket competitions from SportMonks, grouped for operations, then create and import platform feeds without typing season IDs manually.
          </p>
        </div>

        <Button variant="secondary" onClick={() => void handleRefresh()} disabled={refreshing}>
          {refreshing ? "Refreshing..." : "Refresh Catalog"}
        </Button>
      </div>

      {error ? <Alert variant="error" className="mt-4">{error}</Alert> : null}

      {competitions.length === 0 ? (
        <div className="mt-5 rounded-[var(--r-card)] border border-dashed border-[var(--c-border)] p-5 text-sm text-[var(--c-text-muted)]">
          No SportMonks competitions are cached yet. Refresh the catalog after confirming the provider API key and base URL are correct.
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {Object.entries(grouped).map(([group, items]) => (
            <div key={group} className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--c-text-faint)]">
                  {group}
                </h3>
                <span className="text-xs text-[var(--c-text-faint)]">{items.length} competitions</span>
              </div>

              <div className="grid gap-3 xl:grid-cols-2">
                {items.map((competition) => {
                  const exists = existingBySeason.has(`${competition.league_id}:${competition.season_id}`);
                  const pending = busyId === competition.id;

                  return (
                    <div
                      key={competition.id}
                      className="rounded-[var(--r-card)] border border-[var(--c-border)] bg-[color:color-mix(in_srgb,var(--c-surface-1)_90%,transparent)] p-4"
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <p className="text-base font-semibold text-[var(--c-text)]">
                            {competition.display_name ?? competition.name}
                          </p>
                          <p className="mt-1 text-sm text-[var(--c-text-muted)]">
                            {competition.season_label ?? competition.season_name ?? competition.season_id}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <span className="rounded-[var(--r-pill)] border border-[var(--c-border)] px-2 py-1 text-xs text-[var(--c-text-muted)]">
                            League {competition.league_id}
                          </span>
                          <span className="rounded-[var(--r-pill)] border border-[var(--c-border)] px-2 py-1 text-xs text-[var(--c-text-muted)]">
                            Season {competition.season_id}
                          </span>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-2 text-xs text-[var(--c-text-faint)] md:grid-cols-2">
                        <div>Start: {formatShortDate(competition.starts_at)}</div>
                        <div>End: {formatShortDate(competition.ends_at)}</div>
                        <div>Feed key: {competition.competition_key}</div>
                        <div>Provider: SportMonks</div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {exists ? (
                          <span className="rounded-[var(--r-pill)] bg-[var(--c-accent-soft)] px-3 py-2 text-xs font-medium text-[var(--c-text)]">
                            Feed already added
                          </span>
                        ) : (
                          <Button
                            variant="primary"
                            onClick={() => void handleCreateAndImport(competition)}
                            disabled={pending}
                          >
                            {pending ? "Adding..." : "Create Feed + Import"}
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function formatShortDate(value?: string | null) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleDateString();
}
