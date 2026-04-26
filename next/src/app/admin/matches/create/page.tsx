"use client";

import { useRouter } from "next/navigation";
import { MatchForm } from "@/components/matches/MatchForm";
import { useCreateMatch } from "@/hooks/useMatches";

export default function CreateMatchPage() {
  const router = useRouter();
  const createMatch = useCreateMatch();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[var(--c-text)]">Create Match</h1>
        <p className="text-sm text-[var(--c-text-muted)]">
          Add a new fixture to the platform and seed it for odds management.
        </p>
      </div>

      <MatchForm
        title="New Match"
        submitLabel="Create Match"
        onSubmit={async (body) => {
          const response = (await createMatch.mutateAsync(body)) as {
            data?: { id?: string };
          };

          router.push(`/admin/matches/${response.data?.id}`);
        }}
      />
    </div>
  );
}
