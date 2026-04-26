"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Tag } from "@/components/ui/Tag";
import { FootballMatchActionBar } from "@/components/football/FootballMatchActionBar";
import { FootballLiveMarketControlPanel } from "@/components/football/FootballLiveMarketControlPanel";
import { FootballMatchOddsPanel } from "@/components/football/FootballMatchOddsPanel";
import { FootballProviderReferencePanel } from "@/components/football/FootballProviderReferencePanel";
import { formatDateTime } from "@/lib/format";
import type { Match, SportMarketConfig } from "@/lib/api";

const tabs = [
  { id: "live", label: "Live Board" },
  { id: "draft", label: "Drafts" },
  { id: "published", label: "Published" },
  { id: "all", label: "All Odds" },
] as const;

export function FootballMatchWorkspacePanel({
  match,
  marketConfigs,
  onClose,
  automation,
}: {
  match: Match;
  marketConfigs: SportMarketConfig[];
  onClose?: () => void;
  automation?: {
    prematch?: { status?: string | null; inserted_at?: string | null; reason?: string | null } | null;
    inplay?: { status?: string | null; inserted_at?: string | null; reason?: string | null } | null;
  };
}) {
  const [tab, setTab] = useState<(typeof tabs)[number]["id"]>(match.status === "live" ? "live" : "draft");

  const competitionName =
    (match.competition?.name as string | undefined) ||
    (match.season_name as string | undefined) ||
    ((match.raw_data as { _competition_feed?: { name?: string } } | undefined)?._competition_feed?.name ??
      undefined);

  const scoreLine = useMemo(() => {
    const score = match.score as
      | { score?: string; goals?: { home?: number | string; away?: number | string } }
      | undefined;

    if (typeof score?.score === "string" && score.score.trim() !== "") return score.score;

    const home = score?.goals?.home;
    const away = score?.goals?.away;
    if (home !== undefined || away !== undefined) return `${home ?? 0} - ${away ?? 0}`;
    return null;
  }, [match.score]);

  const liveContext = useMemo(() => {
    const raw = (match.raw_data as {
      fixture?: { status?: { elapsed?: number | string; short?: string; long?: string } };
      league?: { round?: string };
      venue_name?: string;
    } | undefined) ?? {};

    const elapsed = raw.fixture?.status?.elapsed;
    const short = raw.fixture?.status?.short;
    const long = raw.fixture?.status?.long;

    return {
      elapsed: elapsed ? `${elapsed}'` : null,
      short: short || null,
      long: long || null,
    };
  }, [match.raw_data]);

  const deepContext = useMemo(
    () => ({
      redCards: `${intVal(match.home_red_cards)}-${intVal(match.away_red_cards)}`,
      corners: `${intVal(match.home_corners)}-${intVal(match.away_corners)}`,
      shotsOnTarget: `${intVal(match.home_shots_on_target)}-${intVal(match.away_shots_on_target)}`,
      stoppage:
        intVal(match.stoppage_minute) > 0
          ? `+${intVal(match.stoppage_minute)}`
          : "-",
      tempo: decimalLabel(match.tempo_index),
    }),
    [
      match.away_corners,
      match.away_red_cards,
      match.away_shots_on_target,
      match.home_corners,
      match.home_red_cards,
      match.home_shots_on_target,
      match.stoppage_minute,
      match.tempo_index,
    ],
  );

  const healthMessage = useMemo(() => {
    const reason = String(match.suspension_reason || "").trim();
    if (!reason) return null;

    switch (reason) {
      case "provider_disconnect":
        return "Provider feed is disconnected. Keep the football board suspended until a clean refresh and reprice complete."
      case "manual_admin_review":
        return "The football board is locked for manual operator review after a risky state or price change."
      case "var_review":
        return "VAR review is in progress. Pause sensitive in-play markets until the decision is confirmed."
      case "goal_scored":
        return "A goal event just changed the match state. Reprice and reopen only once the board is coherent."
      case "provider_import_failure":
        return "The provider import path failed for this football match. Force a reprice only after verifying the live feed recovered."
      default:
        return `Current suspension reason: ${reason.replaceAll("_", " ")}.`
    }
  }, [match.suspension_reason]);

  const varianceAlerts = useMemo(() => {
    const alerts = (match.market_state as { variance_alerts?: unknown } | undefined)?.variance_alerts;
    return Array.isArray(alerts)
      ? (alerts as Array<{
          market_key?: string;
          selection_key?: string;
          engine_price?: string | number;
          provider_price?: string | number;
          probability_delta?: number;
        }>)
      : [];
  }, [match.market_state]);

  return (
    <Card variant="surface-2" className="flex flex-col overflow-hidden xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)]">
      <div className="border-b border-[var(--c-border)] px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Tag status={match.status || "upcoming"} />
              <span className="text-xs uppercase tracking-[0.16em] text-[var(--c-text-faint)]">
                {competitionName || "Football"}
              </span>
            </div>
            <h2 className="mt-3 text-2xl font-semibold text-[var(--c-text)]">
              {match.team1} vs {match.team2}
            </h2>
            <p className="mt-2 text-sm text-[var(--c-text-muted)]">{formatDateTime(match.start_time ?? null)}</p>
            {(match.round_name || match.venue_name) ? (
              <p className="mt-1 text-xs text-[var(--c-text-faint)]">
                {[match.round_name, match.venue_name].filter(Boolean).join(" · ")}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col items-end gap-2">
            {scoreLine ? (
              <div className="rounded-[var(--r-pill)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-3 py-1 text-sm font-semibold text-[var(--c-text)]">
                {scoreLine}
              </div>
            ) : null}
            {onClose ? (
              <Button variant="ghost" onClick={onClose}>Close</Button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="overflow-y-auto p-5">
        <div className="space-y-5">
          <div className="rounded-[var(--r-card)] border border-[var(--c-border)] bg-[color:color-mix(in_srgb,var(--c-surface-1)_88%,transparent)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--c-text-faint)]">
                  Trading Controls
                </h3>
                <p className="mt-2 text-sm leading-6 text-[var(--c-text-muted)]">
                  Generate platform odds, run orchestration, or rewrite the current draft with your own note. For live matches, keep the board open and work from the live tab below.
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <FootballMatchActionBar
                matchId={String(match.id)}
                sport="football"
                marketConfigs={marketConfigs}
              />
              <Link href={`/admin/matches/${match.id}/odds`}>
                <Button variant="secondary">Full Odds Workspace</Button>
              </Link>
            </div>
          </div>

          {match.status === "live" ? (
            <div className="rounded-[var(--r-card)] border border-[var(--c-border)] bg-[color:color-mix(in_srgb,var(--c-surface-1)_88%,transparent)] p-4">
              <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--c-text-faint)]">
                Live Match Context
              </h3>
              <div className="mt-4 flex flex-wrap gap-2">
                {liveContext.elapsed ? (
                  <span className="rounded-[var(--r-pill)] border border-[var(--c-border)] px-3 py-2 text-sm text-[var(--c-text)]">
                    Minute {liveContext.elapsed}
                  </span>
                ) : null}
                {liveContext.short ? (
                  <span className="rounded-[var(--r-pill)] border border-[var(--c-border)] px-3 py-2 text-sm text-[var(--c-text)]">
                    {liveContext.short}
                  </span>
                ) : null}
                {liveContext.long ? (
                  <span className="rounded-[var(--r-pill)] border border-[var(--c-border)] px-3 py-2 text-sm text-[var(--c-text)]">
                    {liveContext.long}
                  </span>
                ) : null}
                {match.venue_name ? (
                  <span className="rounded-[var(--r-pill)] border border-[var(--c-border)] px-3 py-2 text-sm text-[var(--c-text)]">
                    {match.venue_name}
                  </span>
                ) : null}
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <ContextPill label="Red Cards" value={deepContext.redCards} />
                <ContextPill label="Corners" value={deepContext.corners} />
                <ContextPill label="Shots On Target" value={deepContext.shotsOnTarget} />
                <ContextPill label="Stoppage" value={deepContext.stoppage} />
                <ContextPill label="Tempo" value={deepContext.tempo} />
              </div>
              <p className="mt-4 text-sm leading-6 text-[var(--c-text-muted)]">
                Keep this panel open during live trading. Generate a fresh in-play draft, rewrite with a tighter instruction if the current board looks too loose, then approve only the lines you actually want visible.
              </p>
            </div>
          ) : null}

          {match.status === "live" && healthMessage ? (
            <div className="rounded-[var(--r-card)] border border-amber-500/25 bg-amber-500/10 p-4">
              <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-200">
                Live Health Status
              </h3>
              <p className="mt-3 text-sm leading-6 text-amber-100">{healthMessage}</p>
            </div>
          ) : null}

          {varianceAlerts.length > 0 ? (
            <div className="rounded-[var(--r-card)] border border-red-500/20 bg-red-500/10 p-4">
              <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-red-200">
                Variance Alerts
              </h3>
              <p className="mt-3 text-sm leading-6 text-red-100">
                The current platform board is materially diverging from provider reference pricing. Review these lines before
                leaving the football market open unattended.
              </p>
              <div className="mt-4 space-y-2">
                {varianceAlerts.slice(0, 4).map((alert, index) => (
                  <div
                    key={`${alert.market_key || "market"}-${alert.selection_key || index}`}
                    className="grid gap-2 rounded-[var(--r-md)] border border-red-500/20 bg-[rgba(255,255,255,0.03)] p-3 text-sm text-red-50 md:grid-cols-[minmax(0,1fr)_6rem_6rem_5rem]"
                  >
                    <div>
                      <p className="font-medium text-[var(--c-text)]">
                        {[alert.market_key, alert.selection_key].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.14em] text-red-200/80">Provider</p>
                      <p className="mt-1 font-semibold">{alert.provider_price ?? "-"}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.14em] text-red-200/80">Platform</p>
                      <p className="mt-1 font-semibold">{alert.engine_price ?? "-"}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.14em] text-red-200/80">Delta</p>
                      <p className="mt-1 font-semibold">
                        {typeof alert.probability_delta === "number" ? `${(alert.probability_delta * 100).toFixed(1)}%` : "-"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {match.status === "live" ? <FootballLiveMarketControlPanel match={match} /> : null}

          <div className="rounded-[var(--r-card)] border border-[var(--c-border)] bg-[color:color-mix(in_srgb,var(--c-surface-1)_88%,transparent)] p-4">
            <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--c-text-faint)]">
              AI Instructions
            </h3>
            <div className="mt-3 space-y-2 text-sm leading-6 text-[var(--c-text-muted)]">
              <p>
                `Generate Odds` lets you choose market scope and run a direct generation pass.
              </p>
              <p>
                `Orchestrate` accepts an admin note, so you can guide the AI with instructions like: tighten goal lines, keep pricing conservative, or reduce payout risk.
              </p>
              <p>
                `Rewrite` lets you rework the current draft using your comment about how the odds should move.
              </p>
            </div>
          </div>

          {(automation?.prematch || automation?.inplay) ? (
            <div className="grid gap-3 md:grid-cols-2">
              <AutomationPanelCard label="Prematch Automation" run={automation?.prematch} />
              <AutomationPanelCard label="In-Play Automation" run={automation?.inplay} />
            </div>
          ) : null}

          <FootballProviderReferencePanel matchId={String(match.id)} />

          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {tabs.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`rounded-[var(--r-pill)] border px-3 py-2 text-sm ${
                    tab === item.id
                      ? "border-[var(--c-accent)] bg-[var(--c-accent-soft)] text-[var(--c-text)]"
                      : "border-[var(--c-border)] text-[var(--c-text-muted)]"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <FootballMatchOddsPanel matchId={String(match.id)} mode={tab} />
          </div>
        </div>
      </div>
    </Card>
  );
}

function ContextPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--r-md)] border border-[var(--c-border)] bg-[rgba(255,255,255,0.03)] px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--c-text-faint)]">{label}</p>
      <p className="mt-1 text-sm font-semibold text-[var(--c-text)]">{value}</p>
    </div>
  );
}

function intVal(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function decimalLabel(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value.toFixed(2);
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed.toFixed(2) : "-";
  }
  return "-";
}

function AutomationPanelCard({
  label,
  run,
}: {
  label: string;
  run?: { status?: string | null; inserted_at?: string | null; reason?: string | null } | null;
}) {
  const status = run?.status || "idle";

  return (
    <div className="rounded-[var(--r-card)] border border-[var(--c-border)] bg-[color:color-mix(in_srgb,var(--c-surface-1)_88%,transparent)] p-4">
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--c-text-faint)]">{label}</p>
      <p className="mt-3 text-base font-semibold capitalize text-[var(--c-text)]">{status.replaceAll("_", " ")}</p>
      <p className="mt-1 text-xs text-[var(--c-text-faint)]">
        {run?.inserted_at ? formatDateTime(run.inserted_at) : "No automation run yet"}
      </p>
      {run?.reason ? <p className="mt-3 text-sm leading-6 text-[var(--c-text-muted)]">{run.reason}</p> : null}
    </div>
  );
}
