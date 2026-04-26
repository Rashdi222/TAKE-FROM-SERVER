"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Tag } from "@/components/ui/Tag";
import { Alert } from "@/components/ui/Alert";
import { useAdminMatch } from "@/hooks/useMatches";
import {
  useAdminOdds,
  useCreateOdds,
  useImportProviderOdds,
  useProviderReferenceOdds,
  useSportMarketConfigs,
} from "@/hooks/useOdds";
import { OddsForm } from "@/components/odds/OddsForm";
import { OddsList } from "@/components/odds/OddsList";
import { GenerateOddsButton } from "@/components/odds/GenerateOddsButton";
import { RegenerateButton } from "@/components/odds/RegenerateButton";
import { RewriteOddsModal } from "@/components/odds/RewriteOddsModal";
import { OrchestrateButton } from "@/components/odds/OrchestrateButton";
import { PublishButton } from "@/components/odds/PublishButton";
import { UnpublishButton } from "@/components/odds/UnpublishButton";
import { ProviderReferenceCard } from "@/components/odds/ProviderReferenceCard";
import { SportMarketTemplateCard } from "@/components/odds/SportMarketTemplateCard";
import type { Odds } from "@/lib/api";

interface MatchRecord {
  id: string;
  team1?: string;
  team2?: string;
  sport?: string;
  status?: string;
}

interface ProviderReferenceRecord {
  bet_type?: string | null;
  outcome?: string | null;
  odds_value?: number | string | null;
  source_provider?: string | null;
  source_market_key?: string | null;
  provider_snapshot?: Record<string, unknown> | null;
}

const tabs = [
  { id: "draft", label: "Draft" },
  { id: "published", label: "Published" },
  { id: "all", label: "All" },
] as const;

export default function AdminOddsWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [tab, setTab] = useState<(typeof tabs)[number]["id"]>("draft");

  const { data: matchData } = useAdminMatch(id);
  const match = (matchData as { data?: MatchRecord } | undefined)?.data;

  const oddsFilters =
    tab === "all"
      ? { include_unpublished: "true" as const }
      : {
          include_unpublished: "true" as const,
          visibility_status: tab,
        };

  const { data: oddsData, isLoading } = useAdminOdds(
    id,
    oddsFilters,
    {
      refetchInterval: 5_000,
      staleTime: 2_000,
      refetchOnWindowFocus: true,
    },
  );
  const odds = useMemo(
    () => (oddsData as { data?: Odds[] } | undefined)?.data || [],
    [oddsData],
  );
  const platformOdds = useMemo(
    () => odds.filter((odd) => odd.source_type !== "provider_import"),
    [odds],
  );
  const createOdds = useCreateOdds(id);
  const importProviderOdds = useImportProviderOdds(id);
  const {
    data: providerReference,
    isLoading: providerReferenceLoading,
    error: providerReferenceError,
  } = useProviderReferenceOdds(id);
  const { data: marketConfigs = [] } = useSportMarketConfigs({
    sport: match?.sport,
    enabled_only: "true",
  });
  const providerReferences = useMemo(
    () => ((providerReference?.data as ProviderReferenceRecord[] | undefined) ?? []),
    [providerReference],
  );

  const latestDraftVersion = useMemo(() => {
    const draftOdds = platformOdds.filter((odd) => odd.visibility_status === "draft");
    return draftOdds.reduce((max, odd) => Math.max(max, odd.version_no || 1), 0);
  }, [platformOdds]);

  const latestDraftOdds = useMemo(
    () => {
      return platformOdds.filter(
        (odd) => odd.visibility_status === "draft" && (odd.version_no || 1) === latestDraftVersion,
      );
    },
    [latestDraftVersion, platformOdds],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Link href={`/admin/matches/${id}`} className="text-sm text-[var(--c-accent)]">
            Back to Match
          </Link>
          <div className="mt-3 flex items-center gap-3">
            <Tag status={match?.status || "upcoming"} />
            <span className="text-xs uppercase tracking-[0.16em] text-[var(--c-text-faint)]">
              {match?.sport}
            </span>
          </div>
          <h1 className="mt-3 text-3xl font-bold text-[var(--c-text)]">
            Odds Workspace: {match?.team1} vs {match?.team2}
          </h1>
        </div>

        <div className="flex flex-wrap gap-2">
          <GenerateOddsButton
            matchId={id}
            sport={match?.sport}
            marketConfigs={marketConfigs}
          />
          <RegenerateButton matchId={id} />
          <RewriteOddsModal matchId={id} />
          <OrchestrateButton matchId={id} />
          <PublishButton matchId={id} />
          <UnpublishButton matchId={id} />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
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

          {isLoading ? (
            <p className="text-[var(--c-text-muted)]">Loading odds...</p>
          ) : (
            <OddsList odds={platformOdds} matchId={id} />
          )}
        </div>

        <div className="space-y-6">
          <ProviderReferenceCard
            matchId={id}
            provider={providerReference?.provider}
            references={providerReferences}
            platformOdds={platformOdds}
            isLoading={providerReferenceLoading}
            errorMessage={
              providerReferenceError instanceof Error ? providerReferenceError.message : null
            }
            onImport={() => importProviderOdds.mutateAsync({})}
            isImporting={importProviderOdds.isPending}
          />

          <OddsForm
            title="Manual Odds Entry"
            submitLabel="Create Odds"
            onSubmit={(body) => createOdds.mutateAsync(body).then(() => undefined)}
          />

          <SportMarketTemplateCard sport={match?.sport} configs={marketConfigs} />

          <Card variant="surface-2" className="p-6">
            <h2 className="mb-4 text-lg font-semibold text-[var(--c-text)]">
              Draft Preview Before Publish
            </h2>
            <p className="mb-4 text-sm text-[var(--c-text-muted)]">
              Review the latest draft batch before publishing it to players.
            </p>

            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-[var(--c-text-muted)]">Latest draft version</span>
                <span className="font-medium text-[var(--c-text)]">v{latestDraftVersion || 1}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-[var(--c-text-muted)]">Selections in preview</span>
                <span className="font-medium text-[var(--c-text)]">{latestDraftOdds.length}</span>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {latestDraftOdds.slice(0, 5).map((odd) => (
                <div
                  key={odd.id}
                  className="rounded-[var(--r-sm)] border border-[var(--c-border)] px-3 py-2 text-sm"
                >
                  <div className="font-medium text-[var(--c-text)]">{odd.outcome}</div>
                  <div className="text-[var(--c-text-muted)]">
                    {odd.bet_type} · {Number(odd.odds_value ?? 0).toFixed(2)}
                  </div>
                </div>
              ))}

              {latestDraftOdds.length === 0 ? (
                <Alert variant="info" className="mt-3">
                  No platform draft odds are ready yet. Generate or rewrite a batch before publishing.
                </Alert>
              ) : null}
            </div>
          </Card>
        </div>
      </div>

    </div>
  );
}
