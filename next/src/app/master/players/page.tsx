"use client";

import { useState } from "react";
import { useMasterPlayers } from "@/hooks/useMasterPlayers";
import { PlayerTableWithAction } from "@/components/master/PlayerTable";
import { CreatePlayerForm } from "@/components/master/CreatePlayerForm";
import { Button } from "@/components/ui/Button";
import { PlayerQuickViewModal } from "@/components/master/PlayerQuickViewModal";

interface Player {
  id: string;
  username?: string | null;
  email?: string;
  account_currency?: string;
  balance?: number | string;
  is_active?: boolean;
  inserted_at?: string;
}

export default function PlayersPage() {
  const { data, isLoading } = useMasterPlayers();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);

  const players: Player[] = (data as { data?: Player[] })?.data || [];

  const filteredPlayers = players.filter((p) => {
    const searchLower = search.toLowerCase();
    return (
      !search ||
      p.username?.toLowerCase().includes(searchLower) ||
      p.email?.toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--c-accent)]">Players</p>
          <h1 className="text-3xl font-bold text-[var(--c-text)]">Player Control</h1>
        </div>
        <Button variant="primary" onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? "Close" : "Create Player"}
        </Button>
      </div>

      {showCreate && (
        <div className="mb-6 max-w-md">
          <CreatePlayerForm />
        </div>
      )}

      <div className="mb-6">
        <input
          type="text"
          placeholder="Search by username or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-4 py-2 bg-[var(--c-surface-1)] border border-[var(--c-border)] rounded-[var(--r-sm)] text-[var(--c-text)] w-full max-w-md"
        />
      </div>

      {isLoading ? (
        <p className="text-[var(--c-text-muted)]">Loading players...</p>
      ) : (
        <PlayerTableWithAction players={filteredPlayers} onSelect={setSelectedPlayer} />
      )}

      <PlayerQuickViewModal
        isOpen={!!selectedPlayer}
        onClose={() => setSelectedPlayer(null)}
        player={selectedPlayer}
      />
    </div>
  );
}
