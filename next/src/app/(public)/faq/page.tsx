import type { Metadata } from "next";
import { ContentPage } from "@/components/public/ContentPage";
import { FaqList } from "@/components/public/FaqList";
import { buildPublicMetadata } from "@/lib/seo/metadata";
import { FAQ_ITEMS } from "@/lib/seo/public-content";

export const metadata: Metadata = buildPublicMetadata({
  title: "Frequently Asked Questions",
  description:
    "Find answers about public match pages, published odds, live betting coverage, and platform visibility on Sixerbat.",
  path: "/faq",
});

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_ITEMS.map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: item.answer,
    },
  })),
};

export default function FaqPage() {
  return (
    <ContentPage
      eyebrow="FAQ"
      title="Frequently Asked Questions"
      description="This page covers the most common public-facing questions about Sixerbat availability, live pages, and published betting markets."
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <FaqList items={FAQ_ITEMS} />
    </ContentPage>
  );
}

