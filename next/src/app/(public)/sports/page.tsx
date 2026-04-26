import type { Metadata } from "next";
import { ContentPage } from "@/components/public/ContentPage";
import { SportsHubGrid } from "@/components/public/SportsHubGrid";
import { buildPublicMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildPublicMetadata({
  title: "Sports Betting Coverage by Sport",
  description:
    "Browse Sixerbat public betting coverage by sport, including cricket, football, tennis, horse racing, and dog racing.",
  path: "/sports",
  keywords: ["sports betting", "cricket betting", "football betting", "tennis betting"],
});

export default function SportsPage() {
  return (
    <ContentPage
      eyebrow="Sports"
      title="Explore Betting Coverage by Sport"
      description="Public sport hub pages organize Sixerbat coverage by market family, fixture type, and supported betting workflow."
    >
      <SportsHubGrid />
    </ContentPage>
  );
}

