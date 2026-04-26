"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { useSportMarketConfigs, useUpsertSportMarketConfig } from "@/hooks/useOdds";
import { SportMarketTemplateForm } from "@/components/odds/SportMarketTemplateForm";
import { SportMarketTemplateTable } from "@/components/odds/SportMarketTemplateTable";

const sports = [
  { id: "all", label: "All Sports" },
  { id: "cricket", label: "Cricket" },
  { id: "football", label: "Football" },
  { id: "tennis", label: "Tennis" },
  { id: "horse_racing", label: "Horse Racing" },
  { id: "dog_racing", label: "Dog Racing" },
] as const;

export default function AdminMarketTemplatesPage() {
  const [sport, setSport] = useState<(typeof sports)[number]["id"]>("all");
  const upsert = useUpsertSportMarketConfig();
  const { data: configs = [], isLoading } = useSportMarketConfigs(
    sport === "all" ? {} : { sport },
  );

  const groupedCount = useMemo(() => {
    return configs.reduce<Record<string, number>>((acc, item) => {
      acc[item.sport] = (acc[item.sport] || 0) + 1;
      return acc;
    }, {});
  }, [configs]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.16em] text-[var(--c-text-faint)]">
          Odds Desk
        </p>
        <h1 className="mt-2 text-3xl font-bold text-[var(--c-text)]">Sport Market Templates</h1>
        <p className="mt-3 max-w-3xl text-sm text-[var(--c-text-muted)]">
          Control which markets each sport can generate and the default risk limits the odds workspace should apply.
        </p>
      </div>

      <Card variant="surface-2" className="p-4">
        <div className="flex flex-wrap gap-2">
          {sports.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSport(item.id)}
              className={`rounded-[var(--r-pill)] border px-3 py-1 text-sm ${
                sport === item.id
                  ? "border-[var(--c-accent)] bg-[var(--c-accent-soft)] text-[var(--c-text)]"
                  : "border-[var(--c-border)] text-[var(--c-text-muted)]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <SportMarketTemplateForm
          initialData={sport === "all" ? undefined : { sport }}
          onSubmit={(body) => upsert.mutateAsync(body).then(() => undefined)}
        />

        <Card variant="surface-2" className="p-6">
          <h2 className="text-lg font-semibold text-[var(--c-text)]">Coverage Summary</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {Object.entries(groupedCount).map(([key, value]) => (
              <div
                key={key}
                className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] p-4"
              >
                <div className="text-sm font-medium text-[var(--c-text)]">{key}</div>
                <div className="mt-1 text-xs text-[var(--c-text-muted)]">{value} configured markets</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {isLoading ? (
        <p className="text-sm text-[var(--c-text-muted)]">Loading market templates...</p>
      ) : (
        <SportMarketTemplateTable configs={configs} />
      )}
    </div>
  );
}
