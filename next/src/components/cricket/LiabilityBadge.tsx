"use client";

import { toNumber } from "@/lib/format";
import { MatchedVolumeStat } from "@/components/cricket/MatchedVolumeStat";

export function LiabilityBadge({
  matchedVolume,
  liability,
  compact = false,
}: {
  matchedVolume: unknown;
  liability: unknown;
  compact?: boolean;
}) {
  const volume = toNumber(matchedVolume) ?? 0;
  const pnl = toNumber(liability) ?? 0;
  const danger = pnl <= -1000;
  const warning = pnl < 0 && !danger;

  const tone =
    danger
      ? "border-[rgba(255,84,84,0.36)] bg-[rgba(255,84,84,0.18)] text-[var(--c-danger)] shadow-[0_0_0_1px_rgba(255,84,84,0.08),0_0_24px_rgba(255,84,84,0.18)]"
      : warning
        ? "border-[rgba(255,156,84,0.3)] bg-[rgba(255,156,84,0.14)] text-[var(--c-warning)]"
        : "border-[rgba(58,188,109,0.26)] bg-[rgba(58,188,109,0.12)] text-[var(--c-success)]";

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${compact ? "justify-start" : "md:justify-end"}`}>
      <MatchedVolumeStat value={volume} compact={compact} />
      <span
        className={`rounded-[var(--r-pill)] border font-semibold ${tone} ${
          compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]"
        } ${
          danger ? "animate-[pulse_2.4s_ease-in-out_infinite]" : ""
        }`}
      >
        {danger ? "Danger " : warning ? "Warning " : ""}
        P/L {pnl >= 0 ? "+" : ""}
        {formatMoney(pnl)}
      </span>
    </div>
  );
}

function formatMoney(value: number) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
