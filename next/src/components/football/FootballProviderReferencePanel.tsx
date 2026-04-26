"use client";

import { useMemo } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAdminOdds, useImportProviderOdds, useProviderReferenceOdds } from "@/hooks/useOdds";
import {
  formatFootballMarketLabel,
  formatFootballSelectionLabel,
} from "@/lib/football/footballMarketDictionary";
import type { Odds, ProviderOddsReference } from "@/lib/api";

function toNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeMarketLabel(value?: string | null) {
  return formatFootballMarketLabel(value || "market");
}

function comparisonFor(item: ProviderOddsReference, platformOdds: Odds[]) {
  return platformOdds.find(
    (odd) => odd.bet_type === item.bet_type && odd.outcome === item.outcome,
  );
}

export function FootballProviderReferencePanel({ matchId }: { matchId: string }) {
  const { data: providerReference, isLoading, error } = useProviderReferenceOdds(matchId);
  const importProviderOdds = useImportProviderOdds(matchId);
  const { data: oddsData } = useAdminOdds(matchId, { include_unpublished: "true" });

  const provider = providerReference?.provider;
  const references = useMemo(
    () => ((providerReference?.data as ProviderOddsReference[] | undefined) ?? []),
    [providerReference],
  );
  const platformOdds = useMemo(
    () =>
      (((oddsData as { data?: Odds[] } | undefined)?.data ?? []) as Odds[]).filter(
        (odd) => odd.source_type !== "provider_import",
      ),
    [oddsData],
  );
  const publishedPlatformOdds = useMemo(
    () =>
      platformOdds.filter(
        (odd) => odd.source_type === "platform" && odd.visibility_status === "published" && odd.is_active,
      ),
    [platformOdds],
  );

  const grouped = useMemo(() => {
    const groups = references.reduce<Record<string, ProviderOddsReference[]>>((acc, item) => {
      const key = normalizeMarketLabel(item.source_market_key || item.bet_type);
      acc[key] = acc[key] ?? [];
      acc[key].push(item);
      return acc;
    }, {});

    return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]));
  }, [references]);

  const health = error instanceof Error
    ? { tone: "error" as const, label: "Provider odds unavailable", detail: error.message }
    : isLoading
      ? { tone: "neutral" as const, label: "Checking provider odds", detail: "Loading the current provider reference layer." }
      : references.length === 0
        ? { tone: "warning" as const, label: "No provider reference rows", detail: "This match currently has no usable provider odds reference." }
        : { tone: "success" as const, label: "Provider odds healthy", detail: `${references.length} reference rows loaded from ${provider || "provider source"}.` };

  const tradingState = useMemo(() => {
    if (error instanceof Error) {
      return {
        tone: "error" as const,
        label: "Provider check failed",
        detail: "The football board cannot be trusted until the provider fetch succeeds.",
      };
    }

    if (isLoading) {
      return {
        tone: "neutral" as const,
        label: "Refreshing live provider state",
        detail: "Checking whether API-Sports has usable live odds for this board.",
      };
    }

    if (references.length === 0) {
      return {
        tone: "warning" as const,
        label: "Not playable: provider returned no live odds",
        detail:
          "This live football match is visible, but API-Sports did not return any usable live odds rows for it. Until provider rows exist, the public side cannot show a playable board.",
      };
    }

    if (publishedPlatformOdds.length === 0) {
      return {
        tone: "warning" as const,
        label: "Reference available, board not yet published",
        detail:
          "Provider odds exist, but there are no active published platform odds on this match yet. Import or refresh the provider layer to make the board playable.",
      };
    }

    return {
      tone: "success" as const,
      label: "Playable",
      detail:
        "Provider live odds exist and the public board has active published prices. Users should be able to see and bet this football match.",
    };
  }, [error, isLoading, references.length, publishedPlatformOdds.length]);

  return (
    <Card variant="surface-2" className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--c-text-faint)]">
            Provider Reference
          </p>
          <p className="mt-2 text-sm leading-6 text-[var(--c-text-muted)]">
            Compare provider prices against your current platform board before importing or publishing.
          </p>
        </div>

        <Button
          variant="secondary"
          onClick={() => void importProviderOdds.mutateAsync({})}
          disabled={importProviderOdds.isPending}
        >
          {importProviderOdds.isPending ? "Importing..." : "Import Provider Odds"}
        </Button>
      </div>

      <div
        className={[
          "mt-4 rounded-[var(--r-md)] border px-4 py-3",
          health.tone === "success"
            ? "border-[rgba(68,211,190,0.24)] bg-[rgba(68,211,190,0.1)]"
            : health.tone === "warning"
              ? "border-[rgba(255,184,77,0.24)] bg-[rgba(255,184,77,0.1)]"
              : health.tone === "error"
                ? "border-[rgba(255,77,79,0.24)] bg-[rgba(255,77,79,0.1)]"
                : "border-[var(--c-border)] bg-[color:color-mix(in_srgb,var(--c-surface-1)_88%,transparent)]",
        ].join(" ")}
      >
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--c-text-faint)]">
          Odds Health
        </p>
        <p className="mt-2 text-sm font-semibold text-[var(--c-text)]">{health.label}</p>
        <p className="mt-1 text-sm leading-6 text-[var(--c-text-muted)]">{health.detail}</p>
      </div>

      <div
        className={[
          "mt-4 rounded-[var(--r-md)] border px-4 py-3",
          tradingState.tone === "success"
            ? "border-[rgba(68,211,190,0.24)] bg-[rgba(68,211,190,0.1)]"
            : tradingState.tone === "warning"
              ? "border-[rgba(255,184,77,0.24)] bg-[rgba(255,184,77,0.1)]"
              : tradingState.tone === "error"
                ? "border-[rgba(255,77,79,0.24)] bg-[rgba(255,77,79,0.1)]"
                : "border-[var(--c-border)] bg-[color:color-mix(in_srgb,var(--c-surface-1)_88%,transparent)]",
        ].join(" ")}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--c-text-faint)]">
              Trading State
            </p>
            <p className="mt-2 text-sm font-semibold text-[var(--c-text)]">{tradingState.label}</p>
            <p className="mt-1 text-sm leading-6 text-[var(--c-text-muted)]">{tradingState.detail}</p>
          </div>
          <div className="grid min-w-[180px] grid-cols-2 gap-2 text-right">
            <div>
              <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--c-text-faint)]">Provider Rows</p>
              <p className="mt-1 text-base font-semibold text-[var(--c-text)]">{references.length}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--c-text-faint)]">Published Odds</p>
              <p className="mt-1 text-base font-semibold text-[var(--c-text)]">{publishedPlatformOdds.length}</p>
            </div>
          </div>
        </div>
      </div>

      {error instanceof Error ? (
        <Alert variant="error" className="mt-4">
          {error.message}
        </Alert>
      ) : null}

      {isLoading ? (
        <p className="mt-4 text-sm text-[var(--c-text-muted)]">Loading provider comparison...</p>
      ) : references.length === 0 ? (
        <Alert variant="info" className="mt-4">
          No provider reference odds available for this football match yet.
        </Alert>
      ) : (
        <div className="mt-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--r-md)] border border-[var(--c-border)] bg-[color:color-mix(in_srgb,var(--c-surface-1)_88%,transparent)] px-4 py-3">
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-[var(--c-text-faint)]">Provider</p>
              <p className="mt-1 text-base font-semibold text-[var(--c-text)]">{provider || "Connected source"}</p>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-[0.14em] text-[var(--c-text-faint)]">Reference rows</p>
              <p className="mt-1 text-base font-semibold text-[var(--c-text)]">{references.length}</p>
            </div>
          </div>

          {grouped.slice(0, 4).map(([market, items]) => (
            <div key={market} className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[var(--c-text)]">{market}</h3>
                <span className="text-xs text-[var(--c-text-faint)]">{items.length} selections</span>
              </div>

              <div className="space-y-2">
                {items.slice(0, 4).map((item, index) => {
                  const platform = comparisonFor(item, platformOdds);
                  const providerValue = toNumber(item.odds_value);
                  const platformValue = platform ? toNumber(platform.odds_value) : null;
                  const diff = platformValue !== null ? platformValue - providerValue : null;

                  return (
                    <div
                      key={`${market}-${item.outcome || index}`}
                      className="grid gap-3 rounded-[var(--r-md)] border border-[var(--c-border)] bg-[color:color-mix(in_srgb,var(--c-surface-1)_92%,transparent)] p-3 md:grid-cols-[minmax(0,1fr)_7rem_7rem_6rem]"
                    >
                      <div>
                        <p className="text-sm font-medium text-[var(--c-text)]">
                          {formatFootballSelectionLabel(item.outcome || "Selection", {
                            marketKey: item.source_market_key || item.bet_type || "market",
                          })}
                        </p>
                        <p className="mt-1 text-xs text-[var(--c-text-faint)]">
                          {formatFootballMarketLabel(item.source_market_key || item.bet_type || "market")}
                          {item.source_market_key ? ` · ${item.source_market_key}` : ""}
                        </p>
                      </div>
                      <Stat label="Provider" value={providerValue.toFixed(2)} />
                      <Stat label="Platform" value={platformValue !== null ? platformValue.toFixed(2) : "Not set"} />
                      <Stat
                        label="Diff"
                        value={diff !== null ? `${diff > 0 ? "+" : ""}${diff.toFixed(2)}` : "-"}
                        tone={diff === null ? "muted" : diff === 0 ? "neutral" : diff > 0 ? "up" : "down"}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {grouped.length > 4 ? (
            <p className="text-xs text-[var(--c-text-faint)]">
              Showing the first 4 reference markets here. Use the full odds workspace for the complete reference layer.
            </p>
          ) : null}
        </div>
      )}
    </Card>
  );
}

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "muted" | "neutral" | "up" | "down";
}) {
  const toneClass =
    tone === "up"
      ? "text-[var(--c-success)]"
      : tone === "down"
        ? "text-[var(--c-danger)]"
        : tone === "muted"
          ? "text-[var(--c-text-faint)]"
          : "text-[var(--c-text)]";

  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--c-text-faint)]">{label}</p>
      <p className={`mt-1 text-sm font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}
