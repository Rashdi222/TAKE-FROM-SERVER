"use client";

import Link from "next/link";
import { formatCurrency } from "@/lib/format";
import { Card } from "../ui/Card";

interface Player {
  id: string;
  username?: string | null;
  email?: string;
  account_currency?: string;
  balance?: number | string;
  is_active?: boolean;
  inserted_at?: string;
}

interface PlayerTableProps {
  players: Player[];
}

export function PlayerTable({ players }: PlayerTableProps) {
  if (players.length === 0) {
    return (
      <Card variant="surface-1" className="p-6">
        <p className="text-[var(--c-text-muted)] text-center">No players found</p>
      </Card>
    );
  }

  return (
    <Card variant="surface-1" className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--c-border)]">
              <th className="px-4 py-3 text-left text-sm font-medium text-[var(--c-text-muted)]">Username</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-[var(--c-text-muted)]">Email</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-[var(--c-text-muted)]">Balance</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-[var(--c-text-muted)]">Currency</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-[var(--c-text-muted)]">Status</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-[var(--c-text-muted)]">Joined</th>
            </tr>
          </thead>
          <tbody>
            {players.map((player) => (
              <tr key={player.id} className="border-b border-[var(--c-border)] last:border-0 hover:bg-[var(--c-surface-2)]">
                <td className="px-4 py-3">
                  <Link href={`/master/players/${player.id}`} className="text-[var(--c-accent)] hover:underline">
                    {player.username || "-"}
                  </Link>
                </td>
                <td className="px-4 py-3 text-sm text-[var(--c-text)]">{player.email || "-"}</td>
                <td className="px-4 py-3 text-sm font-mono text-[var(--c-text)]">
                  {formatCurrency(player.balance ?? 0, String(player.account_currency ?? "USD"))}
                </td>
                <td className="px-4 py-3 text-xs uppercase tracking-[0.12em] text-[var(--c-text-faint)]">{player.account_currency || "-"}</td>
                <td className="px-4 py-3 text-sm">
                  <span className={player.is_active ? "text-[var(--c-success)]" : "text-[var(--c-danger)]"}>
                    {player.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-[var(--c-text-muted)]">
                  {player.inserted_at ? new Date(player.inserted_at).toLocaleDateString() : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function PlayerTableWithAction({
  players,
  onSelect,
}: {
  players: Player[];
  onSelect: (player: Player) => void;
}) {
  if (players.length === 0) {
    return (
      <Card variant="surface-1" className="p-6">
        <p className="text-[var(--c-text-muted)] text-center">No players found</p>
      </Card>
    );
  }

  return (
    <Card variant="surface-1" className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--c-border)]">
              <th className="px-4 py-3 text-left text-sm font-medium text-[var(--c-text-muted)]">Username</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-[var(--c-text-muted)]">Email</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-[var(--c-text-muted)]">Balance</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-[var(--c-text-muted)]">Currency</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-[var(--c-text-muted)]">Status</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-[var(--c-text-muted)]">Joined</th>
            </tr>
          </thead>
          <tbody>
            {players.map((player) => (
              <tr
                key={player.id}
                className="cursor-pointer border-b border-[var(--c-border)] last:border-0 hover:bg-[var(--c-surface-2)]"
                onClick={() => onSelect(player)}
              >
                <td className="px-4 py-3 text-[var(--c-accent)]">{player.username || "-"}</td>
                <td className="px-4 py-3 text-sm text-[var(--c-text)]">{player.email || "-"}</td>
                <td className="px-4 py-3 text-sm font-mono text-[var(--c-text)]">
                  {formatCurrency(player.balance ?? 0, String(player.account_currency ?? "USD"))}
                </td>
                <td className="px-4 py-3 text-xs uppercase tracking-[0.12em] text-[var(--c-text-faint)]">{player.account_currency || "-"}</td>
                <td className="px-4 py-3 text-sm">
                  <span className={player.is_active ? "text-[var(--c-success)]" : "text-[var(--c-danger)]"}>
                    {player.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-[var(--c-text-muted)]">
                  {player.inserted_at ? new Date(player.inserted_at).toLocaleDateString() : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
