"use client";

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import type { Odds, ProviderOddsReference } from "@/lib/api";

function toNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function findPlatformComparison(
  item: ProviderOddsReference,
  platformOdds: Odds[],
) {
  return platformOdds.find(
    (odd) => odd.bet_type === item.bet_type && odd.outcome === item.outcome,
  );
}

export function ProviderReferenceCard({
  matchId,
  provider,
  references,
  platformOdds,
  isLoading,
  errorMessage,
  onImport,
  isImporting,
}: {
  matchId: string;
  provider?: string;
  references: ProviderOddsReference[];
  platformOdds: Odds[];
  isLoading?: boolean;
  errorMessage?: string | null;
  onImport: () => Promise<unknown>;
  isImporting?: boolean;
}) {
  return (
    <Card variant="surface-2" className="p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-[var(--c-text-faint)]">
            Provider Reference
          </p>
          <h2 className="mt-2 text-lg font-semibold text-[var(--c-text)]">
            {provider ? `${provider} comparison layer` : "Provider odds"}
          </h2>
          <p className="mt-2 text-sm text-[var(--c-text-muted)]">
            Review imported provider prices against your platform draft before publishing.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void onImport()} disabled={isImporting}>
            {isImporting ? "Importing..." : "Import Provider Odds"}
          </Button>
          <Link href={`/admin/matches/${matchId}`}>
            <Button variant="secondary">Back to Match</Button>
          </Link>
        </div>
      </div>

      {errorMessage ? <Alert variant="error" className="mt-4">{errorMessage}</Alert> : null}

      {isLoading ? (
        <p className="mt-4 text-sm text-[var(--c-text-muted)]">Loading provider odds...</p>
      ) : references.length === 0 ? (
        <p className="mt-4 text-sm text-[var(--c-text-muted)]">
          No provider reference odds available for this match yet.
        </p>
      ) : (
        <div className="mt-5 space-y-3">
          {references.slice(0, 8).map((item, index) => {
            const platform = findPlatformComparison(item, platformOdds);
            const providerOdds = toNumber(item.odds_value);
            const platformValue = toNumber(platform?.odds_value);
            const diff =
              platform && providerOdds > 0 ? (platformValue - providerOdds).toFixed(2) : null;

            return (
              <div
                key={`${item.source_market_key || "market"}-${item.outcome || index}`}
                className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] p-4"
              >
                <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-[var(--r-pill)] border border-[var(--c-border)] px-2 py-1 text-xs text-[var(--c-text-muted)]">
                        {item.bet_type || "market"}
                      </span>
                      <span className="rounded-[var(--r-pill)] border border-[var(--c-border)] px-2 py-1 text-xs text-[var(--c-text-muted)]">
                        {item.source_market_key || "provider market"}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-medium text-[var(--c-text)]">
                      {item.outcome || "Selection"}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-2 text-sm text-[var(--c-text-muted)] md:grid-cols-3">
                    <div>
                      <div className="text-xs uppercase tracking-[0.14em] text-[var(--c-text-faint)]">
                        Provider
                      </div>
                      <div className="font-medium text-[var(--c-text)]">{providerOdds.toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-[0.14em] text-[var(--c-text-faint)]">
                        Platform
                      </div>
                      <div className="font-medium text-[var(--c-text)]">
                        {platform ? platformValue.toFixed(2) : "Not set"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-[0.14em] text-[var(--c-text-faint)]">
                        Diff
                      </div>
                      <div className="font-medium text-[var(--c-text)]">
                        {diff !== null ? diff : "-"}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
