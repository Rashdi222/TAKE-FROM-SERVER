import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { SPORT_HUBS } from "@/lib/seo/public-content";

export function SportsHubGrid() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {SPORT_HUBS.map((sport) => (
        <Link key={sport.slug} href={`/sports/${sport.slug}`}>
          <Card
            variant="surface-2"
            className="h-full cursor-pointer p-6 transition-colors hover:border-[var(--c-accent)]"
          >
            <h2 className="mb-3 text-2xl font-semibold text-[var(--c-text)]">
              {sport.title}
            </h2>
            <p className="mb-4 text-sm leading-6 text-[var(--c-text-muted)]">
              {sport.summary}
            </p>
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--c-text-faint)]">
              Markets
            </p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {sport.markets.map((market) => (
                <li
                  key={market}
                  className="rounded-full border border-[var(--c-border)] px-3 py-1 text-xs text-[var(--c-text-muted)]"
                >
                  {market}
                </li>
              ))}
            </ul>
          </Card>
        </Link>
      ))}
    </div>
  );
}

