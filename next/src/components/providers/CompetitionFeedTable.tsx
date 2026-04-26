"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { CompetitionFeed } from "@/lib/api";

export function CompetitionFeedTable({
  feeds,
  onToggleEnabled,
  onImport,
  onRefreshUpcoming,
  onRefreshLive,
  onDelete,
  busyId,
}: {
  feeds: CompetitionFeed[];
  onToggleEnabled: (id: string, enabled: boolean) => void;
  onImport: (id: string) => void;
  onRefreshUpcoming: (id: string) => void;
  onRefreshLive: (id: string) => void;
  onDelete?: (id: string) => void;
  busyId?: string | null;
}) {
  if (feeds.length === 0) {
    return (
      <Card variant="surface-1" className="p-6">
        <p className="text-sm text-[var(--c-text-muted)]">No competition feeds configured yet.</p>
      </Card>
    );
  }

  return (
    <Card variant="surface-2" className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="min-w-[1200px] w-full text-left text-sm">
          <thead className="bg-[var(--c-surface-1)] text-[var(--c-text-muted)]">
            <tr>
              <th className="px-4 py-3 font-medium">Feed</th>
              <th className="px-4 py-3 font-medium">Provider</th>
              <th className="px-4 py-3 font-medium">Scope</th>
              <th className="px-4 py-3 font-medium">Sync Rules</th>
              <th className="px-4 py-3 font-medium">Flags</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {feeds.map((feed) => {
              const pending = busyId === feed.id;
              const seasonUnresolved =
                feed.sport === "cricket" &&
                feed.provider?.name === "sportmonks" &&
                feed.import_mode === "season" &&
                !feed.season_id;

              return (
                <tr key={feed.id} className="border-t border-[var(--c-border)] align-top">
                  <td className="px-4 py-4">
                    <div className="font-medium text-[var(--c-text)]">{feed.name}</div>
                    <div className="mt-1 text-xs uppercase tracking-[0.14em] text-[var(--c-text-faint)]">
                      {feed.sport} · {feed.competition_key}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-[var(--c-text)]">
                    {feed.provider?.name || feed.provider_id || "-"}
                  </td>
                  <td className="px-4 py-4 text-[var(--c-text-muted)]">
                    <div>League: {feed.league_id || "-"}</div>
                    <div>Season: {feed.season_id || "-"}</div>
                    <div>Region: {feed.region || "-"}</div>
                    <div>Track: {feed.track || "-"}</div>
                    {seasonUnresolved ? (
                      <div className="mt-2 rounded-[var(--r-card)] border border-[var(--c-danger)]/30 bg-[color:color-mix(in_srgb,var(--c-danger)_10%,transparent)] p-2 text-xs text-[var(--c-danger)]">
                        Season unresolved. SportMonks import cannot fetch fixtures until a valid season is resolved.
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-4 text-[var(--c-text-muted)]">
                    <div>Upcoming {feed.upcoming_window_days ?? "-"}d</div>
                    <div>Live start {feed.live_start_offset_minutes ?? "-"}m</div>
                    <div>Poll {feed.live_poll_interval_seconds ?? "-"}s</div>
                    <div>Stop {feed.live_stop_offset_minutes ?? "-"}m</div>
                    {feed.metrics ? (
                      <div className="mt-3 space-y-1 rounded-[var(--r-card)] border border-[var(--c-border)] bg-[color:color-mix(in_srgb,var(--c-surface-1)_88%,transparent)] p-3 text-xs">
                        <div>Imported fixtures: {feed.metrics.imported_fixture_count}</div>
                        <div>
                          Upcoming / Live: {feed.metrics.upcoming_match_count} / {feed.metrics.live_match_count}
                        </div>
                        <div>
                          Settled / Cancelled: {feed.metrics.settled_match_count} / {feed.metrics.cancelled_match_count}
                        </div>
                        <div>Sync failures: {feed.metrics.failed_sync_count}</div>
                        <div>Provider odds imported: {feed.metrics.provider_odds_imported_count}</div>
                        {feed.metrics.live_index ? (
                          <div className="mt-3 rounded-[var(--r-card)] border border-[var(--c-border)]/80 bg-[color:color-mix(in_srgb,var(--c-info)_8%,transparent)] p-3 text-[var(--c-text)]">
                            <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--c-text-faint)]">
                              Batch Live Discovery
                            </div>
                            <div className="mt-1">
                              Active fixtures: {feed.metrics.live_index.active_fixture_count}
                            </div>
                            <div>
                              State: {feed.metrics.live_index.stale ? "stale" : "fresh"}
                            </div>
                            <div>
                              Last success: {formatTimestamp(feed.metrics.live_index.last_successful_refresh_at)}
                            </div>
                          </div>
                        ) : null}
                        {feed.metrics.live_odds_index ? (
                          <div className="mt-3 rounded-[var(--r-card)] border border-[var(--c-border)]/80 bg-[color:color-mix(in_srgb,var(--c-warning)_8%,transparent)] p-3 text-[var(--c-text)]">
                            <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--c-text-faint)]">
                              Batch Live Odds
                            </div>
                            <div>
                              Active fixtures: {feed.metrics.live_odds_index.active_fixture_count}
                            </div>
                            <div>
                              State: {feed.metrics.live_odds_index.stale ? "stale" : "fresh"}
                            </div>
                            <div>
                              Last success: {formatTimestamp(feed.metrics.live_odds_index.last_successful_refresh_at)}
                            </div>
                          </div>
                        ) : null}
                        {feed.metrics.detail_refresh ? (
                          <div className="mt-3 rounded-[var(--r-card)] border border-[var(--c-border)]/80 bg-[color:color-mix(in_srgb,var(--c-accent)_8%,transparent)] p-3 text-[var(--c-text)]">
                            <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--c-text-faint)]">
                              Targeted Detail Scheduler
                            </div>
                            <div>
                              Tracked / Due / Selected: {feed.metrics.detail_refresh.tracked_match_count} / {feed.metrics.detail_refresh.due_count ?? 0} / {feed.metrics.detail_refresh.selected_count ?? 0}
                            </div>
                            <div>
                              Hot / Warm: {feed.metrics.detail_refresh.hot_target_count ?? 0} / {feed.metrics.detail_refresh.warm_target_count ?? 0}
                            </div>
                            <div>
                              Throttled / Cooldown: {feed.metrics.detail_refresh.throttled_count ?? 0} / {feed.metrics.detail_refresh.cooldown_suppressed_count ?? 0}
                            </div>
                            <div>
                              Refreshed / Unchanged / Failed: {feed.metrics.detail_refresh.refreshed_count} / {feed.metrics.detail_refresh.unchanged_count} / {feed.metrics.detail_refresh.failed_count}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-[var(--r-pill)] border border-[var(--c-border)] px-2 py-1 text-xs text-[var(--c-text-muted)]">
                        {feed.enabled ? "Enabled" : "Disabled"}
                      </span>
                      <span className="rounded-[var(--r-pill)] border border-[var(--c-border)] px-2 py-1 text-xs text-[var(--c-text-muted)]">
                        {feed.live_sync_enabled ? "Live sync" : "No live sync"}
                      </span>
                      <span className="rounded-[var(--r-pill)] border border-[var(--c-border)] px-2 py-1 text-xs text-[var(--c-text-muted)]">
                        {feed.import_provider_odds ? "Provider odds" : "No provider odds"}
                      </span>
                      <span className="rounded-[var(--r-pill)] border border-[var(--c-border)] px-2 py-1 text-xs text-[var(--c-text-muted)]">
                        {feed.generate_platform_odds ? "Platform AI" : "No AI odds"}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        onClick={() => onToggleEnabled(feed.id, !feed.enabled)}
                        disabled={pending}
                      >
                        {pending ? "Saving..." : feed.enabled ? "Disable" : "Enable"}
                      </Button>
                      <Button variant="primary" onClick={() => onImport(feed.id)} disabled={pending}>
                        {pending ? "Working..." : "Import"}
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => onRefreshUpcoming(feed.id)}
                        disabled={pending}
                      >
                        Refresh Upcoming
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => onRefreshLive(feed.id)}
                        disabled={pending}
                      >
                        Refresh Live
                      </Button>
                      {onDelete ? (
                        <Button variant="ghost" onClick={() => onDelete(feed.id)} disabled={pending}>
                          Delete
                        </Button>
                      ) : null}
                    </div>
                    {feed.metrics ? (
                      <div className="mt-3 space-y-1 text-xs text-[var(--c-text-faint)]">
                        <div>
                          Last fixture import: {formatTimestamp(feed.metrics.last_fixture_import?.inserted_at)}
                        </div>
                        <div>
                          Last live sync: {formatTimestamp(feed.metrics.last_live_sync?.inserted_at)}
                        </div>
                        <div>
                          Last provider odds fetch: {formatTimestamp(feed.metrics.last_provider_odds_fetch?.inserted_at)}
                        </div>
                        <div>
                          Last provider odds import: {formatTimestamp(feed.metrics.last_provider_odds_import?.inserted_at)}
                        </div>
                      </div>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function formatTimestamp(value?: string | null) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString();
}
