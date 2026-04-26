"use client";

import { type ReactNode, useMemo, useSyncExternalStore } from "react";
import { Activity, AlertTriangle, RadioTower, Target, TrendingUp, WifiOff } from "lucide-react";
import type { Match } from "@/lib/api";
import type { LiveMatchStore } from "@/lib/live/matchLiveStore";
import { useLiveMatchStoreSelector } from "@/lib/live/matchLiveStore";
import { formatDecimal, toNumber } from "@/lib/format";

export function LiveScoreboard({ store, embedded = false }: { store: LiveMatchStore; embedded?: boolean }) {
  const match = useLiveMatchStoreSelector(store, (state) => state.match);
  const suspended = useLiveMatchStoreSelector(store, (state) => state.marketSuspended);
  const suspensionReason = useLiveMatchStoreSelector(store, (state) => state.suspensionReason);
  const suspendedMarkets = useLiveMatchStoreSelector(store, (state) => state.suspendedMarkets);
  const connectionStatus = useLiveMatchStoreSelector(store, (state) => state.connectionStatus);
  const hydrated = useSyncExternalStore(emptySubscribe, () => true, () => false);

  const battingRuns = Number(match.runs_total || 0);
  const wickets = Number(match.wickets_total || 0);
  const overs = String(match.current_over || "0.0");
  const currentRate = toNumber(match.current_run_rate) || 0;
  const requiredRate = toNumber(match.required_run_rate);
  const targetRuns = toNumber(match.target_runs);
  const pressureDelta = requiredRate !== null ? requiredRate - currentRate : null;
  const lastSixBalls = useMemo(() => readLastSixBalls(match), [match]);
  const suspensionBanner = resolveSuspensionBanner(suspensionReason);
  const battingTeam = String(match.batting_team || match.team1 || "Batting side");
  const bowlingTeam = String(match.bowling_team || match.team2 || "Bowling side");
  const targetLabel = targetRuns ? `${targetRuns} target` : "Set target pending";
  const chaseState =
    targetRuns && battingRuns
      ? `${Math.max(targetRuns - battingRuns, 0)} needed`
      : match.status === "live"
        ? "Powering through live phase"
        : "Awaiting toss and first delivery";

  return (
    <div className="sticky top-0 z-30 border-b border-white/8 bg-[rgba(4,8,16,0.88)] backdrop-blur-2xl">
      <div
        className={embedded ? "flex flex-col gap-4 px-4 py-4" : "mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8"}
      >
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,1fr)]">
          <div className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(86,191,255,0.16),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.15),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.015))] p-4 shadow-[0_22px_80px_rgba(0,0,0,0.28)] sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-200/70">Cricket Command Center</div>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <div className="text-2xl font-semibold tracking-[-0.05em] text-white sm:text-3xl">
                    {String(match.team1 || "Team 1")} <span className="text-white/30">vs</span> {String(match.team2 || "Team 2")}
                  </div>
                  <ConnectionChip hydrated={hydrated} connectionStatus={connectionStatus} suspended={suspended} />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <InfoPill icon={<Activity className="h-3.5 w-3.5" />} label="Live board" value={`state ${Number(match.live_state_version || 0)}`} />
                <InfoPill icon={<Target className="h-3.5 w-3.5" />} label="Target" value={targetLabel} />
                <InfoPill icon={<TrendingUp className="h-3.5 w-3.5" />} label="Pressure" value={pressureText(pressureDelta)} />
              </div>
            </div>

            {hydrated && suspended && suspensionBanner ? (
              <div className="mt-4 rounded-[1.1rem] border border-amber-400/30 bg-amber-500/12 px-4 py-3 text-sm font-medium text-amber-100">
                {suspensionBanner}
              </div>
            ) : null}

            {hydrated && !suspended && Object.keys(suspendedMarkets).length > 0 ? (
              <div className="mt-4 rounded-[1.1rem] border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100/90">
                Some fast markets are temporarily paused while the core board stays open.
              </div>
            ) : null}

            <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <HudMetricCard accent="cyan" label="Batting now" value={battingTeam} subvalue={`${battingRuns}/${wickets} in ${overs}`} />
                <HudMetricCard accent="emerald" label="Bowling" value={bowlingTeam} subvalue={`RR ${formatDecimal(currentRate)}`} />
                <HudMetricCard accent="amber" label="Required" value={requiredRate !== null ? formatDecimal(requiredRate) : "-"} subvalue={chaseState} />
                <HudMetricCard accent="violet" label="Overs" value={overs} subvalue={`Last six ${lastSixBalls.join(" ") || "pending"}`} />
              </div>

              <div className="rounded-[1.35rem] border border-white/10 bg-black/20 px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/45">Momentum wave</div>
                    <div className="mt-1 text-sm text-white/70">Pressure built from run flow, chase gap, wickets, and the last six deliveries.</div>
                  </div>
                  <div className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-200">
                    {momentumLabel(match)}
                  </div>
                </div>
                <div className="mt-4 h-28">
                  <MomentumWave match={match} lastSixBalls={lastSixBalls} />
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
            <SignalCard
              title="Current score"
              value={`${battingRuns}/${wickets}`}
              description={`Overs ${overs} · RR ${formatDecimal(currentRate)}`}
              tone="cyan"
            />
            <SignalCard
              title="Chase lens"
              value={targetRuns ? `${Math.max(targetRuns - battingRuns, 0)}` : "-"}
              description={targetRuns ? "Runs left" : "Target not available yet"}
              tone="amber"
            />
            <SignalCard
              title="Market pulse"
              value={suspended ? "Paused" : "Open"}
              description={suspended ? String(suspensionReason || "prices refreshing") : `${Object.keys(suspendedMarkets).length} market checks`}
              tone={suspended ? "rose" : "emerald"}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">Recent balls</div>
          {lastSixBalls.length ? (
            lastSixBalls.map((ball, index) => <LastBallChip key={`${ball}-${index}`} value={ball} />)
          ) : (
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/60">Waiting for live delivery pattern</span>
          )}
        </div>
      </div>
    </div>
  );
}

function emptySubscribe() {
  return () => {};
}

function ConnectionChip({
  hydrated,
  connectionStatus,
  suspended,
}: {
  hydrated: boolean;
  connectionStatus: string;
  suspended: boolean;
}) {
  if (!hydrated) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white/60">
        <WifiOff className="h-3.5 w-3.5" /> Connecting
      </span>
    );
  }

  if (suspended) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/12 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-red-200">
        <AlertTriangle className="h-3.5 w-3.5" /> Suspended
      </span>
    );
  }

  if (connectionStatus === "joined") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/12 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200">
        <RadioTower className="h-3.5 w-3.5" /> Live feed
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/12 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">
      <WifiOff className="h-3.5 w-3.5" /> {connectionStatus}
    </span>
  );
}

function InfoPill({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/75">
      <span className="text-cyan-200">{icon}</span>
      <span className="font-semibold uppercase tracking-[0.18em] text-white/45">{label}</span>
      <span className="font-medium text-white">{value}</span>
    </div>
  );
}

function HudMetricCard({
  accent,
  label,
  value,
  subvalue,
}: {
  accent: "cyan" | "emerald" | "amber" | "violet";
  label: string;
  value: string;
  subvalue: string;
}) {
  const tone = {
    cyan: "from-cyan-400/18 to-cyan-500/6 text-cyan-100",
    emerald: "from-emerald-400/18 to-emerald-500/6 text-emerald-100",
    amber: "from-amber-400/18 to-amber-500/6 text-amber-100",
    violet: "from-violet-400/18 to-violet-500/6 text-violet-100",
  }[accent];

  return (
    <div className={`rounded-[1.2rem] border border-white/10 bg-gradient-to-br ${tone} px-4 py-4`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/45">{label}</div>
      <div className="mt-2 truncate text-xl font-semibold tracking-[-0.04em] text-white">{value}</div>
      <div className="mt-2 text-sm text-white/70">{subvalue}</div>
    </div>
  );
}

function SignalCard({
  title,
  value,
  description,
  tone,
}: {
  title: string;
  value: string;
  description: string;
  tone: "cyan" | "amber" | "emerald" | "rose";
}) {
  const palette = {
    cyan: "border-cyan-400/20 bg-cyan-400/10 text-cyan-100",
    amber: "border-amber-400/20 bg-amber-400/10 text-amber-100",
    emerald: "border-emerald-400/20 bg-emerald-400/10 text-emerald-100",
    rose: "border-rose-400/20 bg-rose-400/10 text-rose-100",
  }[tone];

  return (
    <div className={`rounded-[1.3rem] border ${palette} px-4 py-4 shadow-[0_18px_50px_rgba(0,0,0,0.16)]`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-current/60">{title}</div>
      <div className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-white">{value}</div>
      <div className="mt-2 text-sm text-current/80">{description}</div>
    </div>
  );
}

function LastBallChip({ value }: { value: string }) {
  const normalized = value.trim().toUpperCase();
  const tone =
    normalized === "W"
      ? "border-red-500/40 bg-red-500/15 text-red-100"
      : normalized === "4" || normalized === "6"
        ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-100"
        : "border-white/10 bg-white/[0.04] text-white";

  return (
    <span className={["inline-flex h-8 min-w-8 items-center justify-center rounded-full border px-2 text-xs font-semibold", tone].join(" ")}>
      {normalized}
    </span>
  );
}

function MomentumWave({ match, lastSixBalls }: { match: Match; lastSixBalls: string[] }) {
  const points = useMemo(() => buildMomentumSeries(match, lastSixBalls), [lastSixBalls, match]);
  const width = 360;
  const height = 108;
  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)},${point.y.toFixed(2)}`)
    .join(" ");
  const fillPath = `${path} L ${width},${height} L 0,${height} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full overflow-visible" role="img" aria-label="Momentum wave">
      <defs>
        <linearGradient id="cricket-wave-stroke" x1="0%" x2="100%" y1="0%" y2="0%">
          <stop offset="0%" stopColor="rgba(34,211,238,0.95)" />
          <stop offset="50%" stopColor="rgba(99,102,241,0.9)" />
          <stop offset="100%" stopColor="rgba(16,185,129,0.95)" />
        </linearGradient>
        <linearGradient id="cricket-wave-fill" x1="0%" x2="0%" y1="0%" y2="100%">
          <stop offset="0%" stopColor="rgba(34,211,238,0.28)" />
          <stop offset="100%" stopColor="rgba(34,211,238,0.02)" />
        </linearGradient>
      </defs>
      <path d={fillPath} fill="url(#cricket-wave-fill)" />
      <path d={path} fill="none" stroke="url(#cricket-wave-stroke)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((point, index) => (
        <circle key={index} cx={point.x} cy={point.y} r={index === points.length - 1 ? 4.5 : 2} fill={index === points.length - 1 ? "#67e8f9" : "rgba(255,255,255,0.45)"} />
      ))}
    </svg>
  );
}

function buildMomentumSeries(match: Match, lastSixBalls: string[]) {
  const width = 360;
  const height = 108;
  const currentRate = toNumber(match.current_run_rate) || 0;
  const requiredRate = toNumber(match.required_run_rate) || currentRate || 6;
  const wickets = Number(match.wickets_total || 0);
  const baseMomentum = toNumber(match.momentum_index) || 50;
  const ballImpact =
    lastSixBalls.reduce((acc, item) => {
      if (item === "W") return acc - 16;
      const numeric = Number(item);
      if (Number.isFinite(numeric)) return acc + numeric * 1.8;
      return acc;
    }, 0) / Math.max(lastSixBalls.length || 1, 1);
  const pacePressure = (currentRate - requiredRate) * 6;
  const wicketPressure = wickets * -2.8;
  const anchor = clamp(baseMomentum + ballImpact + pacePressure + wicketPressure, 12, 88);

  return Array.from({ length: 24 }, (_, index) => {
    const t = index / 23;
    const swing = Math.sin(t * Math.PI * 2.6) * 9 + Math.cos(t * Math.PI * 5.2) * 4;
    const drift = (t - 0.5) * 16;
    const pulse = index === 23 ? 6 : 0;
    const momentum = clamp(anchor + swing + drift + pulse, 8, 92);
    return {
      x: t * width,
      y: height - (momentum / 100) * height,
    };
  });
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function readLastSixBalls(match: Match) {
  const candidates = [
    match.last_6_balls_pattern,
    (match.market_state as Record<string, unknown> | undefined)?.last_6_balls_pattern,
    (match.score as Record<string, unknown> | undefined)?.last_6_balls_pattern,
    (match.raw_data as Record<string, unknown> | undefined)?.last_6_balls_pattern,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.map((value) => String(value)).slice(-6);
    }
  }

  return [] as string[];
}

function pressureText(delta: number | null) {
  if (delta === null) return "Neutral";
  if (delta <= -1.5) return "Batting ahead";
  if (delta >= 1.5) return "Chase under heat";
  return "Balanced";
}

function momentumLabel(match: Match) {
  const base = toNumber(match.momentum_index) || 50;
  if (base >= 65) return "Batting command";
  if (base <= 35) return "Bowling squeeze";
  return "Even pulse";
}

function resolveSuspensionBanner(reason: string | null) {
  switch ((reason || "").trim()) {
    case "provider_disconnect":
      return "The live feed is reconnecting. Prices will return once the data is stable."
    case "live_bootstrap":
    case "bootstrap_missing_board":
      return "Live prices are starting up for this match."
    case "ai_engine_unavailable":
    case "bootstrap_recovery":
      return "Live prices are refreshing after a temporary sync issue."
    case "manual_admin_review":
      return "Live prices are waiting for confirmation before they are shown."
    case "third_umpire_review":
      return "A review is in progress, so live prices are paused until the decision is complete."
    case "rain_delay":
      return "Play is delayed, so live prices remain paused until the match resumes."
    default:
      return reason ? `Live prices are temporarily paused while the match updates: ${reason.replace(/_/g, " ")}` : "Live prices are temporarily paused while the match updates."
  }
}
