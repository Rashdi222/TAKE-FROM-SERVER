import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ContentPage } from "@/components/public/ContentPage";
import { buildPublicMetadata } from "@/lib/seo/metadata";
import { getSportHub, SPORT_HUBS } from "@/lib/seo/public-content";

type SportHubPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  return SPORT_HUBS.map((sport) => ({ slug: sport.slug }));
}

export async function generateMetadata({
  params,
}: SportHubPageProps): Promise<Metadata> {
  const { slug } = await params;
  const sport = getSportHub(slug);

  if (!sport) {
    return buildPublicMetadata({
      title: "Sport Not Found",
      description: "The requested sport hub could not be found.",
      path: `/sports/${slug}`,
    });
  }

  return buildPublicMetadata({
    title: sport.title,
    description: sport.description,
    path: `/sports/${sport.slug}`,
    keywords: sport.keywords,
  });
}

export default async function SportHubPage({ params }: SportHubPageProps) {
  const { slug } = await params;
  const sport = getSportHub(slug);

  if (!sport) {
    notFound();
  }

  return (
    <ContentPage
      eyebrow="Sport Hub"
      title={sport.title}
      description={sport.description}
    >
      <article className="rounded-[var(--r-lg)] border border-[var(--c-border)] bg-[rgba(28,25,51,0.56)] p-6 shadow-[var(--shadow-1)]">
        <h2 className="mb-3 text-2xl font-semibold text-[var(--c-text)]">
          Coverage Overview
        </h2>
        <p className="mb-5 text-sm leading-6 text-[var(--c-text-muted)]">
          {sport.summary}
        </p>
        <p className="mb-3 text-xs uppercase tracking-[0.18em] text-[var(--c-text-faint)]">
          Supported Public Market Groups
        </p>
        <ul className="flex flex-wrap gap-2">
          {sport.markets.map((market) => (
            <li
              key={market}
              className="rounded-full border border-[var(--c-border)] px-3 py-1 text-xs text-[var(--c-text-muted)]"
            >
              {market}
            </li>
          ))}
        </ul>
      </article>
    </ContentPage>
  );
}

