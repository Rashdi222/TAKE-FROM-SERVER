"use client";

import { useSearchParams } from "next/navigation";
import { BetPlacementForm } from "@/components/bets/BetPlacementForm";

export default function PlaceBetPage() {
  const searchParams = useSearchParams();
  const matchId = searchParams.get("matchId") || "";
  const oddsId = searchParams.get("oddsId") || "";
  const oddsValue = Number(searchParams.get("oddsValue")) || 1;

  if (!matchId || !oddsId) {
    return (
      <div className="container mx-auto px-4 py-8">
        <p className="text-[var(--c-text-muted)]">Invalid bet parameters</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-[var(--c-text)] mb-6">Place Bet</h1>
      <div className="max-w-md">
        <BetPlacementForm
          matchId={matchId}
          oddsId={oddsId}
          oddsValue={oddsValue}
        />
      </div>
    </div>
  );
}
