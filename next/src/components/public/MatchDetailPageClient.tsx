"use client";

import Image from "next/image";
import Link from "next/link";
import { type ReactNode, useMemo, useState, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { publicApi, Match, Odds } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Tag } from "@/components/ui/Tag";
import { Button } from "@/components/ui/Button";
import { BetSlip } from "@/components/bets/BetSlip";
import { CricketPrematchBoard } from "@/components/cricket/prematch/CricketPrematchBoard";
import { FootballPrematchBoard } from "@/components/football/prematch/FootballPrematchBoard";
import { LiveCricketMatchDashboard } from "@/components/live-cricket/LiveCricketMatchDashboard";
import { LiveFootballMatchDashboard } from "@/components/live-football/LiveFootballMatchDashboard";
import {
  formatPublicMarketLabel,
  formatPublicOutcomeLabel,
  matchCompetitionName,
  matchContextChips,
  matchMetaLine,
  matchScoreSummary,
  matchTimeLabel,
  readableSport,
  sortPublicMarketGroups,
} from "@/lib/public-matches/lobby";
import { formatDecimal } from "@/lib/format";
import { isCricketPrematchLike } from "@/lib/cricket/cricketContext";
import { isFootballPrematchLike } from "@/lib/football/footballContext";
import { isMatchLiveForDisplay } from "@/lib/matches/liveStatus";

type MatchDetailPageClientProps = {
  matchId: string;
  initialMatch: Match | null;
  initialOdds: Odds[];
  embedded?: boolean;
  embeddedView?: "board" | "hud" | "hud-only" | "board-only";
};

export function MatchDetailPageClient({
  matchId,
  initialMatch,
  initialOdds,
  embedded = false,
  embeddedView = "board",
}: MatchDetailPageClientProps) {
  const [selectedOdds, setSelectedOdds] = useState<Odds | null>(null);
  const [slipOpen, setSlipOpen] = useState(false);
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const supportsRealtimeSport =
    initialMatch?.sport === "cricket" || initialMatch?.sport === "football";
  const enableEmbeddedLivePolling = embedded && !supportsRealtimeSport;

  const { data: matchData, isLoading: matchLoading } = useQuery({
    queryKey: ["match", matchId],
    queryFn: () => publicApi.matches.get(matchId),
    initialData: initialMatch ? { data: initialMatch } : undefined,
    refetchOnMount: true,
    refetchInterval: enableEmbeddedLivePolling ? 3_000 : false,
    staleTime: 0,
  });

  const oddsQuery = useQuery({
    queryKey: ["odds", matchId],
    queryFn: () => publicApi.matches.odds(matchId),
    initialData: { data: initialOdds },
    refetchOnMount: true,
    refetchInterval: enableEmbeddedLivePolling ? 3_000 : false,
    staleTime: 0,
  });

  const fetchedMatch = (matchData as { data?: Match } | undefined)?.data;
  const match = useMemo(
    () => resolveEmbeddedMatchState(initialMatch, fetchedMatch, embedded),
    [embedded, fetchedMatch, initialMatch],
  );
  const odds = useMemo(() => {
    const value = (oddsQuery.data as { data?: unknown } | undefined)?.data;
    return Array.isArray(value) ? (value as Odds[]) : [];
  }, [oddsQuery.data]);

  const oddsInitialFetchPending =
    !oddsQuery.isFetched && (oddsQuery.isLoading || oddsQuery.isFetching);
  const oddsHydrationPending =
    embedded && initialOdds.length === 0 && odds.length === 0 && oddsInitialFetchPending;
  const oddsLoadFailed = embedded && odds.length === 0 && oddsQuery.isError;

  const groupedOdds = useMemo(() => {
    const groups = new Map<string, Odds[]>();

    for (const odd of odds) {
      const key = String(odd.source_market_key || odd.market || odd.bet_type || "Market");
      const bucket = groups.get(key) || [];
      bucket.push(odd);
      groups.set(key, bucket);
    }

    return sortPublicMarketGroups(match?.sport, Array.from(groups.entries()) as Array<[string, import("@/lib/public-matches/lobby").MatchOddsLike[]]>);
  }, [odds, match?.sport]);

  const marketAnchors = useMemo(
    () =>
      groupedOdds.map(([groupTitle, groupItems]) => ({
        id: marketAnchorId(groupTitle),
        title: formatPublicMarketLabel(match?.sport ?? "cricket", groupTitle, {
          selections: groupItems.map((item) => String(item.outcome || "")),
        }),
        count: groupItems.length,
      })),
    [groupedOdds, match?.sport],
  );

  const handlePlaceBet = (odd: Odds) => {
    setSelectedOdds(odd);
    setSlipOpen(true);
  };

  if (matchLoading && !match) {
    return (
      <div className={embedded ? "p-4 sm:p-5" : "mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8"}>
        <DetailSkeleton />
      </div>
    );
  }

  if (!match) {
    return (
      <div className={embedded ? "p-4 sm:p-5" : "mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8"}>
        <Card variant="surface-2" className="p-8 text-center">
          <div className="text-lg font-semibold text-[var(--c-text)]">Match not found</div>
          <p className="mt-2 text-sm text-[var(--c-text-muted)]">
            This match is not available on the public board right now.
          </p>
          <div className="mt-5">
            <Link href="/matches" className="text-sm font-semibold text-[var(--c-accent)]">
              Back to matches
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  const layoutClass = embedded
    ? "flex flex-col gap-6 p-4 sm:p-5 lg:p-6"
    : "mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-10";

  const competitionName = matchCompetitionName(match);
  const contextChips = matchContextChips(match);
  const liveScore = matchScoreSummary(match);
  const metaLine = matchMetaLine(match);
  const isLive = isMatchLiveForDisplay(match);
  const useLiveCricketDashboard = match.sport === "cricket" && isLive;
  const showFootballPrematchBoard = isFootballPrematchLike(match);
  const useLiveFootballDashboard = match.sport === "football" && isLive && !showFootballPrematchBoard;
  const showCricketPrematchBoard = isCricketPrematchLike(match);
  const liveMinuteChip = match.sport === "football" ? contextChips.find((chip) => chip.includes("'")) : null;
  const otherContextChips = liveMinuteChip ? contextChips.filter((chip) => chip !== liveMinuteChip) : contextChips;

  if (useLiveCricketDashboard) {
    if (!hydrated) {
      return <LiveMatchHydrationShell />;
    }
    return (
      <LiveCricketMatchDashboard
        match={match}
        initialOdds={odds}
        embedded={embedded}
        displayMode={embeddedView === "hud-only" ? "hud-only" : embeddedView === "board-only" ? "board-only" : "full"}
        oddsHydrationPending={oddsHydrationPending}
        oddsLoadFailed={oddsLoadFailed}
      />
    );
  }

  if (useLiveFootballDashboard) {
    if (!hydrated) {
      return <LiveMatchHydrationShell />;
    }
    return (
      <LiveFootballMatchDashboard
        match={match}
        initialOdds={odds}
        embedded={embedded}
        displayMode={embeddedView === "hud-only" ? "hud-only" : embeddedView === "board-only" ? "board-only" : "full"}
        oddsHydrationPending={oddsHydrationPending}
        oddsLoadFailed={oddsLoadFailed}
      />
    );
  }

  return (
    <div className={layoutClass}>
      <Card
        variant="surface-2"
        className="overflow-hidden border-[var(--c-border-strong)] bg-[radial-gradient(circle_at_top_left,rgba(225,64,64,0.12),transparent_36%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.01))]"
      >
        <div className="grid gap-8 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_280px] lg:p-8">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <Tag status={match.status} />
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--c-text-faint)]">
                {competitionName}
              </div>
              <div className="text-xs font-medium text-[var(--c-text-muted)]">{readableSport(match.sport)}</div>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
              <TeamPanel name={String(match.team1 ?? "-")} logo={match.team1_logo} align="left" />
              <div className="text-center">
                <div className="text-xs font-semibold uppercase tracking-[0.26em] text-[var(--c-text-faint)]">
                  Match Board
                </div>
                <div className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[var(--c-text)] sm:text-3xl">
                  vs
                </div>
                {isLive && liveScore ? (
                  <div className="mt-3 inline-flex rounded-full border border-[rgba(255,77,79,0.24)] bg-[rgba(255,77,79,0.12)] px-3 py-1.5 text-sm font-semibold text-[var(--c-danger)]">
                    {liveScore}
                  </div>
                ) : null}
              </div>
              <TeamPanel name={String(match.team2 ?? "-")} logo={match.team2_logo} align="right" />
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              <Chip>{matchTimeLabel(match)}</Chip>
              {otherContextChips.map((chip) => (
                <Chip key={chip}>{chip}</Chip>
              ))}
              {!contextChips.length && metaLine ? <Chip>{metaLine}</Chip> : null}
            </div>
          </div>

          <div className="grid gap-3 self-start">
            <StatCard label="Markets" value={String(groupedOdds.length)} />
            <StatCard label="Selections" value={String(odds.length)} />
            <StatCard label="Board" value={isLive ? "In Play" : "Pre Match"} />
          </div>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          {showCricketPrematchBoard ? <CricketPrematchBoard match={match} /> : null}
          {showFootballPrematchBoard ? <FootballPrematchBoard match={match} /> : null}

          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--c-text-faint)]">
                {showCricketPrematchBoard || showFootballPrematchBoard ? "Opening Markets" : "Available Markets"}
              </div>
              <h2 className="mt-2 text-2xl font-semibold text-[var(--c-text)]">
                {showCricketPrematchBoard || showFootballPrematchBoard ? "Pre-match board" : "Published odds on this match"}
              </h2>
            </div>
          </div>

          {marketAnchors.length > 1 ? (
            <div className="overflow-x-auto pb-1">
              <div className="flex min-w-max gap-2">
                {marketAnchors.map((anchor) => (
                  <a
                    key={anchor.id}
                    href={`#${anchor.id}`}
                    className="inline-flex items-center gap-2 rounded-full border border-[var(--c-border)] bg-[rgba(255,255,255,0.04)] px-3 py-1.5 text-xs font-semibold text-[var(--c-text-muted)] transition hover:border-[var(--c-accent)] hover:text-[var(--c-text)]"
                  >
                    <span className="truncate max-w-[12rem]">{anchor.title}</span>
                    <span className="rounded-full bg-[rgba(255,255,255,0.08)] px-1.5 py-0.5 text-[10px] font-semibold">
                      {anchor.count}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          ) : null}

          {oddsHydrationPending ? (
            <DetailSkeleton />
          ) : oddsLoadFailed ? (
            <Card variant="surface-1" className="p-8 text-center">
              <div className="text-lg font-semibold text-[var(--c-text)]">Unable to load markets right now</div>
              <p className="mt-2 text-sm text-[var(--c-text-muted)]">
                The match board is still available, but the live market feed did not hydrate successfully. Retry in a
                moment.
              </p>
            </Card>
          ) : oddsQuery.isLoading && odds.length === 0 ? (
            embedded ? (
              <Card variant="surface-1" className="p-8 text-center">
                <div className="text-lg font-semibold text-[var(--c-text)]">
                  Syncing market feed
                </div>
                <p className="mt-2 text-sm text-[var(--c-text-muted)]">
                  Prematch prices are being requested. This panel will update automatically.
                </p>
              </Card>
            ) : (
            <DetailSkeleton />
            )
          ) : groupedOdds.length === 0 ? (
            <Card variant="surface-1" className="p-8 text-center">
              <div className="text-lg font-semibold text-[var(--c-text)]">
                {showCricketPrematchBoard || showFootballPrematchBoard
                  ? "Markets are being prepared for this match"
                  : "No published odds right now"}
              </div>
              <p className="mt-2 text-sm text-[var(--c-text-muted)]">
                {showCricketPrematchBoard
                  ? "Check back closer to the first ball. The board will light up here as soon as trading opens."
                  : showFootballPrematchBoard
                    ? "Check back closer to kickoff. The board will light up here as soon as trading opens."
                    : "Markets will appear here once they are published to the public board."}
              </p>
            </Card>
          ) : (
            <div className="space-y-4">
              {groupedOdds.map(([groupTitle, groupItems]) => (
                <Card
                  key={groupTitle}
                  id={marketAnchorId(groupTitle)}
                  variant="surface-1"
                  className="scroll-mt-28 overflow-hidden"
                >
                  <div className="border-b border-[var(--c-border)] px-4 py-3 sm:px-5 sm:py-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--c-text-faint)]">
                          Market
                        </div>
                        <h3 className="mt-1 text-base font-semibold text-[var(--c-text)] sm:text-lg">
                          {formatPublicMarketLabel(match.sport, groupTitle, {
                            selections: groupItems.map((item) => String(item.outcome || "")),
                          })}
                        </h3>
                      </div>
                      <div className="rounded-full border border-[var(--c-border)] bg-[rgba(255,255,255,0.04)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--c-text-faint)]">
                        {groupItems.length} selections
                      </div>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full border-separate border-spacing-0">
                      <thead>
                        <tr className="bg-[rgba(255,255,255,0.02)]">
                          <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--c-text-faint)] sm:px-5">
                            Selection
                          </th>
                          <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--c-text-faint)] sm:px-5">
                            Odds
                          </th>
                          <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--c-text-faint)] sm:px-5">
                            Action
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {groupItems.map((odd) => (
                          <tr
                            key={odd.id}
                            className="border-t border-[var(--c-border)] hover:bg-[rgba(255,255,255,0.02)]"
                          >
                            <td className="min-w-[220px] px-4 py-3 align-top sm:px-5 sm:py-4">
                              <div className="text-sm font-semibold text-[var(--c-text)]">
                                {formatPublicOutcomeLabel(
                                  match.sport,
                                  String(odd.outcome || odd.market || "Selection"),
                                  String(odd.source_market_key || odd.bet_type || odd.market || ""),
                                  match.team1,
                                  match.team2,
                                )}
                              </div>
                              <div className="mt-1 text-xs text-[var(--c-text-muted)]">
                                Max stake {formatDecimal(odd.max_stake_amount ?? 0)}
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-right align-top font-mono text-lg font-semibold text-[var(--c-text)] sm:px-5 sm:py-4">
                              {Number(odd.odds_value ?? 0).toFixed(2)}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-right align-top sm:px-5 sm:py-4">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="rounded-full border border-[var(--c-border)] bg-[rgba(255,255,255,0.02)] px-3 text-[var(--c-text)] hover:bg-[rgba(255,255,255,0.05)]"
                                onClick={() => handlePlaceBet(odd as Odds)}
                              >
                                Bet
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <Card variant="surface-1" className="p-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--c-text-faint)]">
              Match Snapshot
            </div>
            <div className="mt-4 space-y-3 text-sm text-[var(--c-text-muted)]">
              <Row label="Competition" value={competitionName} />
              <Row label="Status" value={String(match.status)} />
              <Row label="Start" value={matchTimeLabel(match)} />
              {metaLine ? <Row label="Context" value={metaLine} /> : null}
            </div>
          </Card>

          {isLive ? (
            <Card variant="surface-1" className="p-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--c-text-faint)]">
                Live Context
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {liveScore ? <DetailChip accent="danger">{liveScore}</DetailChip> : null}
                {liveMinuteChip ? <DetailChip>{liveMinuteChip}</DetailChip> : null}
                {match.round_name ? <DetailChip>{String(match.round_name)}</DetailChip> : null}
                {match.venue_name ? <DetailChip>{String(match.venue_name)}</DetailChip> : null}
              </div>
              <p className="mt-4 text-sm leading-6 text-[var(--c-text-muted)]">
                This live board shows only currently published platform odds. If the market moves, the visible selections can change as the operator refreshes and republishes the active live lines.
              </p>
            </Card>
          ) : null}

          <Card variant="surface-1" className="p-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--c-text-faint)]">
              Betting Note
            </div>
            <p className="mt-4 text-sm leading-6 text-[var(--c-text-muted)]">
              Only active published platform odds are shown here. Drafts, archived lines, and unsupported internal
              pricing never appear on the public board.
            </p>
          </Card>
        </div>
      </div>

      <BetSlip isOpen={slipOpen} onClose={() => setSlipOpen(false)} odds={selectedOdds} />
    </div>
  );
}

function resolveEmbeddedMatchState(
  initialMatch: Match | null,
  fetchedMatch: Match | null | undefined,
  embedded: boolean,
) {
  if (!fetchedMatch) return initialMatch;
  if (!initialMatch || !embedded) return fetchedMatch;

  const initialLive = isMatchLiveForDisplay(initialMatch);
  const fetchedLive = isMatchLiveForDisplay(fetchedMatch);

  if (!initialLive || fetchedLive) {
    return {
      ...initialMatch,
      ...fetchedMatch,
      team1_logo: pickPreferredLogo(fetchedMatch.team1_logo, initialMatch.team1_logo),
      team2_logo: pickPreferredLogo(fetchedMatch.team2_logo, initialMatch.team2_logo),
      raw_data: fetchedMatch.raw_data ?? initialMatch.raw_data,
      market_state: fetchedMatch.market_state ?? initialMatch.market_state,
      suspended_markets: fetchedMatch.suspended_markets ?? initialMatch.suspended_markets,
      score: fetchedMatch.score ?? initialMatch.score,
    };
  }

  return {
    ...fetchedMatch,
    ...initialMatch,
    team1_logo: pickPreferredLogo(initialMatch.team1_logo, fetchedMatch.team1_logo),
    team2_logo: pickPreferredLogo(initialMatch.team2_logo, fetchedMatch.team2_logo),
    raw_data: initialMatch.raw_data ?? fetchedMatch.raw_data,
    market_state: initialMatch.market_state ?? fetchedMatch.market_state,
    suspended_markets: initialMatch.suspended_markets ?? fetchedMatch.suspended_markets,
    score: initialMatch.score ?? fetchedMatch.score,
  };
}

function LiveMatchHydrationShell() {
  return (
    <div className="bg-[var(--c-bg)] pb-24 lg:pb-8">
      <div className="sticky top-0 z-30 border-b border-[var(--c-border)] bg-[rgba(7,10,18,0.94)] backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="h-28 animate-pulse rounded-[var(--r-lg)] border border-[var(--c-border)] bg-[rgba(255,255,255,0.03)]" />
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="h-96 animate-pulse rounded-[var(--r-xl)] border border-[var(--c-border)] bg-[rgba(255,255,255,0.03)]" />
      </div>
    </div>
  );
}

function TeamPanel({
  name,
  logo,
  align,
}: {
  name: string;
  logo?: string | null;
  align: "left" | "right";
}) {
  const [brokenLogoSrc, setBrokenLogoSrc] = useState<string | null>(null);
  const normalizedLogo = normalizeLogo(logo);
  const resolvedLogo = normalizedLogo && brokenLogoSrc !== normalizedLogo ? normalizedLogo : null;

  return (
    <div className={["flex items-center gap-3", align === "right" ? "sm:flex-row-reverse sm:text-right" : ""].join(" ")}>
      {resolvedLogo ? (
        <Image
          src={resolvedLogo}
          alt={name}
          width={56}
          height={56}
          className="h-14 w-14 rounded-full border border-[var(--c-border)] bg-[var(--c-surface-1)] object-cover"
          onError={() => setBrokenLogoSrc(normalizedLogo)}
        />
      ) : (
        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-[var(--c-border)] bg-[var(--c-surface-1)] text-sm font-bold uppercase text-[var(--c-text-faint)]">
          {name.slice(0, 2)}
        </div>
      )}
      <div className="min-w-0">
        <div className="truncate text-xl font-semibold text-[var(--c-text)]">{name}</div>
      </div>
    </div>
  );
}

function pickPreferredLogo(primary?: string | null, secondary?: string | null) {
  return normalizeLogo(primary) || normalizeLogo(secondary) || null;
}

function normalizeLogo(value?: string | null) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("data:image/")
  ) {
    return trimmed;
  }
  return null;
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--r-md)] border border-[var(--c-border)] bg-[rgba(255,255,255,0.03)] px-4 py-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--c-text-faint)]">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-[var(--c-text)]">{value}</div>
    </div>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-[var(--c-border)] bg-[var(--c-surface-1)] px-3 py-1.5 text-xs font-medium text-[var(--c-text-muted)]">
      {children}
    </span>
  );
}

function DetailChip({
  children,
  accent = "default",
}: {
  children: ReactNode;
  accent?: "default" | "danger";
}) {
  return (
    <span
      className={[
        "rounded-full border px-3 py-1.5 text-xs font-medium",
        accent === "danger"
          ? "border-[rgba(255,77,79,0.24)] bg-[rgba(255,77,79,0.1)] text-[var(--c-danger)]"
          : "border-[var(--c-border)] bg-[var(--c-surface-1)] text-[var(--c-text-muted)]",
      ].join(" ")}
    >
      {children}
    </span>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="text-[var(--c-text-faint)]">{label}</div>
      <div className="max-w-[60%] text-right text-[var(--c-text)]">{value}</div>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {Array.from({ length: 4 }).map((_, index) => (
        <Card key={index} variant="surface-2" className="animate-pulse p-5">
          <div className="h-3 w-24 rounded bg-[var(--c-surface-1)]" />
          <div className="mt-4 h-6 w-2/3 rounded bg-[var(--c-surface-1)]" />
          <div className="mt-3 h-4 w-1/2 rounded bg-[var(--c-surface-1)]" />
          <div className="mt-6 h-10 w-full rounded bg-[var(--c-surface-1)]" />
        </Card>
      ))}
    </div>
  );
}

function marketAnchorId(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
