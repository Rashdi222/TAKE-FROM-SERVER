import type { Metadata } from "next";
import { ContentPage } from "@/components/public/ContentPage";
import { buildPublicMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildPublicMetadata({
  title: "Contact Sixerbat",
  description:
    "Use the Sixerbat contact page for platform support, operational queries, and partnership follow-up.",
  path: "/contact",
});

export default function ContactPage() {
  return (
    <ContentPage
      eyebrow="Contact"
      title="Contact Sixerbat"
      description="This public contact route gives the platform a stable trust and support destination for users, operators, and partners."
    >
      <article className="rounded-[var(--r-lg)] border border-[var(--c-border)] bg-[rgba(28,25,51,0.56)] p-6 shadow-[var(--shadow-1)]">
        <p className="mb-3 text-sm leading-6 text-[var(--c-text-muted)]">
          Support and partnership responses should route through your final production
          channels. This page is the SEO-safe public contact endpoint.
        </p>
        <p className="text-sm text-[var(--c-text-faint)]">
          Email: support@sixerbat.com
        </p>
      </article>
    </ContentPage>
  );
}
