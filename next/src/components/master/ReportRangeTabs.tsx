"use client";

import { Input } from "@/components/ui/Input";

const ranges = [
  { id: "1d", label: "1 Day" },
  { id: "1w", label: "1 Week" },
  { id: "1m", label: "1 Month" },
  { id: "custom", label: "Custom" },
] as const;

export function ReportRangeTabs({
  range,
  onRangeChange,
  from,
  to,
  onFromChange,
  onToChange,
}: {
  range: (typeof ranges)[number]["id"];
  onRangeChange: (value: (typeof ranges)[number]["id"]) => void;
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {ranges.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onRangeChange(item.id)}
            className={`rounded-[var(--r-pill)] border px-3 py-1 text-sm ${
              range === item.id
                ? "border-[var(--c-accent)] bg-[var(--c-accent-soft)] text-[var(--c-text)]"
                : "border-[var(--c-border)] text-[var(--c-text-muted)]"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {range === "custom" ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label="From"
            type="datetime-local"
            value={from}
            onChange={(e) => onFromChange(e.target.value)}
          />
          <Input
            label="To"
            type="datetime-local"
            value={to}
            onChange={(e) => onToChange(e.target.value)}
          />
        </div>
      ) : null}
    </div>
  );
}
