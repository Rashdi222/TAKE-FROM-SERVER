"use client";

import Image from "next/image";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Tag } from "@/components/ui/Tag";
import { getMatchPath } from "@/lib/seo/match";
import type { Match } from "@/lib/api";
import {
  matchCompetitionName,
  matchContextChips,
  matchMetaLine,
  matchScoreSummary,
  matchStatusTone,
  matchTimeLabel,
  readableSport,
} from "@/lib/public-matches/lobby";

type PublicMatchCardProps = {
  match: Match;
};

export function PublicMatchCard({ match }: PublicMatchCardProps) {
  const isLive = match.status === "live";
  const meta = matchMetaLine(match);
  const scoreSummary = matchScoreSummary(match);
  const chips = matchContextChips(match);
  const tone = matchStatusTone(match);
  const isFootball = match.sport === "football";
  const highlightChip =
    isLive && isFootball
      ? chips.find((chip) => chip.includes("'")) || chips[0]
      : null;
  const supportingChips = highlightChip ? chips.filter((chip) => chip !== highlightChip) : chips;

  return (
    <Link href={getMatchPath(match)} className="block">
      <Card
        variant="surface-2"
        className={[
          "group relative h-full overflow-hidden border-[var(--c-border)] p-3.5 transition-all duration-300 sm:p-4",
          "hover:-translate-y-1 hover:border-[var(--c-accent)] hover:shadow-[0_18px_44px_rgba(0,0,0,0.24)]",
          tone === "live"
            ? "bg-[radial-gradient(circle_at_top_right,rgba(255,77,79,0.18),transparent_34%),linear-gradient(180deg,rgba(255,77,79,0.12),rgba(255,255,255,0.02))] before:pointer-events-none before:absolute before:right-4 before:top-4 before:h-2.5 before:w-2.5 before:rounded-full before:bg-[rgba(255,77,79,0.88)] before:shadow-[0_0_0_0_rgba(255,77,79,0.48)] before:animate-[ping_2.4s_ease-out_infinite]"
            : "",
          tone === "upcoming"
            ? "bg-[radial-gradient(circle_at_top_left,rgba(58,139,255,0.14),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))]"
            : "",
        ].join(" ")}
      >
        <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-[rgba(255,255,255,0.24)] to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--c-text-faint)]">
              {matchCompetitionName(match)}
            </div>
            <div className="mt-1 text-xs font-medium text-[var(--c-text-muted)]">
              {readableSport(match.sport)}
            </div>
          </div>
          <Tag status={match.status} className="shrink-0" />
        </div>

        <div className="mt-3.5 space-y-2.5">
          <TeamRow label={String(match.team1 ?? "-")} logo={match.team1_logo} accent={tone === "live"} />
          <TeamRow label={String(match.team2 ?? "-")} logo={match.team2_logo} accent={tone === "live"} />
        </div>

        {isLive && scoreSummary ? (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-[rgba(255,77,79,0.24)] bg-[rgba(255,77,79,0.1)] px-3 py-1.5 text-xs font-semibold text-[var(--c-danger)]">
              {scoreSummary}
            </span>
            {highlightChip ? (
              <span className="inline-flex items-center rounded-full border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.04)] px-3 py-1.5 text-xs font-semibold text-[var(--c-text)]">
                {highlightChip}
              </span>
            ) : null}
          </div>
        ) : null}

        {supportingChips.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {supportingChips.map((chip) => (
              <span
                key={chip}
                className={[
                  "rounded-full border px-2.5 py-1 text-[11px] font-medium",
                  isLive
                    ? "border-[rgba(255,77,79,0.22)] bg-[rgba(255,77,79,0.08)] text-[var(--c-text-muted)]"
                    : "border-[var(--c-border)] bg-[var(--c-surface-1)] text-[var(--c-text-muted)]",
                ].join(" ")}
              >
                {chip}
              </span>
            ))}
          </div>
        ) : null}

        <div className="mt-4.5 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-[var(--c-text)]">{matchTimeLabel(match)}</div>
            {!isLive && meta ? <div className="mt-1 truncate text-xs text-[var(--c-text-muted)]">{meta}</div> : null}
          </div>
          <div
            className={[
              "shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] transition-colors",
              isLive
                ? "border-[rgba(255,77,79,0.22)] text-[var(--c-danger)] group-hover:border-[var(--c-danger)]"
                : "border-[var(--c-border)] text-[var(--c-text-muted)] group-hover:border-[var(--c-accent)] group-hover:text-[var(--c-text)]",
            ].join(" ")}
          >
            {isLive ? "Open Live" : "View Odds"}
          </div>
        </div>
      </Card>
    </Link>
  );
}

function TeamRow({ label, logo, accent }: { label: string; logo?: string | null; accent?: boolean }) {
  return (
    <div
      className={[
        "flex items-center gap-3 rounded-[1.15rem] border px-3 py-2.5",
        accent
          ? "border-[rgba(255,77,79,0.18)] bg-[rgba(255,255,255,0.03)]"
          : "border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.025)]",
      ].join(" ")}
    >
      {logo ? (
        <Image
          src={logo}
          alt={label}
          width={36}
          height={36}
          className="h-9 w-9 rounded-full border border-[var(--c-border)] bg-[var(--c-surface-1)] object-cover"
        />
      ) : (
        <div className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--c-border)] bg-[var(--c-surface-1)] text-[11px] font-bold uppercase text-[var(--c-text-faint)]">
          {label.slice(0, 2)}
        </div>
      )}
      <div className="min-w-0 truncate text-[15px] font-semibold text-[var(--c-text)] sm:text-base">{label}</div>
    </div>
  );
}
