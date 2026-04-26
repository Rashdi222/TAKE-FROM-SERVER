import type { Metadata } from "next";
import { ContentPage } from "@/components/public/ContentPage";
import { buildPublicMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildPublicMetadata({
  title: "Responsible Gaming",
  description:
    "Read Sixerbat responsible gaming guidance covering discipline, affordability, and safe betting behavior.",
  path: "/responsible-gaming",
});

export default function ResponsibleGamingPage() {
  return (
    <ContentPage
      eyebrow="Responsible Gaming"
      title="Bet With Discipline"
      description="Sixerbat should never be presented as guaranteed profit. Responsible gaming guidance is part of platform trust and search-quality hygiene."
    >
      {[
        "Set clear daily, weekly, and monthly spend limits before placing bets.",
        "Avoid chasing losses or increasing stake size emotionally after a losing streak.",
        "Use betting as entertainment, not as a financial strategy.",
        "Take breaks if betting starts affecting concentration, finances, or relationships.",
      ].map((item) => (
        <article
          key={item}
          className="rounded-[var(--r-lg)] border border-[var(--c-border)] bg-[rgba(28,25,51,0.56)] p-6 shadow-[var(--shadow-1)]"
        >
          <p className="text-sm leading-6 text-[var(--c-text-muted)]">{item}</p>
        </article>
      ))}
    </ContentPage>
  );
}

