"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { GenerateOddsButton } from "@/components/odds/GenerateOddsButton";
import { OrchestrateButton } from "@/components/odds/OrchestrateButton";
import { PublishButton } from "@/components/odds/PublishButton";
import { UnpublishButton } from "@/components/odds/UnpublishButton";
import { RewriteOddsModal } from "@/components/odds/RewriteOddsModal";
import type { SportMarketConfig } from "@/lib/api";

export function CricketMatchActionBar({
  matchId,
  sport,
  marketConfigs,
  showPublish = true,
  showUnpublish = true,
}: {
  matchId: string;
  sport?: string;
  marketConfigs: SportMarketConfig[];
  showPublish?: boolean;
  showUnpublish?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <GenerateOddsButton matchId={matchId} sport={sport} marketConfigs={marketConfigs} />
      <OrchestrateButton matchId={matchId} />
      <RewriteOddsModal matchId={matchId} />
      {showPublish ? <PublishButton matchId={matchId} /> : null}
      {showUnpublish ? <UnpublishButton matchId={matchId} /> : null}
      <Link href={`/admin/matches/${matchId}/odds`}>
        <Button variant="secondary">Odds Desk</Button>
      </Link>
    </div>
  );
}
