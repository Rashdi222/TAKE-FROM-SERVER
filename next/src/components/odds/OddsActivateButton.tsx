"use client";

import { Button } from "@/components/ui/Button";
import { useToggleOddsActive } from "@/hooks/useOdds";

export function OddsActivateButton({
  oddsId,
  matchId,
  isActive,
}: {
  oddsId: string;
  matchId: string;
  isActive: boolean;
}) {
  const toggle = useToggleOddsActive(oddsId, matchId, isActive);

  return (
    <Button variant="secondary" onClick={() => toggle.mutate(undefined)} disabled={toggle.isPending}>
      {toggle.isPending ? "Saving..." : isActive ? "Deactivate" : "Activate"}
    </Button>
  );
}
