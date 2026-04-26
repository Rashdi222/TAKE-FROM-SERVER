"use client";

export function OddsVersionTag({ version }: { version?: number | null }) {
  return (
    <span className="inline-flex rounded-[var(--r-pill)] border border-[var(--c-border)] px-2 py-1 text-xs font-medium text-[var(--c-text-muted)]">
      v{version ?? 1}
    </span>
  );
}
