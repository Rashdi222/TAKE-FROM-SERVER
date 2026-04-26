import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Tag } from "@/components/ui/Tag";
import { ContentPage } from "@/components/public/ContentPage";
import { buildPublicMetadata } from "@/lib/seo/metadata";
import { fetchPublicTournament } from "@/lib/seo/public-data";
import { getMatchPath } from "@/lib/seo/match";
import { groupMatchesByDate, matchCompetitionName, matchTimeLabel, readableSport } from "@/lib/public-matches/lobby";

type TournamentPageProps = {
  params: Promise<{ id: string; slug: string }>;
};

export async function generateMetadata({
  params,
}: TournamentPageProps): Promise<Metadata> {
  const { id, slug } = await params;
  const tournament = await fetchPublicTournament(id);

  if (!tournament || tournament.slug !== slug) {
    return buildPublicMetadata({
      title: "Tournament Not Found",
      description: "The requested tournament could not be found on Sixerbat.",
      path: `/tournaments/${id}/${slug}`,
    });
  }

  return buildPublicMetadata({
    title: `${tournament.name} Fixtures and Betting Coverage`,
    description: `View public match coverage for ${tournament.name} on Sixerbat, including upcoming fixtures and published odds pages.`,
    path: `/tournaments/${tournament.id}/${tournament.slug}`,
    keywords: [
      tournament.name,
      `${tournament.sport} tournament`,
      "competition fixtures",
      "betting coverage",
    ],
  });
}

export default async function TournamentPage({ params }: TournamentPageProps) {
  const { id, slug } = await params;
  const tournament = await fetchPublicTournament(id);

  if (!tournament || tournament.slug !== slug) {
    notFound();
  }

  const groupedMatches = groupMatchesByDate(tournament.matches || []);

  return (
    <ContentPage
      eyebrow="Tournament"
      title={tournament.name}
      description={`Public match coverage for ${tournament.name}, including imported fixtures and published odds pages across the ${tournament.sport.replace(/_/g, " ")} schedule.`}
    >
      <article className="rounded-[var(--r-lg)] border border-[var(--c-border-strong)] bg-[radial-gradient(circle_at_top_left,rgba(225,64,64,0.08),transparent_36%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))] p-6 shadow-[var(--shadow-1)]">
        <p className="mb-2 text-xs uppercase tracking-[0.18em] text-[var(--c-text-faint)]">Competition Overview</p>
        <h2 className="text-3xl font-semibold text-[var(--c-text)]">{tournament.name}</h2>
        <p className="mt-3 text-sm leading-6 text-[var(--c-text-muted)]">
          {readableSport(tournament.sport)} coverage with {tournament.match_count} public match
          {tournament.match_count === 1 ? "" : "es"} currently on the board.
        </p>
      </article>

      <div className="space-y-8">
        {groupedMatches.map(([dateLabel, matches]) => (
          <section key={dateLabel} className="space-y-4">
            <div className="border-b border-[var(--c-border)] pb-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--c-text-faint)]">
                Match Date
              </div>
              <h3 className="mt-2 text-2xl font-semibold text-[var(--c-text)]">{dateLabel}</h3>
              <p className="mt-1 text-sm text-[var(--c-text-muted)]">
                {matches.length} public match{matches.length === 1 ? "" : "es"} in this tournament section.
              </p>
            </div>

            <div className="grid gap-4">
              {matches.map((match) => (
                <Link key={match.id} href={getMatchPath(match)}>
                  <Card
                    variant="surface-2"
                    className="cursor-pointer border-[var(--c-border)] p-6 transition-all hover:border-[var(--c-accent)] hover:shadow-[0_14px_40px_rgba(0,0,0,0.22)]"
                  >
                    <div className="mb-4 flex items-center justify-between">
                      <Tag status={String(match.status)} />
                      <span className="text-sm capitalize text-[var(--c-text-faint)]">{readableSport(match.sport)}</span>
                    </div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--c-text-faint)]">
                      {matchCompetitionName(match)}
                    </div>
                    <h2 className="mt-2 mb-2 text-xl font-semibold text-[var(--c-text)]">{match.team1} vs {match.team2}</h2>
                    <p className="text-sm text-[var(--c-text-muted)]">{matchTimeLabel(match)}</p>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </ContentPage>
  );
}
