import { notFound } from "next/navigation";
import { PlayerSportsbookWorkspace } from "@/components/user/sportsbook/PlayerSportsbookWorkspace";
import {
  SPORTBOOK_SPORT_LABELS,
  type SportsbookSportId,
} from "@/components/user/sportsbook/sports";

type PlayerSportBoardPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function PlayerSportBoardPage({ params }: PlayerSportBoardPageProps) {
  const { slug } = await params;

  if (!SPORTBOOK_SPORT_LABELS[slug]) {
    notFound();
  }

  return <PlayerSportsbookWorkspace sportSlug={slug as SportsbookSportId} />;
}
