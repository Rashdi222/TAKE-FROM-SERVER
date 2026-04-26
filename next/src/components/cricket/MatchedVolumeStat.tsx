"use client";

import { toNumber } from "@/lib/format";

export function MatchedVolumeStat({ value, compact = false }: { value: unknown; compact?: boolean }) {
  const numeric = toNumber(value) ?? 0;

  return (
    <span
      className={`rounded-[var(--r-pill)] border border-[var(--c-border)] bg-[rgba(255,255,255,0.03)] font-medium text-[var(--c-text-muted)] ${
        compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]"
      }`}
    >
      {compact ? "Vol " : "Matched "}
      {numeric.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </span>
  );
}
