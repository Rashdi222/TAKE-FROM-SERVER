"use client";

import { memo, useMemo } from "react";
import Image from "next/image";
import { Activity, CalendarRange, Clock3, RadioTower, Sparkles } from "lucide-react";
import type { Match } from "@/lib/api";
import {
  matchCompetitionName,
  matchScoreSummary,
  matchTimeLabel,
  readableSport,
} from "@/lib/public-matches/lobby";
import { extractCricketContext } from "@/lib/cricket/cricketContext";
import { recentFootballSignal } from "@/lib/football/footballContext";
import { resolveServerSide } from "@/lib/tennis/liveData";
import { isMatchLiveForDisplay } from "@/lib/matches/liveStatus";

export const SportMatchCard = memo(function SportMatchCard({
  match,
  selected,
  onSelect,
  onViewLiveHud,
}: {
  match: Match;
  selected: boolean;
  onSelect: (match: Match) => void;
  onViewLiveHud?: (match: Match) => void;
}) {
  const isLive = isEffectivelyLive(match);
  const score = matchScoreSummary(match);
  const timeLabel = matchTimeLabel(match);
  const competitionName = matchCompetitionName(match);
  const liveIntel = useMemo(() => deriveLiveIntel(match), [match]);
  const footballSignal = useMemo(() => recentFootballSignal(match), [match]);
  const tennisSignal = useMemo(() => recentTennisSignal(match), [match]);

  return (
    <div
      className={[
        "w-full rounded-[1.2rem] border p-3 text-left transition-[transform,border-color,background-color,box-shadow] duration-200 sm:p-2.5",
        selected
          ? "border-[rgba(161,121,241,0.34)] bg-[linear-gradient(160deg,rgba(58,139,255,0.22),rgba(99,32,232,0.2))] shadow-[0_18px_38px_rgba(0,0,0,0.22)]"
          : "border-[var(--c-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] hover:border-[var(--c-accent)] hover:bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.03))]",
        isLive && match.sport === "cricket"
          ? "shadow-[0_0_0_1px_rgba(56,189,248,0.12)]"
          : "",
        isLive && match.sport === "football" && footballSignal?.tone === "goal"
          ? "shadow-[0_0_0_1px_rgba(34,197,94,0.22)]"
          : "",
        isLive && match.sport === "football" && footballSignal?.tone === "red_card"
          ? "shadow-[0_0_0_1px_rgba(239,68,68,0.24)]"
          : "",
        isLive && match.sport === "tennis" && tennisSignal?.tone === "break_point"
          ? "shadow-[0_0_0_1px_rgba(244,63,94,0.24)]"
          : "",
        isLive && match.sport === "tennis" && tennisSignal?.tone === "set_point"
          ? "shadow-[0_0_0_1px_rgba(251,146,60,0.24)]"
          : "",
        isLive && match.sport === "tennis" && tennisSignal?.tone === "match_point"
          ? "shadow-[0_0_0_1px_rgba(251,191,36,0.26)]"
          : "",
      ].join(" ")}
    >
      <button type="button" onClick={() => onSelect(match)} className="w-full touch-manipulation text-left">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--c-text-faint)]">
              {competitionName}
            </div>
            <div className="mt-1 truncate text-xs text-[var(--c-text-muted)]">{readableSport(match.sport)}</div>
          </div>
          <span
            className={[
              "inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] sm:px-2 sm:py-1 sm:text-[10px]",
              isLive
                ? "border-[rgba(255,77,79,0.24)] bg-[rgba(255,77,79,0.1)] text-[var(--c-danger)]"
                : "border-[var(--c-border)] bg-[rgba(255,255,255,0.04)] text-[var(--c-text-faint)]",
            ].join(" ")}
          >
            {isLive ? <RadioTower className="h-3 w-3" /> : <CalendarRange className="h-3 w-3" />}
            {isLive ? "Live" : "Board"}
          </span>
        </div>

        <div className="mt-3 space-y-2">
          <CompactTeamRow name={String(match.team1 ?? "-")} logo={match.team1_logo} />
          <CompactTeamRow name={String(match.team2 ?? "-")} logo={match.team2_logo} />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {liveIntel ? (
            <span className="rounded-full border border-cyan-400/30 bg-[linear-gradient(135deg,rgba(56,189,248,0.14),rgba(14,165,233,0.08))] px-3 py-1.5 text-[11px] font-semibold text-cyan-100 sm:px-2.5 sm:py-1">
              {liveIntel}
            </span>
          ) : score ? (
            <span className="rounded-full border border-[rgba(58,139,255,0.24)] bg-[rgba(58,139,255,0.12)] px-3 py-1.5 text-[11px] font-semibold text-[rgb(153,203,255)] sm:px-2.5 sm:py-1">
              {score}
            </span>
          ) : null}
          {isLive && match.sport === "football" && footballSignal ? (
            <span
              className={[
                "rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]",
                footballSignal.tone === "goal"
                  ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
                  : footballSignal.tone === "red_card"
                    ? "border-red-400/20 bg-red-400/10 text-red-100"
                    : "border-amber-400/20 bg-amber-400/10 text-amber-100",
              ].join(" ")}
            >
              {footballSignal.label}
            </span>
          ) : null}
          {isLive && match.sport === "tennis" && tennisSignal ? (
            <span
              className={[
                "rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]",
                tennisSignal.tone === "break_point"
                  ? "border-rose-400/20 bg-rose-400/10 text-rose-100"
                  : tennisSignal.tone === "set_point"
                    ? "border-orange-400/20 bg-orange-400/10 text-orange-100"
                    : "border-amber-400/20 bg-amber-400/10 text-amber-100",
              ].join(" ")}
            >
              {tennisSignal.label}
            </span>
          ) : null}
          {isLive && match.sport === "cricket" ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-100 sm:px-2.5 sm:py-1">
              <Sparkles className="h-3 w-3" />
              Live feed
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--c-border)] bg-[rgba(0,0,0,0.18)] px-3 py-1.5 text-[11px] font-medium text-[var(--c-text-muted)] sm:px-2.5 sm:py-1">
            <Clock3 className="h-3.5 w-3.5" />
            {timeLabel}
          </span>
        </div>
      </button>

      {isLive && onViewLiveHud ? (
        <div className="mt-3">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onViewLiveHud(match);
            }}
            className="inline-flex min-h-[2.9rem] w-full touch-manipulation items-center justify-center gap-2 rounded-[0.95rem] border border-cyan-400/30 bg-[linear-gradient(135deg,rgba(56,189,248,0.22),rgba(99,32,232,0.2))] px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-50 transition-[transform,border-color,background-color,box-shadow] duration-200 hover:border-cyan-300/50 hover:shadow-[0_10px_24px_rgba(56,189,248,0.16)] sm:min-h-0 sm:w-auto sm:py-2"
          >
            <Activity className="h-3.5 w-3.5" />
            {match.sport === "cricket" ? "Open Live Board" : "View Live HUD"}
          </button>
        </div>
      ) : null}
    </div>
  );
});

function CompactTeamRow({ name, logo }: { name: string; logo?: string | null }) {
  return (
    <div className="flex items-center gap-2.5 rounded-[0.95rem] border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.03)] px-2.5 py-2.5 sm:py-2">
      {logo ? (
        <Image
          src={logo}
          alt={name}
          width={28}
          height={28}
          className="h-7 w-7 rounded-full border border-[var(--c-border)] bg-[var(--c-surface-1)] object-cover"
        />
      ) : (
        <div className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--c-border)] bg-[var(--c-surface-1)] text-[10px] font-bold uppercase text-[var(--c-text-faint)]">
          {name.slice(0, 2)}
        </div>
      )}
      <div className="min-w-0 truncate text-[13px] font-semibold text-[var(--c-text)] sm:text-sm">{name}</div>
    </div>
  );
}

function isEffectivelyLive(match: Match) {
  return isMatchLiveForDisplay(match);
}

function deriveLiveIntel(match: Match) {
  if (match.sport === "tennis" && isEffectivelyLive(match)) {
    const tennisLive = extractTennisLiveState(match);
    const serverSide = resolveServerSide(String(tennisLive?.server || ""));
    const serverLabel = serverSide === "player_1" ? shortPlayerLabel(String(match.team1 || "P1")) : serverSide === "player_2" ? shortPlayerLabel(String(match.team2 || "P2")) : null;
    const point = tennisLive?.current_point_score || tennisLive?.current_game_score || null;
    const set = tennisLive?.current_set ? `Set ${tennisLive.current_set}` : null;
    return [set, point, serverLabel ? `Srv ${serverLabel}` : null].filter(Boolean).join(" · ");
  }

  if (match.sport === "football" && isEffectivelyLive(match)) {
    const score = matchScoreSummary(match);
    const elapsed = typeof match.elapsed_minute === "number" && match.elapsed_minute > 0 ? `${match.elapsed_minute}'` : null;
    return [score, elapsed].filter(Boolean).join(" · ");
  }

  if (match.sport !== "cricket" || !isEffectivelyLive(match)) return null;

  const runs = Number(match.runs_total || 0);
  const wickets = Number(match.wickets_total || 0);
  const overs = String(match.current_over || "0.0");
  const battingTeam = shortTeamLabel(String(match.batting_team || match.team1 || "BAT"));
  const cricketContext = extractCricketContext(match);
  const inning = cricketContext?.scoreboard?.current_scoreboard?.inning || match.current_innings || null;
  const inningLabel = inning ? `I${inning}` : null;

  return [battingTeam, `${runs}/${wickets}`, `(${overs})`, inningLabel].filter(Boolean).join(" ");
}

function shortTeamLabel(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "BAT";

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length === 1) return trimmed.slice(0, 3).toUpperCase();
  return words
    .slice(0, 3)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

function shortPlayerLabel(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "P";
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length === 1) return trimmed.slice(0, 3).toUpperCase();
  return words.map((word) => word[0]).join("").slice(0, 3).toUpperCase();
}

function extractTennisLiveState(match: Match) {
  if (!match.raw_data || typeof match.raw_data !== "object" || Array.isArray(match.raw_data)) return null;
  const rawData = match.raw_data as Record<string, unknown>;
  const tennisLiveState = rawData.tennis_live_state;
  if (!tennisLiveState || typeof tennisLiveState !== "object" || Array.isArray(tennisLiveState)) return null;
  return tennisLiveState as Record<string, unknown>;
}

function recentTennisSignal(match: Match) {
  if (match.sport !== "tennis" || !isEffectivelyLive(match)) return null;
  const liveState = extractTennisLiveState(match);
  if (!liveState) return null;

  if (liveState.match_point === true) return { tone: "match_point" as const, label: "Match Point" };
  if (liveState.set_point === true) return { tone: "set_point" as const, label: "Set Point" };
  if (liveState.break_point === true) return { tone: "break_point" as const, label: "Break Point" };
  return null;
}
