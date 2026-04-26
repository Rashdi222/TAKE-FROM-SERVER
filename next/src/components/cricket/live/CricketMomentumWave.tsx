import { memo, useMemo } from "react";
import type { RecentBall } from "@/lib/cricket/liveData";

export const CricketMomentumWave = memo(function CricketMomentumWave({
  recentBalls,
  currentRunRate,
  requiredRunRate,
}: {
  recentBalls: RecentBall[];
  currentRunRate: number | null;
  requiredRunRate: number | null;
}) {
  const { path, areaPath } = useMemo(() => buildWave(recentBalls, currentRunRate, requiredRunRate), [recentBalls, currentRunRate, requiredRunRate]);

  return (
    <div className="rounded-[1.25rem] border border-white/10 bg-black/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/45">Momentum Wave</div>
          <div className="mt-1 text-sm text-white/65">Trend built from the recent over pattern and chase pressure.</div>
        </div>
      </div>
      <div className="mt-4 h-28">
        <svg viewBox="0 0 360 110" className="h-full w-full overflow-visible">
          <defs>
            <linearGradient id="cricket-wave-line" x1="0%" x2="100%" y1="0%" y2="0%">
              <stop offset="0%" stopColor="rgba(34,211,238,0.45)" />
              <stop offset="55%" stopColor="rgba(59,130,246,0.95)" />
              <stop offset="100%" stopColor="rgba(16,185,129,0.75)" />
            </linearGradient>
            <linearGradient id="cricket-wave-fill" x1="0%" x2="0%" y1="0%" y2="100%">
              <stop offset="0%" stopColor="rgba(56,189,248,0.24)" />
              <stop offset="100%" stopColor="rgba(56,189,248,0.01)" />
            </linearGradient>
          </defs>
          <path d={areaPath} fill="url(#cricket-wave-fill)" />
          <path d={path} fill="none" stroke="url(#cricket-wave-line)" strokeWidth="4" strokeLinecap="round" className="drop-shadow-[0_0_12px_rgba(56,189,248,0.35)]" />
        </svg>
      </div>
    </div>
  );
});

function buildWave(recentBalls: RecentBall[], currentRunRate: number | null, requiredRunRate: number | null) {
  const width = 360;
  const height = 110;
  const baseline = 76;
  const samples = recentBalls.length
    ? recentBalls.map((ball) => sampleValue(ball))
    : [0.1, 0.18, 0.12, 0.22, 0.16, 0.2];

  const ratePressure = requiredRunRate != null && currentRunRate != null ? (requiredRunRate - currentRunRate) * 0.02 : 0;
  const values = samples.map((value, index) => clamp(value + ratePressure + index * 0.008, -0.85, 0.85));
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const points = values.map((value, index) => {
    const x = index * step;
    const y = baseline - value * 42;
    return [x, y] as const;
  });

  const path = points.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const areaPath = `${path} L ${width},${height} L 0,${height} Z`;
  return { path, areaPath };
}

function sampleValue(ball: RecentBall) {
  if (ball.isWicket) return -0.7;
  if (ball.label === "6") return 0.82;
  if (ball.label === "4") return 0.55;
  if (ball.label === "0") return -0.16;
  const numeric = Number(ball.label);
  if (Number.isFinite(numeric)) return numeric / 8;
  return 0.1;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
