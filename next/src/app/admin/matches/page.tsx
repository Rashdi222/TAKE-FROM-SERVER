"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Tag } from "@/components/ui/Tag";
import { useAdminMatches } from "@/hooks/useMatches";

interface MatchRecord {
  id: string;
  sport?: string;
  team1?: string;
  team2?: string;
  start_time?: string;
  status?: string;
}

export default function AdminMatchesPage() {
  const [sport, setSport] = useState("");
  const [status, setStatus] = useState("");
  const { data, isLoading } = useAdminMatches({
    sport: sport || undefined,
    status: status || undefined,
  });

  const matches: MatchRecord[] = (data as { data?: MatchRecord[] } | undefined)?.data || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--c-accent)]">Imported Matches</p>
          <h1 className="text-3xl font-bold text-[var(--c-text)]">Matches</h1>
          <p className="text-sm text-[var(--c-text-muted)]">
            Cached fixtures imported from feeds plus manually added matches. Open any row to move into lifecycle and odds operations.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link href="/admin/feeds">
            <Button variant="secondary">Back to Feeds</Button>
          </Link>
          <Link href="/admin/matches/create">
            <Button variant="primary">Create Match</Button>
          </Link>
        </div>
      </div>

      <Card variant="surface-2" className="p-4">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-[var(--c-text)]">Sport</label>
            <select
              value={sport}
              onChange={(e) => setSport(e.target.value)}
              className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-2 text-[var(--c-text)]"
            >
              <option value="">All sports</option>
              <option value="cricket">Cricket</option>
              <option value="football">Football</option>
              <option value="tennis">Tennis</option>
              <option value="horse_racing">Horse Racing</option>
              <option value="dog_racing">Dog Racing</option>
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-[var(--c-text)]">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-2 text-[var(--c-text)]"
            >
              <option value="">All statuses</option>
              <option value="upcoming">Upcoming</option>
              <option value="live">Live</option>
              <option value="closed">Closed</option>
              <option value="settled">Settled</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>
      </Card>

      {isLoading ? (
        <p className="text-[var(--c-text-muted)]">Loading matches...</p>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {matches.map((match) => (
            <Link key={match.id} href={`/admin/matches/${match.id}`}>
              <Card variant="surface-1" className="h-full p-5 transition-colors hover:border-[var(--c-accent)]">
                <div className="mb-4 flex items-center justify-between">
                  <Tag status={match.status || "upcoming"} />
                  <span className="text-xs uppercase tracking-[0.16em] text-[var(--c-text-faint)]">
                    {match.sport}
                  </span>
                </div>
                <h2 className="text-xl font-semibold text-[var(--c-text)]">
                  {match.team1} vs {match.team2}
                </h2>
                <p className="mt-2 text-sm text-[var(--c-text-muted)]">
                  {match.start_time ? new Date(match.start_time).toLocaleString() : "-"}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
