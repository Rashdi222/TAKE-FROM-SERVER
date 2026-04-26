"use client";

import { Button } from "@/components/ui/Button";
import { useUnpublishOdds } from "@/hooks/useOdds";

export function UnpublishButton({ matchId }: { matchId: string }) {
  const unpublish = useUnpublishOdds(matchId);

  return (
    <Button variant="secondary" onClick={() => unpublish.mutate()} disabled={unpublish.isPending}>
      {unpublish.isPending ? "Unpublishing..." : "Unpublish"}
    </Button>
  );
}
