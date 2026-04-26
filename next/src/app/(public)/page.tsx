import type { Metadata } from "next";
import { Hero } from "@/components/landing/Hero";
import { MarketOverview } from "@/components/landing/MarketOverview";
import { FeaturesList } from "@/components/landing/FeaturesList";
import { FooterCTA } from "@/components/landing/FooterCTA";
import { buildPublicMetadata } from "@/lib/seo/metadata";
import {
  buildOrganizationJsonLd,
  buildWebSiteJsonLd,
} from "@/lib/seo/structured-data";

export const metadata: Metadata = buildPublicMetadata({
  title: "Live Sports Betting Platform & AI Odds Workflow",
  description:
    "Browse live cricket, football, tennis, horse racing, and dog racing markets on Sixerbat with published odds, secure wallet flows, and operator-grade live coverage.",
  path: "/",
  keywords: [
    "live sports betting platform",
    "cricket betting",
    "football betting",
    "tennis betting",
    "horse racing betting",
    "dog racing betting",
    "ai odds workflow",
  ],
});

const organizationJsonLd = buildOrganizationJsonLd();
const websiteJsonLd = buildWebSiteJsonLd();

export default function HomePage() {
  return (
    <div className="flex min-h-full flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
      />
      <Hero />
      <MarketOverview />
      <FeaturesList />
      <FooterCTA />
    </div>
  );
}
