import type { Metadata } from "next";
import { Suspense } from "react";
import { MatchesPageClient } from "@/components/public/MatchesPageClient";
import { buildPublicMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildPublicMetadata({
  title: "Live Matches, Upcoming Fixtures, and Published Odds",
  description:
    "Explore public cricket, football, tennis, horse racing, and dog racing fixtures with published platform odds and live match status on Sixerbat.",
  path: "/matches",
  keywords: [
    "live matches",
    "upcoming fixtures",
    "cricket fixtures",
    "football fixtures",
    "published betting odds",
  ],
});

export default function MatchesPage() {
  return (
    <Suspense fallback={null}>
      <MatchesPageClient />
    </Suspense>
  );
}
