"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo } from "react";
import { Card } from "@/components/ui/Card";
import { Tag } from "@/components/ui/Tag";
import { Button } from "@/components/ui/Button";
import type { CricketAutomationRun, Match, SportMarketConfig } from "@/lib/api";
import { CricketMatchActionBar } from "@/components/cricket/CricketMatchActionBar";
import { CricketMatchOddsPanel } from "@/components/cricket/CricketMatchOddsPanel";
import { LiveMarketsPanel } from "@/components/cricket/LiveMarketsPanel";
import { useAdminOdds } from "@/hooks/useOdds";

export function CricketMatchOpsCard({
  match,
  marketConfigs,
  automationRuns,
  oddsMode = "all",
  showOddsPanel = false,
}: {
  match: Match;
  marketConfigs: SportMarketConfig[];
  automationRuns?: {
    prematch?: CricketAutomationRun;
    inplay?: CricketAutomationRun;
  };
  oddsMode?: "draft" | "published" | "live" | "all";
  showOddsPanel?: boolean;
}) {
  const oddsFilters =
    oddsMode === "draft"
      ? { include_unpublished: "true" as const, visibility_status: "draft" as const }
      : oddsMode === "published"
      ? { include_unpublished: "true" as const, visibility_status: "published" as const }
      : { include_unpublished: "true" as const };

  const { data: oddsData } = useAdminOdds(String(match.id), oddsFilters);
  const oddsCount = useMemo(
    () => (((oddsData as { data?: unknown[] } | undefined)?.data ?? []) as unknown[]).length,
    [oddsData],
  );

  if ((oddsMode === "draft" || oddsMode === "published") && oddsCount === 0) {
    return null;
  }

  const competitionName =
    (match.competition?.name as string | undefined) ||
    (match.season_name as string | undefined) ||
    ((match.raw_data as { _competition_feed?: { name?: string } } | undefined)?._competition_feed?.name ??
      undefined);

  return (
    <Card variant="surface-2" className="p-5">
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Tag status={match.status || "upcoming"} />
              <span className="text-xs uppercase tracking-[0.16em] text-[var(--c-text-faint)]">
                {competitionName || match.provider || "Cricket"}
              </span>
              {match.suspended_at ? (
                <span className="rounded-full border border-[rgba(255,60,60,0.22)] bg-[rgba(255,60,60,0.12)] px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--c-danger)]">
                  Suspended{match.suspension_reason ? ` · ${match.suspension_reason}` : ""}
                </span>
              ) : null}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <TeamBadge name={match.team1} logo={match.team1_logo as string | undefined} />
              <span className="text-sm uppercase tracking-[0.2em] text-[var(--c-text-faint)]">vs</span>
              <TeamBadge name={match.team2} logo={match.team2_logo as string | undefined} />
            </div>
            <p className="mt-2 text-sm text-[var(--c-text-muted)]">
              {match.start_time ? new Date(match.start_time).toLocaleString() : "No start time"}
            </p>
            {(match.round_name || match.venue_name) ? (
              <p className="mt-1 text-xs text-[var(--c-text-faint)]">
                {[match.round_name, match.venue_name].filter(Boolean).join(" · ")}
              </p>
            ) : null}
          </div>

          <div className="rounded-[var(--r-md)] border border-[var(--c-border)] bg-[rgba(255,255,255,0.02)] px-3 py-2 text-right">
            <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--c-text-faint)]">Match State</p>
            <p className="mt-1 text-sm text-[var(--c-text)]">
              {match.status === "live"
                ? "In-play"
                : match.status === "upcoming"
                ? "Pre-match"
                : match.status}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <CricketMatchActionBar
            matchId={String(match.id)}
            sport="cricket"
            marketConfigs={marketConfigs}
          />
          <Link href={`/admin/matches/${match.id}`}>
            <Button variant="secondary">Match Detail</Button>
          </Link>
        </div>

        <p className="text-xs leading-5 text-[var(--c-text-faint)]">
          AI generation uses the stored match context, status, and cricket market rules already configured in the platform. Use the Odds Desk when you need rewrite, publish, unpublish, or manual adjustment.
        </p>

        <div className="grid gap-3 md:grid-cols-2">
          <AutomationStatusCard label="Prematch Automation" run={automationRuns?.prematch} />
          <AutomationStatusCard label="In-Play Automation" run={automationRuns?.inplay} />
        </div>

        {showOddsPanel ? (
          oddsMode === "live" ? (
            <LiveMarketsPanel match={match} />
          ) : (
            <CricketMatchOddsPanel matchId={String(match.id)} mode={oddsMode} />
          )
        ) : null}
      </div>
    </Card>
  );
}

function TeamBadge({ name, logo }: { name?: string | null; logo?: string }) {
  const label = name || "Unknown Team";
  const initials =
    label
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || "")
      .join("") || "?";

  return (
    <div className="flex items-center gap-3">
      {logo ? (
        <Image
          src={logo}
          alt={label}
          width={40}
          height={40}
          className="h-10 w-10 rounded-full border border-[var(--c-border)] bg-[var(--c-surface-1)] object-cover"
        />
      ) : (
        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--c-border)] bg-[var(--c-surface-1)] text-xs font-semibold text-[var(--c-text)]">
          {initials}
        </div>
      )}
      <div className="text-xl font-semibold text-[var(--c-text)]">{label}</div>
    </div>
  );
}

function AutomationStatusCard({
  label,
  run,
}: {
  label: string;
  run?: CricketAutomationRun;
}) {
  return (
    <div className="rounded-[var(--r-card)] border border-[var(--c-border)] bg-[color:color-mix(in_srgb,var(--c-surface-1)_88%,transparent)] p-3">
      <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--c-text-faint)]">{label}</p>
      <p className="mt-2 text-sm font-medium text-[var(--c-text)]">
        {run ? humanizeStatus(run.status) : "Not run yet"}
      </p>
      <p className="mt-1 text-xs text-[var(--c-text-faint)]">
        {run?.inserted_at ? new Date(run.inserted_at).toLocaleString() : "No automation recorded"}
      </p>
      {run?.reason ? (
        <p className="mt-2 text-xs leading-5 text-[var(--c-text-muted)]">Reason: {run.reason}</p>
      ) : null}
    </div>
  );
}

function humanizeStatus(value: string) {
  if (value === "success") return "Draft generated";
  if (value === "failure") return "Generation failed";
  if (value === "skipped") return "Skipped";
  return value;
}
