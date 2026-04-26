"use client";

export function MarketSuspensionPill({ reason, compact = false }: { reason?: string | null; compact?: boolean }) {
  return (
    <span
      className={`rounded-[var(--r-pill)] border border-[rgba(255,84,84,0.3)] bg-[rgba(255,84,84,0.14)] font-semibold uppercase tracking-[0.14em] text-[var(--c-danger)] ${
        compact ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-1 text-[10px]"
      }`}
    >
      Suspended{reason ? ` · ${String(reason).replace(/_/g, " ")}` : ""}
    </span>
  );
}
