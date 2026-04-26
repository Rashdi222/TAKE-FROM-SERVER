"use client";

import { useMemo, useState } from "react";
import { BrainCircuit, RadioTower, Shuffle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { CompetitionFeed } from "@/lib/api";

type PricingMode = "provider_only" | "ai_only" | "hybrid";

const pricingModes: Array<{
  id: PricingMode;
  label: string;
  icon: typeof BrainCircuit;
  description: string;
  impact: string;
}> = [
  {
    id: "provider_only",
    label: "Provider",
    icon: RadioTower,
    description: "Use provider reference odds as the live trading surface and keep platform AI publishing disabled.",
    impact: "Fastest operational mode when AI should stay out of the football board.",
  },
  {
    id: "ai_only",
    label: "AI Platform",
    icon: BrainCircuit,
    description: "Use your platform AI pricing only and keep provider odds as a non-trading concern.",
    impact: "Cleanest platform-owned pricing path for operator-led markets.",
  },
  {
    id: "hybrid",
    label: "Hybrid",
    icon: Shuffle,
    description: "Feed provider state and provider odds into the AI workflow, then publish platform odds as the final board.",
    impact: "Best mode for advanced football trading once coverage and model health are stable.",
  },
] as const;

export function FootballPricingStrategyPanel({
  feeds,
  activeModel,
  apiKeyConfigured,
  busyId,
  onSave,
}: {
  feeds: CompetitionFeed[];
  activeModel?: string | null;
  apiKeyConfigured?: boolean;
  busyId?: string | null;
  onSave: (feed: CompetitionFeed, mode: PricingMode) => Promise<void>;
}) {
  const footballFeeds = useMemo(() => feeds.filter((feed) => feed.sport === "football"), [feeds]);
  const [draftByFeed, setDraftByFeed] = useState<Record<string, PricingMode>>({});

  if (!footballFeeds.length) {
    return (
      <Card variant="surface-2" className="p-5">
        <h2 className="text-lg font-semibold text-[var(--c-text)]">Football Pricing Strategy</h2>
        <p className="mt-3 text-sm leading-6 text-[var(--c-text-muted)]">
          Create at least one football feed before assigning provider, AI, or hybrid pricing mode.
        </p>
      </Card>
    );
  }

  return (
    <Card variant="surface-2" className="p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[var(--c-text)]">Football Pricing Strategy</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--c-text-muted)]">
            Choose what drives each football board. This is the operator control for provider-only, platform AI only,
            or the hybrid reference-plus-AI path.
          </p>
        </div>

        <div className="rounded-[var(--r-card)] border border-[var(--c-border)] bg-[color:color-mix(in_srgb,var(--c-surface-1)_90%,transparent)] px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--c-text-faint)]">AI Runtime</p>
          <p className="mt-2 text-sm font-semibold text-[var(--c-text)]">
            {activeModel || "No OpenRouter model selected"}
          </p>
          <p className="mt-1 text-xs text-[var(--c-text-muted)]">
            {apiKeyConfigured ? "OpenRouter key configured." : "OpenRouter key missing."}
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {footballFeeds.map((feed) => {
          const currentMode = normalizeMode(feed);
          const draftMode = draftByFeed[String(feed.id)] || currentMode;
          const saving = busyId === String(feed.id);

          return (
            <div
              key={String(feed.id)}
              className="rounded-[var(--r-card)] border border-[var(--c-border)] bg-[color:color-mix(in_srgb,var(--c-surface-1)_92%,transparent)] p-4"
            >
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-[var(--r-pill)] border border-[var(--c-border)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--c-text-faint)]">
                      {feed.provider?.name || "provider"}
                    </span>
                    <span className="rounded-[var(--r-pill)] border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-200">
                      Current: {modeLabel(currentMode)}
                    </span>
                  </div>
                  <h3 className="mt-3 text-lg font-semibold text-[var(--c-text)]">{feed.name}</h3>
                  <p className="mt-1 text-sm text-[var(--c-text-muted)]">
                    {feed.competition_key}
                    {feed.season_id ? ` · Season ${feed.season_id}` : ""}
                  </p>
                </div>

                <Button
                  variant="primary"
                  disabled={saving || draftMode === currentMode}
                  onClick={() => void onSave(feed, draftMode)}
                >
                  {saving ? "Saving..." : "Save Strategy"}
                </Button>
              </div>

              <div className="mt-4 grid gap-3 xl:grid-cols-3">
                {pricingModes.map((mode) => {
                  const active = draftMode === mode.id;
                  const Icon = mode.icon;

                  return (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setDraftByFeed((prev) => ({ ...prev, [String(feed.id)]: mode.id }))}
                      className={`rounded-[var(--r-card)] border p-4 text-left transition-colors ${
                        active
                          ? "border-[var(--c-accent)] bg-[var(--c-accent-soft)]"
                          : "border-[var(--c-border)] bg-[rgba(255,255,255,0.02)] hover:border-[var(--c-border-strong)]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-[var(--c-accent)]" />
                          <span className="text-sm font-semibold text-[var(--c-text)]">{mode.label}</span>
                        </div>
                        {active ? <CheckCircle2 className="h-4 w-4 text-[var(--c-success)]" /> : null}
                      </div>
                      <p className="mt-3 text-sm leading-6 text-[var(--c-text-muted)]">{mode.description}</p>
                      <p className="mt-3 text-xs leading-5 text-[var(--c-text-faint)]">{mode.impact}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function normalizeMode(feed: CompetitionFeed): PricingMode {
  const configMode = String(feed.config?.football_pricing_mode || "").trim();
  if (configMode === "provider_only" || configMode === "ai_only" || configMode === "hybrid") {
    return configMode;
  }

  if (feed.import_provider_odds && feed.generate_platform_odds) return "hybrid";
  if (feed.import_provider_odds) return "provider_only";
  return "ai_only";
}

function modeLabel(mode: PricingMode) {
  switch (mode) {
    case "provider_only":
      return "Provider";
    case "ai_only":
      return "AI Platform";
    case "hybrid":
      return "Hybrid";
  }
}
