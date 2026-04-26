"use client";

import { Shield, Sparkles } from "lucide-react";
import type { Match } from "@/lib/api";
import { resolveLineupSides, type FootballContext, type FootballLineupPlayer, type FootballLineupTeam } from "@/lib/football/footballContext";

export function FootballLineupPitch({
  match,
  context,
}: {
  match: Match;
  context: FootballContext | null;
}) {
  const { home, away } = resolveLineupSides(match, context);
  const hasPublishedLineups =
    Array.isArray(home?.start_xi) &&
    home.start_xi.length > 0 &&
    Array.isArray(away?.start_xi) &&
    away.start_xi.length > 0;

  return (
    <div className="rounded-[calc(var(--r-xl)+2px)] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur-xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--c-text-faint)]">
          <Shield className="h-4 w-4 text-emerald-300" />
          Official Shape
        </div>
        <div className="text-xs font-medium text-[var(--c-text-muted)]">
          {home?.formation || "Formation pending"} <span className="mx-2 text-[var(--c-text-faint)]">vs</span> {away?.formation || "Formation pending"}
        </div>
      </div>

      <div className="mt-4 grid gap-4 2xl:grid-cols-[220px_minmax(0,1fr)_220px]">
        <div className="hidden 2xl:block">
          <SidePanel side={home} fallbackName={String(match.team1 || "Home")} align="left" />
        </div>

        <div className="relative overflow-hidden rounded-[calc(var(--r-xl)+2px)] border border-emerald-500/20 bg-[linear-gradient(180deg,rgba(7,68,33,0.92),rgba(5,36,19,0.94))] px-2 py-3 sm:px-3 sm:py-4 lg:px-4 lg:py-5 2xl:col-auto">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.12),transparent_50%)] opacity-60" />
          <div className="pointer-events-none absolute inset-[6%] rounded-[30px] border border-white/10" />
          <div className="pointer-events-none absolute inset-x-[18%] top-[10%] h-[1px] bg-white/10" />
          <div className="pointer-events-none absolute inset-x-[18%] bottom-[10%] h-[1px] bg-white/10" />
          <div className="pointer-events-none absolute inset-y-[50%] left-[6%] right-[6%] h-px -translate-y-1/2 bg-white/10" />
          <div className="pointer-events-none absolute left-1/2 top-[50%] h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10" />
          <div className="pointer-events-none absolute left-1/2 top-[50%] h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/20" />

          {!hasPublishedLineups ? (
            <AwaitingLineupsState />
          ) : (
            <div className="relative h-[420px] sm:h-[480px] lg:h-[540px]">
              <FormationHeader team={home} sideLabel="Home" position="top" fallbackName={String(match.team1 || "Home")} />
              <FormationHeader team={away} sideLabel="Away" position="bottom" fallbackName={String(match.team2 || "Away")} />
              {renderPlayers(home, "home")}
              {renderPlayers(away, "away")}
            </div>
          )}
        </div>

        <div className="hidden 2xl:block">
          <SidePanel side={away} fallbackName={String(match.team2 || "Away")} align="right" />
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2 2xl:hidden">
        <SidePanel side={home} fallbackName={String(match.team1 || "Home")} align="left" />
        <SidePanel side={away} fallbackName={String(match.team2 || "Away")} align="right" />
      </div>
    </div>
  );
}

function renderPlayers(team: FootballLineupTeam | null, side: "home" | "away") {
  return (team?.start_xi || [])
    .filter((player) => player?.grid?.row != null && player?.grid?.col != null)
    .map((player) => {
      const { top, left } = gridToPitchPosition(player, side);

      return (
        <div
          key={`${team?.team_name}-${player.id}-${player.grid?.raw}`}
          className="absolute -translate-x-1/2 -translate-y-1/2 transition-transform duration-300"
          style={{ top: `${top}%`, left: `${left}%` }}
        >
          <div className="rounded-[18px] border border-white/10 bg-[rgba(6,13,28,0.72)] px-1.5 py-1.5 text-center shadow-[0_12px_30px_rgba(0,0,0,0.28)] backdrop-blur-md sm:rounded-[22px] sm:px-2 sm:py-2">
            <div
              className={[
                "mx-auto flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold sm:h-8 sm:w-8 sm:text-xs",
                side === "home" ? "bg-emerald-500/20 text-emerald-100" : "bg-sky-500/20 text-sky-100",
              ].join(" ")}
            >
              {player.number ?? "?"}
            </div>
            <div className="mt-1 max-w-[64px] text-[9px] font-semibold leading-3 text-white sm:max-w-[90px] sm:text-[11px] sm:leading-4">
              {shortName(player.name)}
            </div>
            <div className="mt-0.5 text-[8px] uppercase tracking-[0.12em] text-[var(--c-text-faint)] sm:text-[10px] sm:tracking-[0.16em]">
              {player.position || "XI"}
            </div>
          </div>
        </div>
      );
    });
}

function gridToPitchPosition(player: FootballLineupPlayer, side: "home" | "away") {
  const row = clamp(player.grid?.row ?? 1, 1, 6);
  const col = clamp(player.grid?.col ?? 1, 1, 5);

  const normalizedTop = 16 + ((row - 1) / 5) * 32;
  const top = side === "home" ? normalizedTop : 100 - normalizedTop;
  const left = 14 + ((col - 1) / 4) * 72;

  return { top, left };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function shortName(value: string | null | undefined) {
  const name = String(value || "").trim();
  if (!name) return "Player";
  const parts = name.split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

function FormationHeader({
  team,
  sideLabel,
  position,
  fallbackName,
}: {
  team: FootballLineupTeam | null;
  sideLabel: string;
  position: "top" | "bottom";
  fallbackName: string;
}) {
  return (
    <div
      className={[
        "absolute left-1/2 flex -translate-x-1/2 flex-col items-center text-center",
        position === "top" ? "top-1.5 sm:top-2" : "bottom-1.5 sm:bottom-2",
      ].join(" ")}
    >
      <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--c-text-faint)]">{sideLabel}</div>
      <div className="mt-1 max-w-[180px] truncate text-xs font-semibold text-white sm:text-sm">{team?.team_name || fallbackName}</div>
      <div className="mt-1 max-w-[220px] truncate text-[10px] text-[var(--c-text-muted)] sm:text-xs">
        {team?.formation || "Awaiting formation"} · {team?.coach?.name || "Coach pending"}
      </div>
    </div>
  );
}

function SidePanel({
  side,
  fallbackName,
  align,
}: {
  side: FootballLineupTeam | null;
  fallbackName: string;
  align: "left" | "right";
}) {
  const players = (side?.start_xi || []).filter((player) => Boolean(player?.name)).slice(0, 11);

  return (
    <div className={["rounded-[var(--r-xl)] border border-white/8 bg-[rgba(255,255,255,0.03)] p-4", align === "right" ? "xl:text-right" : ""].join(" ")}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--c-text-faint)]">{fallbackName}</div>
      <div className="mt-2 text-lg font-semibold text-white">{side?.formation || "Formation pending"}</div>
      <div className="mt-1 text-sm text-[var(--c-text-muted)]">{side?.coach?.name || "Coach to be confirmed"}</div>

      <div className="mt-4 space-y-2">
        {players.length ? (
          players.map((player) => (
            <div key={`${fallbackName}-${player.id}-${player.name}`} className="flex items-center justify-between gap-3 rounded-[var(--r-md)] border border-white/6 bg-[rgba(255,255,255,0.02)] px-3 py-2">
              <span className="min-w-0 truncate text-sm font-medium text-white">{player.name}</span>
              <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--c-text-faint)]">
                {player.position || player.number || "XI"}
              </span>
            </div>
          ))
        ) : (
          <div className="rounded-[var(--r-md)] border border-white/8 bg-[rgba(255,255,255,0.02)] px-3 py-4 text-sm text-[var(--c-text-muted)]">
            Awaiting official lineup release.
          </div>
        )}
      </div>
    </div>
  );
}

function AwaitingLineupsState() {
  return (
    <div className="relative flex h-[420px] items-center justify-center sm:h-[480px] lg:h-[540px]">
      <div className="absolute inset-x-[12%] top-[18%] h-20 rounded-full bg-emerald-300/10 blur-3xl" />
      <div className="absolute inset-x-[14%] bottom-[18%] h-20 rounded-full bg-sky-300/10 blur-3xl" />
      <div className="relative w-full max-w-md rounded-[28px] border border-white/10 bg-[rgba(6,13,28,0.72)] px-6 py-8 text-center shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur-lg">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5 text-emerald-300">
          <Sparkles className="h-5 w-5 animate-pulse" />
        </div>
        <div className="mt-4 text-xl font-semibold tracking-[-0.04em] text-white">Awaiting Official Lineups</div>
        <p className="mt-2 text-sm leading-6 text-[var(--c-text-muted)]">
          Starting elevens and tactical shapes usually land closer to kickoff. This pitch will populate automatically as soon as the provider publishes the official team sheets.
        </p>
        <div className="mt-6 grid grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-10 animate-pulse rounded-full border border-white/6 bg-white/5" />
          ))}
        </div>
      </div>
    </div>
  );
}
