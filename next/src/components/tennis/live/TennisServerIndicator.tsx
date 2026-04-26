"use client";

import { memo } from "react";
import { CircleDot } from "lucide-react";

export const TennisServerIndicator = memo(function TennisServerIndicator({
  active,
}: {
  active: boolean;
}) {
  if (!active) return null;

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-lime-300/35 bg-lime-400/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-lime-100 shadow-[0_0_20px_rgba(163,230,53,0.18)]">
      <CircleDot className="h-3.5 w-3.5 fill-lime-300 text-lime-300" />
      Serve
    </span>
  );
});
