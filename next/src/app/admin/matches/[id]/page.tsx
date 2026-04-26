"use client";

import { use } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Tag } from "@/components/ui/Tag";
import { MatchForm } from "@/components/matches/MatchForm";
import { MatchActions } from "@/components/matches/MatchActions";
import { useAdminMatch, useUpdateMatch } from "@/hooks/useMatches";

interface MatchRecord {
  id: string;
  sport?: string;
  team1?: string;
  team2?: string;
  start_time?: string;
  status?: string;
  winner?: string | null;
  in_play_enabled?: boolean;
  provider?: string | null;
  external_id?: string | null;
}

export default function AdminMatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, isLoading } = useAdminMatch(id);
  const updateMatch = useUpdateMatch(id);
  const match = (data as { data?: MatchRecord } | undefined)?.data;

  if (isLoading) {
    return <p className="text-[var(--c-text-muted)]">Loading match...</p>;
  }

  if (!match) {
    return <p className="text-[var(--c-text-muted)]">Match not found.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="mb-3 flex items-center gap-3">
            <Tag status={match.status || "upcoming"} />
            <span className="text-xs uppercase tracking-[0.16em] text-[var(--c-text-faint)]">
              {match.sport}
            </span>
          </div>
          <h1 className="text-3xl font-bold text-[var(--c-text)]">
            {match.team1} vs {match.team2}
          </h1>
          <p className="mt-2 text-sm text-[var(--c-text-muted)]">
            {match.start_time ? new Date(match.start_time).toLocaleString() : "-"}
          </p>
        </div>

        <Link href={`/admin/matches/${match.id}/odds`}>
          <Button variant="primary">Open Odds Workspace</Button>
        </Link>
      </div>

      <Card variant="surface-2" className="p-6">
        <h2 className="mb-4 text-lg font-semibold text-[var(--c-text)]">Lifecycle Actions</h2>
        <MatchActions matchId={match.id} status={match.status} />
      </Card>

      <MatchForm
        title="Edit Match"
        submitLabel="Save Match"
        initialData={match}
        onSubmit={(body) => updateMatch.mutateAsync(body).then(() => undefined)}
      />
    </div>
  );
}
