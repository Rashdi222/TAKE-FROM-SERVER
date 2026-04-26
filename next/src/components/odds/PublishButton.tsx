"use client";

import { Button } from "@/components/ui/Button";
import { usePublishOdds } from "@/hooks/useOdds";

export function PublishButton({ matchId }: { matchId: string }) {
  const publish = usePublishOdds(matchId);

  return (
    <Button variant="primary" onClick={() => publish.mutate()} disabled={publish.isPending}>
      {publish.isPending ? "Publishing..." : "Publish Drafts"}
    </Button>
  );
}
