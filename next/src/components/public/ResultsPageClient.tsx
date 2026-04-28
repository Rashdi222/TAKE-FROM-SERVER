"use client";

import NextImage from "next/image";
import { useMemo, useState } from "react";
import { CheckCircle2, Clock3, Ban, History } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { publicApi, type Match } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { PublicMatchGroup } from "@/components/public/matches/PublicMatchGroup";
import { SPORTBOOK_SPORTS } from "@/components/user/sportsbook/sports";
import {
  SPORT_OPTIONS,
  groupMatchesByDate,
  isRenderablePublicMatch,
  readableSport,
} from "@/lib/public-matches/lobby";

type ResultsStatus = "settled" | "closed" | "cancelled";

const RESULT_TABS: Array<{
  id: ResultsStatus;
  label: string;
  icon: typeof CheckCircle2;
  tone: string;
  emptyTitle: string;
  emptyBody: string;
}> = [
  {
    id: "settled",
    label: "Settled",
    icon: CheckCircle2,
    tone: "border-emerald-500/30 bg-emerald-500/12 text-emerald-200",
    emptyTitle: "No settled matches yet",
    emptyBody: "Settled boards and completed fixtures will land here once the result workflow finishes.",
  },
  {
    id: "closed",
    label: "Closed",
    icon: Clock3,
    tone: "border-amber-500/30 bg-amber-500/12 text-amber-200",
    emptyTitle: "No recently closed matches",
    emptyBody: "Closed markets waiting for settlement appear here before they move into settled results.",
  },
  {
    id: "cancelled",
    label: "Cancelled",
    icon: Ban,
    tone: "border-rose-500/30 bg-rose-500/12 text-rose-200",
    emptyTitle: "No cancelled matches",
    emptyBody: "Cancelled fixtures will appear here if a feed or operator voids a board.",
  },
];

export function ResultsPageClient() {
  const [status, setStatus] = useState<ResultsStatus>("settled");
  const [sport, setSport] = useState<string>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["matches", "results", { status, sport }],
    queryFn: () =>
      publicApi.matches.list({
        status,
        sport: sport === "all" ? undefined : sport,
        quality_mode: "public",
        limit: 150,
      }),
    staleTime: 30_000,
  });

  const matches = useMemo(
    () => (data?.data || []).filter((match) => isRenderablePublicMatch(match) || match.status === "cancelled"),
    [data?.data],
  );

  const grouped = useMemo(() => groupMatchesByDate(matches), [matches]);
  const activeTab = RESULT_TABS.find((tab) => tab.id === status) ?? RESULT_TABS[0];

  return (
    <div className="space-y-6">
      <Card
        variant="surface-2"
        className="border-[var(--c-border-strong)] bg-[radial-gradient(circle_at_top_left,rgba(68,211,190,0.12),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.01))] p-5 sm:p-6"
      >
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--c-text-faint)]">
              Results Archive
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-[var(--c-text)] sm:text-5xl">
              Completed boards and recent decisions.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--c-text-muted)] sm:text-base">
              Browse settled, closed, and cancelled fixtures without mixing them back into the active sportsbook surface.
            </p>
          </div>

          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--c-border)] bg-[rgba(255,255,255,0.04)] px-4 py-2 text-sm text-[var(--c-text-muted)]">
            <History className="h-4.5 w-4.5 text-cyan-300" />
            {matches.length} archived match{matches.length === 1 ? "" : "es"}
          </div>
        </div>
      </Card>

      <Card variant="surface-1" className="sticky top-0 z-20 overflow-visible border-[var(--c-border-strong)] bg-[rgba(10,13,22,0.84)] p-4 shadow-[0_18px_48px_rgba(0,0,0,0.26)] backdrop-blur-xl sm:p-5">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {RESULT_TABS.map((tab) => {
              const Icon = tab.icon;
              const active = tab.id === status;

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatus(tab.id)}
                  className={[
                    "inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-semibold transition-all duration-200",
                    active
                      ? `${tab.tone} shadow-[0_12px_30px_rgba(0,0,0,0.22)]`
                      : "border-[var(--c-border)] bg-[rgba(255,255,255,0.03)] text-[var(--c-text-muted)] hover:-translate-y-0.5 hover:border-[var(--c-accent)] hover:text-[var(--c-text)]",
                  ].join(" ")}
                >
                  <Icon className="h-4.5 w-4.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            {SPORT_OPTIONS.map((option) => {
              const active = option.id === sport;
              const sportCard = SPORTBOOK_SPORTS.find((item) => item.id === option.id);
              if (option.id === "all") {
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setSport(option.id)}
                    className={[
                      "group relative min-h-12 shrink-0 overflow-hidden rounded-full border px-4 py-2 text-sm font-medium transition-all duration-200",
                      active
                        ? "border-[var(--c-accent)] shadow-[0_10px_28px_rgba(58,139,255,0.18)]"
                        : "border-[var(--c-border)] hover:border-[var(--c-accent)] hover:text-[var(--c-text)]",
                    ].join(" ")}
                  >
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(58,139,255,0.28),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(99,32,232,0.22),transparent_40%),linear-gradient(180deg,rgba(17,24,39,0.64),rgba(8,10,18,0.86))]" />
                    <span className="relative z-10 text-white">All</span>
                  </button>
                );
              }

              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setSport(option.id)}
                  className={[
                    "group relative min-h-12 shrink-0 overflow-hidden rounded-full border px-4 py-2 text-sm font-medium transition-all duration-200",
                    active
                      ? "border-[var(--c-accent)] shadow-[0_10px_28px_rgba(58,139,255,0.18)]"
                      : "border-[var(--c-border)] hover:border-[var(--c-accent)] hover:text-[var(--c-text)]",
                  ].join(" ")}
                >
                  {sportCard ? (
                    <>
                      <NextImage
                        src={sportCard.image}
                        alt={sportCard.label}
                        fill
                        className="object-cover object-center opacity-30 transition-transform duration-300 group-hover:scale-[1.06]"
                        sizes="140px"
                      />
                      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(10,13,22,0.18),rgba(8,10,18,0.86))]" />
                    </>
                  ) : null}
                  <span className="relative z-10 text-white">{option.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      {isLoading ? (
        <Card variant="surface-1" className="p-6 text-sm text-[var(--c-text-muted)]">
          Loading archived matches...
        </Card>
      ) : grouped.length === 0 ? (
        <Card variant="surface-1" className="p-8 text-center">
          <div className="text-lg font-semibold text-[var(--c-text)]">{activeTab.emptyTitle}</div>
          <p className="mt-2 text-sm text-[var(--c-text-muted)]">{activeTab.emptyBody}</p>
        </Card>
      ) : (
        <div className="space-y-8">
          {grouped.map(([title, items]) => (
            <PublicMatchGroup
              key={title}
              title={title}
              subtitle={`${readableSport(sport === "all" ? items[0]?.sport || "cricket" : sport)} archive · ${items.length} match${items.length === 1 ? "" : "es"}`}
              matches={items as Match[]}
              accent="default"
            />
          ))}
        </div>
      )}
    </div>
  );
}
