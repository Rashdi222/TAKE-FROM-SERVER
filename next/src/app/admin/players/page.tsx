"use client";

import { useState } from "react";
import { useAccountCurrencies, useSuperAdminPlayers } from "@/hooks/useSuperAdmin";
import { AccountCurrencyFilter } from "@/components/admin/AccountCurrencyFilter";
import { PlayerAdminTable } from "@/components/admin/PlayerAdminTable";

interface Player {
  id: string;
  username?: string | null;
  email?: string;
  account_currency?: string;
  balance?: number | string;
  is_active?: boolean;
  role?: string;
  max_stake_per_bet?: number | string | null;
  daily_max_exposure?: number | string | null;
  betting_locked?: boolean;
  payments_locked?: boolean;
}

export default function PlayersPage() {
  const { data: currencyData } = useAccountCurrencies();
  const [search, setSearch] = useState("");
  const [currencyFilter, setCurrencyFilter] = useState("");

  const { data, isLoading } = useSuperAdminPlayers(
    currencyFilter ? { account_currency: currencyFilter } : undefined
  );

  const players: Player[] = (data as { data?: Player[] })?.data || [];
  const currencies = ((currencyData as { data?: import("@/lib/api/types/settings").AccountCurrency[] } | undefined)?.data ?? []).filter((currency) => currency.enabled !== false);

  const filteredPlayers = players.filter((p) => {
    const searchLower = search.toLowerCase();
    return (
      !search ||
      p.username?.toLowerCase().includes(searchLower) ||
      p.email?.toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-[var(--c-text)] mb-6">Platform Players</h1>

      <div className="mb-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end">
          <input
            type="text"
            placeholder="Search by username or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-4 py-2 bg-[var(--c-surface-1)] border border-[var(--c-border)] rounded-[var(--r-sm)] text-[var(--c-text)] w-full max-w-md"
          />
          <div className="w-full max-w-xs">
            <AccountCurrencyFilter
              value={currencyFilter}
              onChange={setCurrencyFilter}
              currencies={currencies}
              label="Filter by account currency"
            />
          </div>
        </div>
      </div>

      {isLoading ? (
        <p className="text-[var(--c-text-muted)]">Loading players...</p>
      ) : (
        <PlayerAdminTable players={filteredPlayers} />
      )}
    </div>
  );
}
