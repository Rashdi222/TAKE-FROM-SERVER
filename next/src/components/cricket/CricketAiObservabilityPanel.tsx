import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import type { Match } from "@/lib/api";

type ObservabilitySnapshot = {
  generated_at?: string;
  window_seconds?: number;
  outlier_jump_threshold?: number;
  retry_storm_threshold?: number;
  active_match_ids?: string[];
  health?: Record<string, unknown>;
  match_count?: number;
  matches?: Record<string, Record<string, unknown>>;
};

export function CricketAiObservabilityPanel({
  snapshot,
  loading,
  error,
  selectedMatchId,
  onSelectMatchId,
  onRefresh,
  matches,
}: {
  snapshot: ObservabilitySnapshot | null;
  loading: boolean;
  error: string | null;
  selectedMatchId: string;
  onSelectMatchId: (value: string) => void;
  onRefresh: () => void;
  matches: Match[];
}) {
  const map = (snapshot?.matches ?? {}) as Record<string, Record<string, unknown>>;
  const selected =
    (selectedMatchId && map[selectedMatchId]) || firstValue(map) || null;

  return (
    <div className="space-y-4">
      <Card variant="surface-2" className="p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">AI Observability</p>
            <h2 className="mt-1 text-xl font-semibold text-[var(--c-text)]">Cricket Pricing Health</h2>
            <p className="mt-2 text-sm text-[var(--c-text-muted)]">
              Live latency, retry storms, suspension reasons, repricing rate, and outlier jumps per match.
            </p>
          </div>
          <Button variant="secondary" onClick={onRefresh}>
            Refresh
          </Button>
        </div>
      </Card>

      {loading ? (
        <Card variant="surface-2" className="p-5 text-sm text-[var(--c-text-muted)]">
          Loading cricket observability...
        </Card>
      ) : null}

      {error ? (
        <Card variant="surface-2" className="border-[rgba(255,80,80,0.28)] p-5 text-sm text-[var(--c-danger)]">
          {error}
        </Card>
      ) : null}

      {snapshot ? (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <MetricCard label="Health Status" value={String((snapshot.health ?? {})["status"] ?? "unknown")} />
            <MetricCard label="Tracked Matches" value={String(snapshot.match_count ?? 0)} />
            <MetricCard label="Outlier Threshold" value={toPct(snapshot.outlier_jump_threshold)} />
            <MetricCard label="Window" value={`${Number(snapshot.window_seconds ?? 0)}s`} />
          </div>

          <Card variant="surface-2" className="p-5">
            <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-[0.18em] text-[var(--c-text-faint)]">Match Focus</label>
                <select
                  className="w-full rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-3 py-2 text-sm text-[var(--c-text)] focus:border-[var(--c-accent)] focus:outline-none"
                  value={selectedMatchId}
                  onChange={(event) => onSelectMatchId(event.target.value)}
                >
                  <option value="">Auto (first match)</option>
                  {matches.map((match) => (
                    <option key={String(match.id)} value={String(match.id)}>
                      {match.team1 || "Team 1"} vs {match.team2 || "Team 2"}
                    </option>
                  ))}
                  {Object.keys(map)
                    .filter((id) => !matches.some((match) => String(match.id) === id))
                    .map((id) => (
                      <option key={id} value={id}>
                        {id}
                      </option>
                    ))}
                </select>
                <p className="text-xs text-[var(--c-text-faint)]">
                  Snapshot time: {String(snapshot.generated_at ?? "-")}
                </p>
              </div>

              {selected ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <InfoTile label="Avg Latency" value={`${asInt(selected["avg_latency_ms"])} ms`} />
                  <InfoTile label="Reprices / min" value={asNum(selected["repricing_per_minute"])} />
                  <InfoTile label="Retry Storm" value={selected["retry_storm"] ? "Yes" : "No"} danger={Boolean(selected["retry_storm"])} />
                  <InfoTile label="Outlier Jumps" value={String(asInt(selected["outlier_jump_count"]))} />
                  <InfoTile label="Max Prob Jump" value={toPct(selected["max_probability_jump"])} />
                  <InfoTile label="Last Event Age" value={formatAge(selected["last_event_age_seconds"])} />
                </div>
              ) : (
                <div className="text-sm text-[var(--c-text-muted)]">
                  No match-level observability data yet.
                </div>
              )}
            </div>
          </Card>
        </>
      ) : null}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card variant="surface-2" className="p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-[var(--c-text-faint)]">{label}</p>
      <p className="mt-3 text-lg font-semibold text-[var(--c-text)]">{value}</p>
    </Card>
  );
}

function InfoTile({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return (
    <div
      className={`rounded-[var(--r-md)] border px-4 py-3 ${
        danger
          ? "border-[rgba(255,90,90,0.3)] bg-[rgba(255,90,90,0.08)]"
          : "border-[var(--c-border)] bg-[var(--c-surface-1)]"
      }`}
    >
      <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--c-text-faint)]">{label}</p>
      <p className="mt-2 text-sm font-semibold text-[var(--c-text)]">{value}</p>
    </div>
  );
}

function firstValue(map: Record<string, Record<string, unknown>>) {
  const key = Object.keys(map)[0];
  return key ? map[key] : null;
}

function asInt(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

function asNum(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : "0.00";
}

function toPct(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "-";
  return `${(parsed * 100).toFixed(1)}%`;
}

function formatAge(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "-";
  return `${Math.max(0, Math.floor(parsed))}s`;
}
