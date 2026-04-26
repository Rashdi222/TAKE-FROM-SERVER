import type { Metadata } from "next";
import { ContentPage } from "@/components/public/ContentPage";
import { buildPublicMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildPublicMetadata({
  title: "Terms and Conditions",
  description:
    "Review the public terms and conditions page for Sixerbat platform usage, access rules, and betting workflow context.",
  path: "/terms",
});

export default function TermsPage() {
  return (
    <ContentPage
      eyebrow="Legal"
      title="Terms and Conditions"
      description="This public legal page is a placeholder framework for platform terms. Final legal language should be reviewed before production launch."
    >
      <article className="rounded-[var(--r-lg)] border border-[var(--c-border)] bg-[rgba(28,25,51,0.56)] p-6 shadow-[var(--shadow-1)]">
        <p className="text-sm leading-7 text-[var(--c-text-muted)]">
          Sixerbat account usage, betting access, publication of odds, wallet flows,
          and platform permissions should ultimately be governed by a reviewed and
          finalized production terms document.
        </p>
      </article>
    </ContentPage>
  );
}

