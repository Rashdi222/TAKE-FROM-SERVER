"use client";

import { memo } from "react";
import { LoaderCircle, Lock } from "lucide-react";
import type { Odds } from "@/lib/api";
import { LiabilityBadge } from "@/components/cricket/LiabilityBadge";
import { AdminOddsControls } from "@/components/cricket/AdminOddsControls";
import { MarketSuspensionPill } from "@/components/cricket/MarketSuspensionPill";
import { OddsIntelPanel } from "@/components/cricket/OddsIntelPanel";
import { toNumber } from "@/lib/format";

export const marketOddsRowColumns =
  "grid-cols-[180px_minmax(0,1fr)_96px_176px_140px_72px_72px] xl:grid-cols-[200px_minmax(0,1fr)_104px_190px_150px_78px_78px]";

function MarketOddsRowComponent({
  matchId,
  odd,
}: {
  matchId: string;
  odd: Odds;
}) {
  const providerSnapshot = (odd.provider_snapshot as Record<string, unknown> | null) || null;
  const isAdminOverride =
    providerSnapshot?.manual_override === true ||
    String(providerSnapshot?.override_source || "") === "live_command_center";
  const isFancy = odd.market_family === "fancy_markets";
  const isFrozen = odd.is_transitioning === true || isSelfHealingState(odd.transition_state);
  const familyLabel = isFancy
    ? String(odd.window_label || odd.source_market_key || "Fancy Session")
    : humanizeLabel(String(odd.source_market_key || odd.bet_type || "Core"));
  const freezeLabel = resolveFreezeLabel(odd.transition_state);

  return (
    <div
      className={`grid ${marketOddsRowColumns} items-center gap-3 border-b border-[rgba(255,255,255,0.06)] px-3 py-1.5 text-xs last:border-b-0 ${
        isFancy ? "border-l-2 border-l-amber-500/80 bg-[rgba(238,180,58,0.04)]" : ""
      } ${isFrozen ? "bg-[rgba(166,176,194,0.04)]" : ""}`}
    >
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--c-text-faint)]">
            {familyLabel}
          </span>
          {isFancy ? (
            <span className="rounded-[var(--r-pill)] border border-[rgba(238,180,58,0.2)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-[rgb(238,180,58)]">
              Fancy
            </span>
          ) : null}
        </div>
      </div>

      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-sm font-medium text-[var(--c-text)]">
            {String(odd.outcome || odd.selection_key || "-")}
          </span>
          {isAdminOverride ? (
            <span className="rounded-[var(--r-pill)] border border-[rgba(64,179,255,0.22)] bg-[rgba(64,179,255,0.08)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-[rgb(110,196,255)]">
              Override
            </span>
          ) : null}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-[var(--c-text-faint)]">
          <span>v{Number(odd.version_no ?? 1)}</span>
          {odd.fair_projected_line ? <span>Fair {String(odd.fair_projected_line)}</span> : null}
          {odd.projected_line ? <span>Line {String(odd.projected_line)}</span> : null}
          {odd.elasticity_applied ? <span className="text-[rgb(110,196,255)]">Elastic</span> : null}
        </div>
      </div>

      <div className="text-right">
        {isFrozen ? (
          <div className="inline-flex items-center gap-1.5 text-sm font-mono font-semibold text-[rgba(195,205,220,0.58)]">
            <Lock className="h-3.5 w-3.5" />
            <span>{formatOdds(odd.odds_value)}</span>
          </div>
        ) : (
          <div className="text-sm font-mono font-semibold text-[var(--c-text)]">{formatOdds(odd.odds_value)}</div>
        )}
        {odd.final_published_probability ? (
          <div className="mt-0.5 text-[10px] text-[var(--c-text-faint)]">
            Fin {formatProbabilityAsOdds(odd.final_published_probability)}
          </div>
        ) : null}
      </div>

      <div className="min-w-0">
        <LiabilityBadge matchedVolume={odd.matched_volume} liability={odd.liability} compact />
      </div>

      <div className="min-w-0">
        <div className="flex min-h-[28px] items-center justify-start">
          {isFrozen ? (
            <span className="inline-flex items-center gap-1.5 rounded-[var(--r-pill)] border border-[rgba(180,190,210,0.18)] bg-[rgba(180,190,210,0.08)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-[rgba(210,219,232,0.86)]">
              {isSelfHealingState(odd.transition_state) ? <LoaderCircle className="h-3 w-3 animate-spin" /> : <Lock className="h-3 w-3" />}
              {freezeLabel}
            </span>
          ) : odd.is_suspended ? (
            <MarketSuspensionPill reason={odd.suspension_reason} compact />
          ) : (
            <span className="rounded-[var(--r-pill)] border border-[rgba(58,188,109,0.2)] bg-[rgba(58,188,109,0.08)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--c-success)]">
              Live
            </span>
          )}
        </div>
      </div>

      <div className="justify-self-end">
        <AdminOddsControls matchId={matchId} odd={odd} />
      </div>

      <div className="justify-self-end">
        <OddsIntelPanel odd={odd} />
      </div>
    </div>
  );
}

export const MarketOddsRow = memo(MarketOddsRowComponent, areRowsEqual);

function areRowsEqual(
  prev: Readonly<{ matchId: string; odd: Odds }>,
  next: Readonly<{ matchId: string; odd: Odds }>,
) {
  return (
    prev.matchId === next.matchId &&
    rowSignature(prev.odd) === rowSignature(next.odd)
  );
}

function rowSignature(odd: Odds) {
  return [
    odd.id,
    odd.is_transitioning ? 1 : 0,
    odd.transition_state || "",
    odd.is_suspended ? 1 : 0,
    odd.suspension_reason || "",
    odd.is_active ? 1 : 0,
    odd.odds_value ?? "",
    odd.version_no ?? "",
    odd.matched_volume ?? "",
    odd.liability ?? "",
    odd.final_published_probability ?? "",
    odd.elasticity_applied ? 1 : 0,
    odd.elasticity_reason ?? "",
    odd.volatility_mode_active ? 1 : 0,
    odd.projected_line ?? "",
    odd.fair_projected_line ?? "",
    odd.admin_note ?? "",
  ].join("|");
}

function formatOdds(value: unknown) {
  const numeric = toNumber(value);
  if (numeric === null) return String(value ?? "---");
  return numeric.toFixed(2);
}

function formatProbabilityAsOdds(probability: unknown) {
  const numeric = toNumber(probability);
  if (numeric == null || numeric <= 0) return "-";
  return (1 / numeric).toFixed(2);
}

function humanizeLabel(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function isSelfHealingState(state: string | null | undefined) {
  return state === "self_heal" || state === "retrying";
}

function resolveFreezeLabel(state: string | null | undefined) {
  switch (state) {
    case "self_heal":
      return "Self-Heal";
    case "retrying":
      return "Retrying";
    case "under_review":
      return "Review";
    case "suspended":
      return "Frozen";
    default:
      return "Frozen";
  }
}
