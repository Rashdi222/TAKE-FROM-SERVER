"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BrainCircuit } from "lucide-react";
import type { Odds } from "@/lib/api";
import { formatDecimal, toNumber } from "@/lib/format";

export function OddsIntelPanel({ odd }: { odd: Odds }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const intel = useMemo(() => readIntel(odd), [odd]);

  useEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const desiredWidth = Math.min(352, window.innerWidth - 24);
      const left = Math.min(
        Math.max(12, rect.right - desiredWidth),
        Math.max(12, window.innerWidth - desiredWidth - 12),
      );
      const top = Math.min(rect.bottom + 10, window.innerHeight - 16);
      setPosition({ top, left, width: desiredWidth });
    };

    const handlePointerDown = (event: MouseEvent) => {
      const trigger = triggerRef.current;
      if (trigger && event.target instanceof Node && trigger.contains(event.target)) return;
      setOpen(false);
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [open]);

  if (!intel.hasIntel) return null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        title="Quant Intel"
        aria-label="Open quant intel"
        className="inline-flex h-7 w-7 items-center justify-center rounded-[0.7rem] border border-[rgba(96,165,250,0.22)] bg-[rgba(96,165,250,0.08)] text-[rgb(125,186,255)] transition hover:bg-[rgba(96,165,250,0.14)]"
      >
        <BrainCircuit className="h-3.5 w-3.5" />
      </button>

      {open && position ? (
        <div
          className="fixed z-[140] rounded-[1rem] border border-[rgba(96,165,250,0.18)] bg-[rgba(9,12,18,0.96)] p-3 shadow-[0_24px_90px_rgba(0,0,0,0.42)] backdrop-blur"
          style={{
            top: `${position.top}px`,
            left: `${position.left}px`,
            width: `${position.width}px`,
            maxHeight: "min(28rem, calc(100vh - 2rem))",
            overflowY: "auto",
          }}
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--c-text-faint)]">AI Thoughts</p>
              <p className="mt-1 text-sm font-semibold text-[var(--c-text)]">{intel.title}</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs text-[var(--c-text-faint)] transition hover:text-[var(--c-text)]"
            >
              Close
            </button>
          </div>

          {intel.type === "core" ? (
            <div className="grid gap-2 sm:grid-cols-3">
              <IntelStat label="Fair Odds" value={intel.fairOddsLabel} sublabel={intel.fairProbabilityLabel} />
              <IntelStat
                label="Bookmaker Display"
                value={intel.bookmakerDisplayOddsLabel}
                sublabel={intel.bookmakerDisplayProbabilityLabel}
              />
              <IntelStat
                label="Final Published Odds"
                value={intel.finalPublishedOddsLabel}
                sublabel={intel.finalPublishedProbabilityLabel}
              />
              {intel.referenceSourceLabel ? (
                <IntelStat
                  label={`${intel.referenceSourceLabel} Reference`}
                  value={intel.referenceOddsLabel || "-"}
                  sublabel={
                    intel.referenceProbabilityLabel === "-" && !intel.referenceDeltaLabel
                      ? undefined
                      : `${intel.referenceProbabilityLabel}${intel.referenceDeltaLabel ? ` · drift ${intel.referenceDeltaLabel}` : ""}`
                  }
                />
              ) : null}
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-3">
              <IntelStat label="Fair Line" value={intel.fairLineLabel} />
              <IntelStat label="Bookmaker Display" value={intel.displayLineLabel} />
              <IntelStat label="Final Published Line" value={intel.finalLineLabel} />
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-[var(--r-pill)] border border-[rgba(255,255,255,0.1)] px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-[var(--c-text-faint)]">
              Skew {intel.skewLabel}
            </span>
            {intel.type === "core" && intel.volatilityModeActive ? (
              <span className="rounded-[var(--r-pill)] border border-[rgba(238,180,58,0.18)] bg-[rgba(238,180,58,0.1)] px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-[rgb(238,180,58)]">
                Volatility Mode
              </span>
            ) : null}
            {intel.type === "core" && intel.elasticityApplied ? (
              <span className="rounded-[var(--r-pill)] border border-[rgba(64,179,255,0.2)] bg-[rgba(64,179,255,0.1)] px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-[rgb(110,196,255)]">
                Elastic Reviewer
              </span>
            ) : null}
            {intel.healthLabel ? (
              <span className="rounded-[var(--r-pill)] border border-[rgba(58,188,109,0.18)] bg-[rgba(58,188,109,0.08)] px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-[var(--c-success)]">
                Bias {intel.healthLabel}
              </span>
            ) : null}
          </div>

          {intel.type === "core" && intel.elasticityReason ? (
            <div className="mt-3 rounded-[0.9rem] border border-[rgba(64,179,255,0.16)] bg-[rgba(64,179,255,0.06)] px-3 py-2">
              <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--c-text-faint)]">Elasticity Reason</p>
              <p className="mt-1 text-xs text-[var(--c-text)]">{intel.elasticityReason}</p>
            </div>
          ) : null}

          {intel.playbooks.length > 0 ? (
            <div className="mt-3">
              <p className="mb-2 text-[11px] uppercase tracking-[0.16em] text-[var(--c-text-faint)]">Active Playbooks</p>
              <div className="flex flex-wrap gap-2">
                {intel.playbooks.map((playbook) => (
                  <span
                    key={playbook}
                    className="rounded-[var(--r-pill)] border border-[rgba(238,180,58,0.18)] bg-[rgba(238,180,58,0.1)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[rgb(238,180,58)]"
                  >
                    {humanize(playbook)}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function IntelStat({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: string;
  sublabel?: string;
}) {
  return (
    <div className="rounded-[0.9rem] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-3 py-2">
      <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--c-text-faint)]">{label}</p>
      <p className="mt-1 text-sm font-semibold text-[var(--c-text)]">{value}</p>
      {sublabel ? <p className="mt-1 text-[11px] text-[var(--c-text-muted)]">{sublabel}</p> : null}
    </div>
  );
}

type CoreIntel = {
  hasIntel: true;
  type: "core";
  title: string;
  fairOddsLabel: string;
  bookmakerDisplayOddsLabel: string;
  finalPublishedOddsLabel: string;
  fairProbabilityLabel: string;
  bookmakerDisplayProbabilityLabel: string;
  finalPublishedProbabilityLabel: string;
  skewLabel: string;
  healthLabel: string | null;
  playbooks: string[];
  volatilityModeActive: boolean;
  elasticityApplied: boolean;
  elasticityReason: string | null;
  referenceSourceLabel: string | null;
  referenceOddsLabel: string | null;
  referenceProbabilityLabel: string | null;
  referenceDeltaLabel: string | null;
};

type FancyIntel = {
  hasIntel: true;
  type: "fancy";
  title: string;
  fairLineLabel: string;
  displayLineLabel: string;
  finalLineLabel: string;
  skewLabel: string;
  healthLabel: string | null;
  playbooks: string[];
};

type NoIntel = { hasIntel: false };

function readIntel(odd: Odds): CoreIntel | FancyIntel | NoIntel {
  const snapshot = (odd.provider_snapshot as Record<string, unknown> | null) || {};
  const traceMeta = ((snapshot.trace_meta as Record<string, unknown> | null) || {}) as Record<string, unknown>;
  const isFancy = odd.market_family === "fancy_markets";

  if (isFancy) {
    const fairLine = odd.fair_projected_line ?? traceMeta.fair_projected_line;
    const displayLine =
      traceMeta.trap_projected_line ?? traceMeta.raw_trap_projected_line ?? snapshot.trap_projected_line;
    const finalLine = odd.projected_line ?? snapshot.projected_line ?? traceMeta.projected_line ?? displayLine;
    const playbooks = toStringArray(traceMeta.active_fancy_playbooks);
    const skew = toNumber(traceMeta.raw_trap_line_delta ?? traceMeta.trap_line_delta);
    const latency = toNumber(odd.bookmaker_node_latency_ms ?? snapshot.bookmaker_node_latency_ms);

    if (fairLine == null && displayLine == null && finalLine == null && playbooks.length === 0 && skew == null) {
      return { hasIntel: false };
    }

    return {
      hasIntel: true,
      type: "fancy",
      title: String(odd.window_label || odd.source_market_key || "Fancy Market"),
      fairLineLabel: String(fairLine ?? "-"),
      displayLineLabel: String(displayLine ?? "-"),
      finalLineLabel: String(finalLine ?? "-"),
      skewLabel: skew == null ? "-" : `${skew >= 0 ? "+" : ""}${formatDecimal(skew)}`,
      healthLabel: latency == null ? null : `${Math.round(latency)}ms`,
      playbooks,
    };
  }

  const fairProbability = toNumber(odd.fair_probability ?? snapshot.fair_probability ?? traceMeta.fair_probability);
  const displayProbability = toNumber(
    odd.display_probability ?? snapshot.display_probability ?? traceMeta.display_probability,
  );
  const finalPublishedProbability = toNumber(
    odd.final_published_probability ?? snapshot.approved_probability ?? traceMeta.approved_probability,
  );
  const skew = toNumber(odd.shading_magnitude ?? snapshot.shading_magnitude ?? traceMeta.shading_magnitude);
  const playbooks = toStringArray(odd.active_playbooks ?? snapshot.active_playbooks ?? traceMeta.active_playbooks);
  const latency = toNumber(
    odd.bookmaker_node_latency_ms ?? snapshot.bookmaker_node_latency_ms ?? traceMeta.bookmaker_node_latency_ms,
  );
  const volatilityModeActive = Boolean(odd.volatility_mode_active ?? snapshot.volatility_mode_active);
  const elasticityApplied = Boolean(odd.elasticity_applied ?? snapshot.elasticity_applied);
  const elasticityReason = toNullableString(odd.elasticity_reason ?? snapshot.elasticity_reason);
  const referenceSource = toNullableString((odd as Odds & { reference_source?: unknown }).reference_source ?? snapshot.reference_source);
  const referenceProbability = toNumber(
    (odd as Odds & { reference_probability?: unknown }).reference_probability ?? snapshot.reference_probability,
  );
  const referenceDelta = toNumber(
    (odd as Odds & { reference_probability_delta?: unknown }).reference_probability_delta ??
      snapshot.reference_probability_delta,
  );
  const referenceOdds = toNullableString((odd as Odds & { reference_price?: unknown }).reference_price) ?? formatOddsValue(snapshot.reference_price);

  if (
    fairProbability == null &&
    displayProbability == null &&
    finalPublishedProbability == null &&
    playbooks.length === 0 &&
    skew == null &&
    !volatilityModeActive &&
    !elasticityApplied &&
    !elasticityReason &&
    !referenceSource &&
    referenceProbability == null &&
    referenceDelta == null
  ) {
    return { hasIntel: false };
  }

  return {
    hasIntel: true,
    type: "core",
    title: String(odd.source_market_key || odd.bet_type || "Core Market"),
    fairOddsLabel: formatProbabilityAsOdds(fairProbability),
    bookmakerDisplayOddsLabel: formatProbabilityAsOdds(displayProbability),
    finalPublishedOddsLabel:
      finalPublishedProbability == null ? formatOddsValue(odd.odds_value) : formatProbabilityAsOdds(finalPublishedProbability),
    fairProbabilityLabel: formatProbabilityLabel(fairProbability),
    bookmakerDisplayProbabilityLabel: formatProbabilityLabel(displayProbability),
    finalPublishedProbabilityLabel:
      finalPublishedProbability == null ? "Published row price" : formatProbabilityLabel(finalPublishedProbability),
    skewLabel: skew == null ? "-" : `${(skew * 100).toFixed(2)}%`,
    healthLabel: latency == null ? null : `${Math.round(latency)}ms`,
    playbooks,
    volatilityModeActive,
    elasticityApplied,
    elasticityReason,
    referenceSourceLabel: referenceSource ? humanize(referenceSource) : null,
    referenceOddsLabel: referenceOdds === "-" ? null : referenceOdds,
    referenceProbabilityLabel: formatProbabilityLabel(referenceProbability),
    referenceDeltaLabel: referenceDelta == null ? null : `${(referenceDelta * 100).toFixed(2)}%`,
  };
}

function formatProbabilityAsOdds(probability: number | null) {
  if (probability == null || probability <= 0) return "-";
  return (1 / probability).toFixed(2);
}

function formatProbabilityLabel(probability: number | null) {
  if (probability == null) return "-";
  return `${(probability * 100).toFixed(2)}%`;
}

function formatOddsValue(value: unknown) {
  const numeric = toNumber(value);
  if (numeric == null || numeric <= 0) return "-";
  return numeric.toFixed(2);
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

function toNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function humanize(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}
