"use client";

import { Card } from "@/components/ui/Card";

export function TabGuidancePanel({
  title,
  summary,
  bullets,
}: {
  title: string;
  summary: string;
  bullets: string[];
}) {
  return (
    <Card variant="surface-2" className="p-5">
      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--c-text-faint)]">
        Active Tab Guide
      </div>
      <h2 className="mt-2 text-lg font-semibold text-[var(--c-text)]">{title}</h2>
      <p className="mt-2 max-w-4xl text-sm leading-6 text-[var(--c-text-muted)]">{summary}</p>
      <div className="mt-4 grid gap-3 xl:grid-cols-3">
        {bullets.map((bullet) => (
          <div
            key={bullet}
            className="rounded-[var(--r-card)] border border-[var(--c-border)] bg-[color:color-mix(in_srgb,var(--c-surface-1)_88%,transparent)] p-4 text-sm leading-6 text-[var(--c-text-muted)]"
          >
            {bullet}
          </div>
        ))}
      </div>
    </Card>
  );
}
