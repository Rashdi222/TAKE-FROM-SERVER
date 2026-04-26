import type { Metadata } from "next";
import { ContentPage } from "@/components/public/ContentPage";
import { buildPublicMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildPublicMetadata({
  title: "Privacy Policy",
  description:
    "Review the Sixerbat privacy page covering account, session, and betting-related data handling at a public policy level.",
  path: "/privacy",
});

export default function PrivacyPage() {
  return (
    <ContentPage
      eyebrow="Privacy"
      title="Privacy Policy"
      description="This public privacy page gives search engines and users a stable privacy route. Final production language should be reviewed before launch."
    >
      <article className="rounded-[var(--r-lg)] border border-[var(--c-border)] bg-[rgba(28,25,51,0.56)] p-6 shadow-[var(--shadow-1)]">
        <p className="text-sm leading-7 text-[var(--c-text-muted)]">
          Sixerbat handles player account, session, wallet, and betting activity data
          as part of platform operations. A production privacy policy should define
          storage, retention, access controls, and support-request handling in detail.
        </p>
      </article>
    </ContentPage>
  );
}

