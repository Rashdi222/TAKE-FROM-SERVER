"use client";

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { SPORTBOOK_SPORTS, type SportsbookSportId } from "./sports";

export function SportRail({ activeSport }: { activeSport: SportsbookSportId }) {
  return (
    <Card variant="surface-2" className="overflow-visible border-[var(--c-border-strong)] p-2">
      <div className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
        {SPORTBOOK_SPORTS.map((sport) => {
          const active = sport.id === activeSport;
          const Icon = sport.icon;

          return (
            <Link
              key={sport.id}
              href={sport.href}
              prefetch
              className={[
                "group relative flex min-w-[124px] items-center gap-3 overflow-hidden rounded-[1.2rem] border px-3 py-3 transition-all duration-200 lg:min-w-0",
                active
                  ? "border-[rgba(161,121,241,0.34)] bg-[linear-gradient(135deg,rgba(58,139,255,0.18),rgba(99,32,232,0.26))] text-[var(--c-text)] shadow-[0_16px_36px_rgba(0,0,0,0.2)]"
                  : "border-[var(--c-border)] bg-[rgba(255,255,255,0.03)] text-[var(--c-text-muted)] hover:border-[var(--c-accent)] hover:text-[var(--c-text)]",
              ].join(" ")}
            >
              <div
                className={[
                  "absolute inset-0 bg-gradient-to-br opacity-0 transition-opacity duration-200",
                  sport.accentClass,
                  active ? "opacity-100" : "group-hover:opacity-100",
                ].join(" ")}
              />
              <span
                className={[
                  "relative flex h-11 w-11 shrink-0 items-center justify-center rounded-[1rem] border",
                  active
                    ? "border-[rgba(255,255,255,0.16)] bg-[rgba(10,13,22,0.28)]"
                    : "border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)]",
                ].join(" ")}
              >
                <Icon className={`h-5 w-5 ${sport.iconColor}`} />
              </span>
              <div className="relative min-w-0">
                <div className="truncate text-sm font-semibold">{sport.shortLabel}</div>
                <div className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-[var(--c-text-faint)]">
                  {sport.description}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </Card>
  );
}
