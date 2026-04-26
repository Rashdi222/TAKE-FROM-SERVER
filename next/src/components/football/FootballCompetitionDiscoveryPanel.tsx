"use client";

import Image from "next/image";
import { useCallback, useMemo, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import type { CompetitionFeed, FootballCompetitionDiscoveryItem } from "@/lib/api";

export function FootballCompetitionDiscoveryPanel({
  competitions,
  existingFeeds,
  onRefresh,
  onCreateAndImport,
  refreshing,
}: {
  competitions: FootballCompetitionDiscoveryItem[];
  existingFeeds: CompetitionFeed[];
  onRefresh: () => Promise<void>;
  onCreateAndImport: (competition: FootballCompetitionDiscoveryItem) => Promise<void>;
  refreshing?: boolean;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string>("");
  const [featuredOnly, setFeaturedOnly] = useState<boolean>(false);
  const [search, setSearch] = useState("");
  const [oddsOnly, setOddsOnly] = useState(false);
  const currentYear = new Date().getUTCFullYear();

  const featuredLeagueMatchers = useMemo(
    () => [
      "premier league",
      "la liga",
      "serie a",
      "bundesliga",
      "ligue 1",
      "champions league",
      "europa league",
      "conference league",
      "world cup",
      "euro",
      "copa america",
    ],
    [],
  );

  const isCurrentOrRecentSeason = useCallback((item: FootballCompetitionDiscoveryItem) => {
    const rawSeason = item.season_label ?? item.season_id ?? "";
    const match = String(rawSeason).match(/\d{4}/);
    if (!match) return true;
    const year = Number(match[0]);
    if (!Number.isFinite(year)) return true;
    return year >= currentYear - 1;
  }, [currentYear]);

  const grouped = useMemo(() => {
    const filtered = competitions.filter((item) => {
      const label = `${item.display_name ?? item.name} ${item.country_name ?? ""} ${item.season_label ?? item.season_id ?? ""}`.toLowerCase();
      const matchesFeatured =
        !featuredOnly || featuredLeagueMatchers.some((matcher) => label.includes(matcher));
      const matchesSeason = !featuredOnly || isCurrentOrRecentSeason(item);
      const matchesSearch = !search.trim() || label.includes(search.trim().toLowerCase());
      const matchesOdds = !oddsOnly || item.odds_coverage === true;
      return matchesFeatured && matchesSeason && matchesSearch && matchesOdds;
    });

    return filtered.reduce<Record<string, FootballCompetitionDiscoveryItem[]>>((acc, item) => {
      const key = item.category_label || "Other";
      acc[key] = acc[key] ?? [];
      acc[key].push(item);
      return acc;
    }, {});
  }, [competitions, featuredLeagueMatchers, featuredOnly, isCurrentOrRecentSeason, oddsOnly, search]);

  const featuredCompetitions = useMemo(
    () =>
      competitions.filter((item) => {
        const label = `${item.display_name ?? item.name} ${item.country_name ?? ""}`.toLowerCase();
        return featuredLeagueMatchers.some((matcher) => label.includes(matcher)) && isCurrentOrRecentSeason(item);
      }),
    [competitions, featuredLeagueMatchers, isCurrentOrRecentSeason],
  );

  const existingByLeagueSeason = useMemo(() => {
    return new Set(
      existingFeeds
        .filter((feed) => feed.provider?.name === "api_sports")
        .map((feed) => `${feed.league_id ?? ""}:${feed.season_id ?? ""}`),
    );
  }, [existingFeeds]);

  const handleCreateAndImport = async (competition: FootballCompetitionDiscoveryItem) => {
    setBusyId(competition.id);
    setError("");

    try {
      await onCreateAndImport(competition);
    } catch {
      setError(`Unable to add ${competition.display_name ?? competition.name} right now.`);
    } finally {
      setBusyId(null);
    }
  };

  const handleRefresh = async () => {
    setError("");

    try {
      await onRefresh();
    } catch {
      setError("Unable to refresh the football league catalog right now.");
    }
  };

  return (
    <Card variant="surface-2" className="p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[var(--c-text)]">API-Football League Discovery</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--c-text-muted)]">
            Browse football league seasons from the provider, then create and import league feeds without manually typing league and season values. This panel lists competitions, not individual upcoming matches.
          </p>
        </div>

        <Button variant="secondary" onClick={() => void handleRefresh()} disabled={refreshing}>
          {refreshing ? "Refreshing..." : "Refresh Catalog"}
        </Button>
      </div>

      {error ? <Alert variant="error" className="mt-4">{error}</Alert> : null}

      {competitions.length === 0 ? (
        <div className="mt-5 rounded-[var(--r-card)] border border-dashed border-[var(--c-border)] p-5 text-sm text-[var(--c-text-muted)]">
          No football competitions are cached yet. Refresh the catalog after confirming the `api_sports` provider is enabled with a valid API key.
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-end">
            <Input
              label="Search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="League, country, or season"
            />
            <label className="flex items-center gap-3 rounded-[var(--r-card)] border border-[var(--c-border)] px-4 py-3 text-sm text-[var(--c-text)]">
              <input type="checkbox" checked={featuredOnly} onChange={(event) => setFeaturedOnly(event.target.checked)} />
              Featured Only
            </label>
            <label className="flex items-center gap-3 rounded-[var(--r-card)] border border-[var(--c-border)] px-4 py-3 text-sm text-[var(--c-text)]">
              <input type="checkbox" checked={oddsOnly} onChange={(event) => setOddsOnly(event.target.checked)} />
              Odds Coverage Only
            </label>
          </div>

          <Alert variant="info">
            If a feed creates successfully but imports zero matches, the current API-Sports plan may not include fixture access for that league season. In that case the tabs stay empty because no rows are imported into the football match table.
          </Alert>

          {featuredCompetitions.length > 0 ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--c-text-faint)]">
                  Featured Leagues
                </h3>
                <div className="flex gap-2">
                  <Button variant={featuredOnly ? "primary" : "secondary"} onClick={() => setFeaturedOnly((current) => !current)}>
                    {featuredOnly ? "Show All" : "Featured Only"}
                  </Button>
                </div>
              </div>

              <div className="flex gap-2 overflow-x-auto pb-1">
                {featuredCompetitions.slice(0, 10).map((competition) => (
                  <button
                    key={`featured-${competition.id}`}
                    type="button"
                    onClick={() => setFeaturedOnly(true)}
                    className="shrink-0 rounded-[var(--r-pill)] border border-[var(--c-border)] bg-[color:color-mix(in_srgb,var(--c-surface-1)_90%,transparent)] px-3 py-2 text-sm text-[var(--c-text)]"
                  >
                    {competition.display_name ?? competition.name}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {Object.entries(grouped).map(([group, items]) => (
            <div key={group} className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--c-text-faint)]">
                  {group}
                </h3>
                <span className="text-xs text-[var(--c-text-faint)]">{items.length} leagues</span>
              </div>

              <div className="grid gap-3 xl:grid-cols-2">
                {items.map((competition) => {
                  const exists = existingByLeagueSeason.has(`${competition.league_id}:${competition.season_id ?? ""}`);
                  const pending = busyId === competition.id;

                  return (
                    <div
                      key={competition.id}
                      className="rounded-[var(--r-card)] border border-[var(--c-border)] bg-[color:color-mix(in_srgb,var(--c-surface-1)_90%,transparent)] p-4"
                    >
                      <div className="flex gap-4">
                        {competition.logo_url ? (
                          <Image
                            src={competition.logo_url}
                            alt={competition.display_name ?? competition.name}
                            width={48}
                            height={48}
                            className="h-12 w-12 rounded-[var(--r-md)] border border-[var(--c-border)] bg-[var(--c-surface-1)] object-contain p-1"
                          />
                        ) : null}

                        <div className="min-w-0 flex-1">
                          <p className="text-base font-semibold text-[var(--c-text)]">
                            {competition.display_name ?? competition.name}
                          </p>
                          <p className="mt-1 text-sm text-[var(--c-text-muted)]">
                            {competition.country_name || competition.category_label}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-2 text-xs text-[var(--c-text-faint)] md:grid-cols-2">
                        <div>League ID: {competition.league_id}</div>
                        <div>Season: {competition.season_label ?? competition.season_id ?? "-"}</div>
                        <div>Feed key: {competition.competition_key}</div>
                        <div>Provider: API-Sports</div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <CoverageBadge
                          label="Fixtures"
                          enabled={competition.fixture_coverage !== false}
                        />
                        <CoverageBadge
                          label="Live Events"
                          enabled={competition.live_coverage === true}
                        />
                        <CoverageBadge
                          label="Odds"
                          enabled={competition.odds_coverage === true}
                        />
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {exists ? (
                          <span className="rounded-[var(--r-pill)] bg-[var(--c-accent-soft)] px-3 py-2 text-xs font-medium text-[var(--c-text)]">
                            Feed already added
                          </span>
                        ) : (
                          <Button
                            variant="primary"
                            onClick={() => void handleCreateAndImport(competition)}
                            disabled={pending}
                          >
                            {pending ? "Adding..." : "Create Feed + Import"}
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function CoverageBadge({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <span
      className={[
        "rounded-[var(--r-pill)] border px-3 py-2 text-xs font-medium",
        enabled
          ? "border-[rgba(68,211,190,0.24)] bg-[rgba(68,211,190,0.12)] text-emerald-200"
          : "border-[rgba(255,184,77,0.24)] bg-[rgba(255,184,77,0.1)] text-amber-200",
      ].join(" ")}
    >
      {label}: {enabled ? "Available" : "Limited"}
    </span>
  );
}
