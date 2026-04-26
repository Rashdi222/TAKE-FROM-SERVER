"use client";

import type { Match } from "@/lib/api";
import { PublicMatchCard } from "./PublicMatchCard";

type PublicMatchGroupProps = {
  title: string;
  subtitle?: string;
  matches: Match[];
  accent?: "default" | "live";
};

export function PublicMatchGroup({ title, subtitle, matches, accent = "default" }: PublicMatchGroupProps) {
  return (
    <section className="space-y-3 sm:space-y-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2
            className={[
              "text-lg font-semibold text-[var(--c-text)] sm:text-xl",
              accent === "live" ? "text-[var(--c-danger)]" : "",
            ].join(" ")}
          >
            {title}
          </h2>
          {subtitle ? <p className="text-sm text-[var(--c-text-muted)]">{subtitle}</p> : null}
        </div>
        <div className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--c-text-faint)]">
          {matches.length} match{matches.length === 1 ? "" : "es"}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {matches.map((match) => (
          <PublicMatchCard key={match.id} match={match} />
        ))}
      </div>
    </section>
  );
}
