import type { Metadata } from "next";
import { ContentPage } from "@/components/public/ContentPage";
import { buildPublicMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildPublicMetadata({
  title: "How Sixerbat Works",
  description:
    "Understand how Sixerbat imports matches, publishes platform odds, and settles player bets through its sportsbook workflow.",
  path: "/how-it-works",
});

export default function HowItWorksPage() {
  return (
    <ContentPage
      eyebrow="Platform Guide"
      title="How Sixerbat Works"
      description="This page explains the public sportsbook workflow from fixture import to published odds and final settlement."
    >
      {[
        "Providers supply source match data into the platform feed layer.",
        "Imported fixtures are cached inside the platform and surfaced on public match pages.",
        "Platform odds are generated or reviewed by operators before they are published to players.",
        "Only active, published platform odds are shown to players for betting.",
        "Winning bets are settled back into player balances according to the stored stake and odds values.",
      ].map((step, index) => (
        <article
          key={step}
          className="rounded-[var(--r-lg)] border border-[var(--c-border)] bg-[rgba(28,25,51,0.56)] p-6 shadow-[var(--shadow-1)]"
        >
          <p className="mb-2 text-xs uppercase tracking-[0.18em] text-[var(--c-text-faint)]">
            Step {index + 1}
          </p>
          <p className="text-sm leading-6 text-[var(--c-text-muted)]">{step}</p>
        </article>
      ))}
    </ContentPage>
  );
}

