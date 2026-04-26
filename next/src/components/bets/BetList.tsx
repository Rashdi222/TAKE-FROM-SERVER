"use client";

import { useState } from "react";
import { Bet } from "@/lib/api";
import { BetCard } from "./BetCard";
import { Button } from "../ui/Button";

interface BetListProps {
  bets: Bet[];
}

type FilterTab = "all" | "active" | "settled" | "cancelled";

export function BetList({ bets }: BetListProps) {
  const [tab, setTab] = useState<FilterTab>("all");

  const filteredBets = bets.filter((bet) => {
    if (tab === "all") return true;
    if (tab === "active") return bet.status === "pending" || bet.status === "active";
    if (tab === "settled") return bet.status === "won" || bet.status === "lost";
    if (tab === "cancelled") return bet.status === "cancelled" || bet.status === "rejected";
    return true;
  });

  const tabs: { key: FilterTab; label: string }[] = [
    { key: "all", label: "All" },
    { key: "active", label: "Active" },
    { key: "settled", label: "Settled" },
    { key: "cancelled", label: "Cancelled" },
  ];

  return (
    <div>
      <div className="flex gap-2 mb-6">
        {tabs.map((t) => (
          <Button
            key={t.key}
            variant={tab === t.key ? "primary" : "secondary"}
            onClick={() => setTab(t.key)}
            className="text-sm"
          >
            {t.label}
          </Button>
        ))}
      </div>

      {filteredBets.length === 0 ? (
        <p className="text-[var(--c-text-muted)]">No bets found</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredBets.map((bet) => (
            <BetCard key={bet.id} bet={bet} />
          ))}
        </div>
      )}
    </div>
  );
}
