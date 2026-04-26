"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo } from "react";
import { Card } from "@/components/ui/Card";
import { Tag } from "@/components/ui/Tag";
import { Button } from "@/components/ui/Button";
import { useAdminOdds } from "@/hooks/useOdds";
import { FootballMatchActionBar } from "@/components/football/FootballMatchActionBar";
import { FootballMatchOddsPanel } from "@/components/football/FootballMatchOddsPanel";
import type { Match, SportMarketConfig } from "@/lib/api";

export function FootballMatchOpsCard({
  match,
  marketConfigs,
  oddsMode = "all",
  showOddsPanel = false,
  selected = false,
  onOpenPanel,
  automation,
}: {
  match: Match;
  marketConfigs: SportMarketConfig[];
  oddsMode?: "draft" | "published" | "live" | "all";
  showOddsPanel?: boolean;
  selected?: boolean;
  onOpenPanel?: (match: Match) => void;
  automation?: {
    prematch?: { status?: string | null; inserted_at?: string | null; reason?: string | null } | null;
    inplay?: { status?: string | null; inserted_at?: string | null; reason?: string | null } | null;
  };
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

  const suspensionReason = String(match.suspension_reason || "").trim();
  const liveMicroState =
    match.status === "live"
      ? `${num(match.home_score)}-${num(match.away_score)} · ${minuteLabel(match)} · RC ${num(match.home_red_cards)}-${num(match.away_red_cards)}`
      : null;

  return (
    <Card
      variant="surface-2"
      className={`p-5 transition-colors ${selected ? "border-[var(--c-accent)] shadow-[var(--shadow-2)]" : ""}`}
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Tag status={match.status || "upcoming"} />
              <span className="text-xs uppercase tracking-[0.16em] text-[var(--c-text-faint)]">
                {competitionName || "Football"}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <TeamBadge name={match.team1} logo={match.team1_logo as string | undefined} />
              <span className="text-sm uppercase tracking-[0.2em] text-[var(--c-text-faint)]">vs</span>
              <TeamBadge name={match.team2} logo={match.team2_logo as string | undefined} />
            </div>
            {suspensionReason ? (
              <div className="mt-3 inline-flex rounded-[var(--r-pill)] border border-amber-500/30 bg-amber-500/12 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-amber-200">
                {formatSuspensionReason(suspensionReason)}
              </div>
            ) : null}
            {liveMicroState ? (
              <p className="mt-2 text-xs font-medium uppercase tracking-[0.14em] text-[var(--c-accent)]">
                {liveMicroState}
              </p>
            ) : null}
            <p className="mt-2 text-sm text-[var(--c-text-muted)]">
              {match.start_time ? new Date(match.start_time).toLocaleString() : "No kickoff time"}
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
          <FootballMatchActionBar matchId={String(match.id)} sport="football" marketConfigs={marketConfigs} />
          {onOpenPanel ? (
            <Button variant={selected ? "primary" : "secondary"} onClick={() => onOpenPanel(match)}>
              {selected ? "Panel Open" : "Open Panel"}
            </Button>
          ) : null}
          <Link href={`/admin/matches/${match.id}`}>
            <Button variant="secondary">Match Detail</Button>
          </Link>
        </div>

        <p className="text-xs leading-5 text-[var(--c-text-faint)]">
          Use this board for fixture import, live refresh, AI draft generation, rewrite, provider-reference review, and publish control.
        </p>

        {(automation?.prematch || automation?.inplay) ? (
          <div className="grid gap-3 md:grid-cols-2">
            <AutomationStatusCard label="Prematch Automation" run={automation?.prematch} />
            <AutomationStatusCard label="In-Play Automation" run={automation?.inplay} />
          </div>
        ) : null}

        {showOddsPanel ? <FootballMatchOddsPanel matchId={String(match.id)} mode={oddsMode} /> : null}
      </div>
    </Card>
  );
}

function minuteLabel(match: Match) {
  const elapsed = num(match.elapsed_minute);
  const stoppage = num(match.stoppage_minute);
  if (elapsed <= 0) return "0'";
  return stoppage > 0 ? `${elapsed}+${stoppage}'` : `${elapsed}'`;
}

function num(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function formatSuspensionReason(reason: string) {
  switch (reason) {
    case "provider_disconnect":
      return "Provider Disconnect";
    case "provider_import_failure":
      return "Import Failure";
    case "manual_admin_review":
      return "Manual Review";
    case "var_review":
      return "VAR Review";
    case "goal_scored":
      return "Goal Scored";
    case "red_card":
      return "Red Card";
    default:
      return reason.replaceAll("_", " ");
  }
}

function AutomationStatusCard({
  label,
  run,
}: {
  label: string;
  run?: { status?: string | null; inserted_at?: string | null; reason?: string | null } | null;
}) {
  const status = run?.status || "idle";

  return (
    <div className="rounded-[var(--r-md)] border border-[var(--c-border)] bg-[rgba(255,255,255,0.02)] p-3">
      <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--c-text-faint)]">{label}</p>
      <p className="mt-2 text-sm font-medium capitalize text-[var(--c-text)]">{status.replaceAll("_", " ")}</p>
      <p className="mt-1 text-xs text-[var(--c-text-faint)]">
        {run?.inserted_at ? new Date(run.inserted_at).toLocaleString() : "No runs yet"}
      </p>
      {run?.reason ? <p className="mt-2 text-xs text-[var(--c-text-muted)]">{run.reason}</p> : null}
    </div>
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
