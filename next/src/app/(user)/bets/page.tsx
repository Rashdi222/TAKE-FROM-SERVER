"use client";

import { useBets } from "@/hooks/useBets";
import { BetList } from "@/components/bets/BetList";

export default function BetsPage() {
  const { data, isLoading } = useBets();

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-[var(--c-text)] mb-6">My Bets</h1>
      
      {isLoading ? (
        <p className="text-[var(--c-text-muted)]">Loading bets...</p>
      ) : (
        <BetList bets={(data as { data?: import("@/lib/api/types/bets").Bet[] } | undefined)?.data || []} />
      )}
    </div>
  );
}
