"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, CircleDotDashed, FlaskConical, Waves } from "lucide-react";
import { useAdminOdds, useInjectSimulationScenario } from "@/hooks/useOdds";
import type { Match, Odds } from "@/lib/api";
import { MarketOddsGroup } from "@/components/cricket/MarketOddsGroup";

type GroupedOdds = {
  key: string;
  label: string;
  family?: string | null;
  rows: Odds[];
  signature: string;
};

export function LiveMarketsPanel({ match }: { match: Match }) {
  const [open, setOpen] = useState(true);
  const [simulationOpen, setSimulationOpen] = useState(false);
  const [pendingScenario, setPendingScenario] = useState<string | null>(null);
  const [lastStableOdds, setLastStableOdds] = useState<Odds[]>([]);
  const injectScenario = useInjectSimulationScenario(String(match.id));
  const { data, isLoading } = useAdminOdds(
    String(match.id),
    {
      include_unpublished: "true",
      visibility_status: "published",
    },
    {
      refetchInterval: 5_000,
      staleTime: 2_000,
      refetchOnWindowFocus: true,
    },
  );

  const liveOdds = useMemo(() => {
    return ((((data as { data?: Odds[] } | undefined)?.data ?? []) as Odds[]) || []).filter(Boolean);
  }, [data]);

  useEffect(() => {
    if (liveOdds.length > 0) {
      const frame = window.requestAnimationFrame(() => {
        setLastStableOdds(liveOdds.map((odd) => ({ ...odd })));
      });

      return () => window.cancelAnimationFrame(frame);
    }
  }, [liveOdds]);

  useEffect(() => {
    if (!pendingScenario) return;

    if (liveOdds.length > 0 || !injectScenario.isPending) {
      const timeout = window.setTimeout(() => setPendingScenario(null), 1200);
      return () => window.clearTimeout(timeout);
    }
  }, [injectScenario.isPending, liveOdds.length, pendingScenario]);

  const transitionState = deriveTransitionState(match);
  const freezeReason = deriveFreezeReason(match);
  const effectiveTransitionState = pendingScenario ? "retrying" : transitionState;
  const effectiveFreezeReason = pendingScenario ? `simulation:${pendingScenario}` : freezeReason;
  const shouldFreezeRows = effectiveTransitionState !== null;

  const displayOdds = useMemo(() => {
    const source = liveOdds.length > 0 ? liveOdds : shouldFreezeRows ? lastStableOdds : [];

    return source.map((odd) => ({
      ...odd,
      is_transitioning: shouldFreezeRows,
      transition_state: shouldFreezeRows ? effectiveTransitionState : null,
      freeze_reason: shouldFreezeRows ? effectiveFreezeReason : null,
      is_suspended: shouldFreezeRows ? true : odd.is_suspended,
      suspension_reason: shouldFreezeRows ? effectiveFreezeReason || odd.suspension_reason || null : odd.suspension_reason,
    }));
  }, [effectiveFreezeReason, effectiveTransitionState, lastStableOdds, liveOdds, shouldFreezeRows]);

  const groups = useMemo(() => {
    const grouped = new Map<string, GroupedOdds>();

    displayOdds.forEach((odd) => {
      const family = typeof odd.market_family === "string" ? odd.market_family : null;
      const marketKey = String(odd.source_market_key || odd.bet_type || "market");
      const key = `${family || "core"}:${marketKey}`;
      const existing = grouped.get(key);

      if (existing) {
        existing.rows.push(odd);
        existing.signature = `${existing.signature}|${rowSignature(odd)}`;
        return;
      }

      grouped.set(key, {
        key,
        label: humanizeLabel(family === "fancy_markets" ? marketKey.replace(/^fancy_/, "") : marketKey),
        family,
        rows: [odd],
        signature: rowSignature(odd),
      });
    });

    return Array.from(grouped.values()).sort((a, b) => {
      if (a.family === "fancy_markets" && b.family !== "fancy_markets") return 1;
      if (a.family !== "fancy_markets" && b.family === "fancy_markets") return -1;
      return a.label.localeCompare(b.label);
    });
  }, [displayOdds]);

  if (isLoading && groups.length === 0) {
    return (
      <div className="rounded-[1rem] border border-[rgba(255,255,255,0.08)] bg-[rgba(8,11,18,0.88)] px-4 py-4">
        <p className="text-sm text-[var(--c-text-muted)]">Loading luxury table...</p>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="rounded-[1rem] border border-[rgba(255,255,255,0.08)] bg-[rgba(8,11,18,0.88)] px-4 py-4">
        <p className="text-sm text-[var(--c-text-muted)]">No live odds rows are available for this match yet.</p>
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-[1rem] border border-[rgba(255,255,255,0.08)] bg-[linear-gradient(180deg,rgba(9,12,18,0.98),rgba(9,12,18,0.9))] shadow-[0_20px_50px_rgba(0,0,0,0.28)]">
      <div className="flex items-center justify-between gap-3 border-b border-[rgba(255,255,255,0.08)] px-4 py-2.5">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--c-text-faint)]">
            Luxury Table
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[var(--c-text-muted)]">
            <span>{groups.length} markets</span>
            <span>•</span>
            <span>High-density live trading view</span>
            {shouldFreezeRows ? (
              <>
                <span>•</span>
                <span className="text-[rgba(210,219,232,0.86)]">Static Freeze Active</span>
              </>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              type="button"
              onClick={() => setSimulationOpen((current) => !current)}
              className={`inline-flex h-8 items-center gap-1.5 rounded-[0.8rem] border px-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] transition ${
                simulationOpen || pendingScenario
                  ? "border-[rgba(64,179,255,0.22)] bg-[rgba(64,179,255,0.1)] text-[rgb(110,196,255)]"
                  : "border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] text-[var(--c-text-muted)] hover:text-[var(--c-text)]"
              }`}
              title="Toggle simulation controls"
              aria-label="Toggle simulation controls"
            >
              <FlaskConical className="h-3.5 w-3.5" />
              Sim
            </button>

            {simulationOpen ? (
              <div className="absolute right-0 top-10 z-20 flex items-center gap-1.5 rounded-[0.95rem] border border-[rgba(255,255,255,0.08)] bg-[rgba(8,11,18,0.96)] p-1.5 shadow-[0_18px_44px_rgba(0,0,0,0.28)]">
                {SCENARIOS.map((scenario) => {
                  const Icon = scenario.icon;
                  const active = pendingScenario === scenario.id && injectScenario.isPending;
                  return (
                    <button
                      key={scenario.id}
                      type="button"
                      onClick={() => {
                        setPendingScenario(scenario.id);
                        injectScenario.mutate(scenario.id, {
                          onSettled: () => setSimulationOpen(false),
                          onError: () => setPendingScenario(null),
                        });
                      }}
                      disabled={injectScenario.isPending}
                      title={scenario.label}
                      aria-label={scenario.label}
                      className={`inline-flex h-8 w-8 items-center justify-center rounded-[0.7rem] border transition ${
                        active
                          ? "border-[rgba(64,179,255,0.28)] bg-[rgba(64,179,255,0.12)] text-[rgb(110,196,255)]"
                          : "border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] text-[var(--c-text-muted)] hover:text-[var(--c-text)] disabled:opacity-50"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-[0.8rem] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] text-[var(--c-text-muted)] transition hover:text-[var(--c-text)]"
            title={open ? "Collapse table" : "Expand table"}
            aria-label={open ? "Collapse table" : "Expand table"}
          >
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {open ? (
        <div className="max-h-[72vh] overflow-auto">
          {groups.map((group) => (
            <MarketOddsGroup key={group.key} matchId={String(match.id)} group={group} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function humanizeLabel(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function rowSignature(odd: Odds) {
  return [
    odd.id,
    odd.is_transitioning ? 1 : 0,
    odd.transition_state || "",
    odd.is_suspended ? 1 : 0,
    odd.suspension_reason || "",
    odd.odds_value ?? "",
    odd.version_no ?? "",
  ].join("|");
}

function deriveTransitionState(match: Match): string | null {
  const marketState =
    match.market_state && typeof match.market_state === "object"
      ? (match.market_state as Record<string, unknown>)
      : {};
  const reviewerDecision = String(marketState.reviewer_decision || "");
  const reason = String(match.suspension_reason || marketState.suspension_reason || "");

  if (reviewerDecision === "reject_and_retry") return "self_heal";
  if (reason === "ai_engine_unavailable") return "self_heal";
  if (reason === "simulation_injection") return "retrying";
  if (reason === "manual_admin_review" || marketState.manual_admin_review === true) return "under_review";
  if (reason || marketState.suspended === true) return "suspended";
  return null;
}

function deriveFreezeReason(match: Match): string | null {
  const marketState =
    match.market_state && typeof match.market_state === "object"
      ? (match.market_state as Record<string, unknown>)
      : {};
  return String(match.suspension_reason || marketState.suspension_reason || "") || null;
}

const SCENARIOS = [
  { id: "desperate_chase", label: "Inject desperate chase", icon: AlertTriangle },
  { id: "early_wicket", label: "Inject early wicket", icon: CircleDotDashed },
  { id: "dot_ball_pressure", label: "Inject dot-ball pressure", icon: Waves },
] as const;
