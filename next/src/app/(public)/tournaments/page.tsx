import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { ContentPage } from "@/components/public/ContentPage";
import { buildPublicMetadata } from "@/lib/seo/metadata";
import { fetchPublicTournaments } from "@/lib/seo/public-data";
import { groupTournamentsBySport, readableSport } from "@/lib/public-matches/lobby";

export const metadata: Metadata = buildPublicMetadata({
  title: "Tournaments and Competition Coverage",
  description:
    "Browse public tournament and competition pages for imported sports coverage on Sixerbat.",
  path: "/tournaments",
  keywords: ["sports tournaments", "betting tournaments", "competition pages"],
});

export default async function TournamentsPage() {
  const tournaments = await fetchPublicTournaments();
  const groupedTournaments = groupTournamentsBySport(tournaments);

  return (
    <ContentPage
      eyebrow="Tournaments"
      title="Tournament and Competition Coverage"
      description="These pages organize public match coverage around imported competition feeds and upcoming event schedules."
    >
      <div className="mb-8 rounded-[var(--r-lg)] border border-[var(--c-border-strong)] bg-[radial-gradient(circle_at_top_left,rgba(225,64,64,0.08),transparent_38%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))] p-6">
        <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--c-text-faint)]">
          Coverage Board
        </div>
        <h2 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-[var(--c-text)]">
          Browse tournaments the same way you browse the live lobby.
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--c-text-muted)]">
          Move by competition first, then drill into the published match board for that tournament.
        </p>
      </div>

      <div className="space-y-10">
        {groupedTournaments.map(([sportLabel, items]) => (
          <section key={sportLabel} className="space-y-4">
            <div className="border-b border-[var(--c-border)] pb-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--c-text-faint)]">
                Sport
              </div>
              <h3 className="mt-2 text-2xl font-semibold text-[var(--c-text)]">{sportLabel}</h3>
              <p className="mt-1 text-sm text-[var(--c-text-muted)]">
                {items.length} competition{items.length === 1 ? "" : "ies"} in this public section.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {items.map((tournament) => (
                <Link
                  key={tournament.id}
                  href={`/tournaments/${tournament.id}/${tournament.slug}`}
                >
                  <Card
                    variant="surface-2"
                    className="h-full cursor-pointer border-[var(--c-border)] p-6 transition-all hover:border-[var(--c-accent)] hover:shadow-[0_14px_40px_rgba(0,0,0,0.22)]"
                  >
                    <p className="mb-2 text-xs uppercase tracking-[0.18em] text-[var(--c-text-faint)]">
                      {readableSport(tournament.sport)}
                    </p>
                    <h2 className="mb-2 text-2xl font-semibold text-[var(--c-text)]">{tournament.name}</h2>
                    <p className="text-sm text-[var(--c-text-muted)]">
                      {tournament.match_count} matches on the public board
                    </p>
                    {tournament.next_match_time && (
                      <p className="mt-4 text-xs text-[var(--c-text-faint)]">
                        Next match: {new Date(tournament.next_match_time).toLocaleString()}
                      </p>
                    )}
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
