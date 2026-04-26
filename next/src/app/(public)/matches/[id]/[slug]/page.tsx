import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MatchDetailPageClient } from "@/components/public/MatchDetailPageClient";
import { buildPublicMetadata } from "@/lib/seo/metadata";
import {
  buildMatchBreadcrumbJsonLd,
  buildSportsEventJsonLd,
  getMatchDescription,
  getMatchPath,
  getMatchTitle,
} from "@/lib/seo/match";
import { fetchPublicMatch, fetchPublicMatchOdds } from "@/lib/seo/public-data";
import { absoluteUrl } from "@/lib/seo/site";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type MatchDetailPageProps = {
  params: Promise<{ id: string; slug: string }>;
};

export async function generateMetadata({
  params,
}: MatchDetailPageProps): Promise<Metadata> {
  const { id, slug } = await params;
  const match = await fetchPublicMatch(id);

  if (!match || (match.slug && match.slug != slug)) {
    return buildPublicMetadata({
      title: "Match Not Found",
      description: "The requested match could not be found on Sixerbat.",
      path: `/matches/${id}/${slug}`,
    });
  }

  const metadata = buildPublicMetadata({
    title: getMatchTitle(match),
    description: getMatchDescription(match),
    path: getMatchPath(match),
    keywords: [
      `${match.sport} betting`,
      `${match.team1} vs ${match.team2}`,
      "match odds",
      "sports betting preview",
    ],
    ogType: "article",
  });

  metadata.openGraph = {
    ...metadata.openGraph,
    images: [buildMatchImageUrl(match.id, "opengraph-image")],
  };

  metadata.twitter = {
    ...metadata.twitter,
    images: [buildMatchImageUrl(match.id, "twitter-image")],
  };

  return metadata;
}

function buildMatchImageUrl(id: string, kind: "opengraph-image" | "twitter-image") {
  return absoluteUrl(`/matches/${id}/${kind}`);
}

export default async function MatchDetailPage({ params }: MatchDetailPageProps) {
  const { id, slug } = await params;
  const [match, odds] = await Promise.all([
    fetchPublicMatch(id),
    fetchPublicMatchOdds(id),
  ]);

  if (!match || (match.slug && match.slug != slug)) {
    notFound();
  }

  const sportsEventJsonLd = buildSportsEventJsonLd(match);
  const breadcrumbJsonLd = buildMatchBreadcrumbJsonLd(match);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(sportsEventJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <MatchDetailPageClient matchId={id} initialMatch={match} initialOdds={odds} />
    </>
  );
}

