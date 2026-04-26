"use client";

import { useMemo, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import type { CompetitionFeed } from "@/lib/api";

export function FootballFeedAutomationPanel({
  feeds,
  onSave,
  busyId,
}: {
  feeds: CompetitionFeed[];
  onSave: (id: string, body: Record<string, unknown>) => Promise<void>;
  busyId?: string | null;
}) {
  const [drafts, setDrafts] = useState<Record<string, Record<string, unknown>>>({});
  const [error, setError] = useState<string>("");

  const sortedFeeds = useMemo(() => [...feeds].sort((a, b) => a.name.localeCompare(b.name)), [feeds]);

  if (sortedFeeds.length === 0) {
    return (
      <Card variant="surface-2" className="p-6">
        <p className="text-sm text-[var(--c-text-muted)]">Create at least one football feed before configuring automation.</p>
      </Card>
    );
  }

  const updateDraft = (feed: CompetitionFeed, key: string, value: unknown) => {
    setDrafts((prev) => ({
      ...prev,
      [feed.id]: {
        auto_generate_prematch_odds: feed.auto_generate_prematch_odds ?? false,
        auto_generate_inplay_odds: feed.auto_generate_inplay_odds ?? false,
        prematch_generation_window_minutes: feed.prematch_generation_window_minutes ?? 180,
        inplay_generation_interval_seconds: feed.inplay_generation_interval_seconds ?? 30,
        max_automation_runs_per_match: feed.max_automation_runs_per_match ?? 8,
        ...prev[feed.id],
        [key]: value,
      },
    }));
  };

  const getValue = (feed: CompetitionFeed, key: string, fallback: unknown) => {
    return drafts[feed.id]?.[key] ?? (feed as Record<string, unknown>)[key] ?? fallback;
  };

  const saveFeed = async (feed: CompetitionFeed) => {
    setError("");

    try {
      await onSave(feed.id, {
        auto_generate_prematch_odds: Boolean(getValue(feed, "auto_generate_prematch_odds", false)),
        auto_generate_inplay_odds: Boolean(getValue(feed, "auto_generate_inplay_odds", false)),
        prematch_generation_window_minutes: Number(getValue(feed, "prematch_generation_window_minutes", 180)),
        inplay_generation_interval_seconds: Number(getValue(feed, "inplay_generation_interval_seconds", 30)),
        max_automation_runs_per_match: Number(getValue(feed, "max_automation_runs_per_match", 8)),
      });
    } catch {
      setError("Unable to save football automation settings right now.");
    }
  };

  return (
    <Card variant="surface-2" className="p-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-[var(--c-text)]">Football Automation Controls</h2>
        <p className="text-sm leading-6 text-[var(--c-text-muted)]">
          Automation creates football draft odds only. It never auto-publishes. Prematch runs inside the configured lead window. In-play runs only on live football matches and stays rate-limited per match.
        </p>
      </div>

      {error ? <Alert variant="error" className="mt-4">{error}</Alert> : null}

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        {sortedFeeds.map((feed) => {
          const pending = busyId === feed.id;

          return (
            <div key={feed.id} className="rounded-[var(--r-card)] border border-[var(--c-border)] p-4">
              <div>
                <h3 className="text-base font-semibold text-[var(--c-text)]">{feed.name}</h3>
                <p className="mt-1 text-xs uppercase tracking-[0.14em] text-[var(--c-text-faint)]">
                  {feed.competition_key} · {feed.provider?.name ?? "provider"}
                </p>
              </div>

              <div className="mt-4 grid gap-3">
                <label className="flex items-center gap-3 text-sm text-[var(--c-text)]">
                  <input
                    type="checkbox"
                    checked={Boolean(getValue(feed, "auto_generate_prematch_odds", false))}
                    onChange={(e) => updateDraft(feed, "auto_generate_prematch_odds", e.target.checked)}
                  />
                  Auto-generate prematch drafts
                </label>

                <label className="flex items-center gap-3 text-sm text-[var(--c-text)]">
                  <input
                    type="checkbox"
                    checked={Boolean(getValue(feed, "auto_generate_inplay_odds", false))}
                    onChange={(e) => updateDraft(feed, "auto_generate_inplay_odds", e.target.checked)}
                  />
                  Auto-generate in-play drafts
                </label>

                <div className="grid gap-3 md:grid-cols-3">
                  <Input
                    label="Prematch Window"
                    type="number"
                    min="1"
                    value={String(getValue(feed, "prematch_generation_window_minutes", 180))}
                    onChange={(e) => updateDraft(feed, "prematch_generation_window_minutes", e.target.value)}
                  />
                  <Input
                    label="In-Play Interval"
                    type="number"
                    min="5"
                    value={String(getValue(feed, "inplay_generation_interval_seconds", 30))}
                    onChange={(e) => updateDraft(feed, "inplay_generation_interval_seconds", e.target.value)}
                  />
                  <Input
                    label="Max Runs / Match"
                    type="number"
                    min="1"
                    value={String(getValue(feed, "max_automation_runs_per_match", 8))}
                    onChange={(e) => updateDraft(feed, "max_automation_runs_per_match", e.target.value)}
                  />
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="text-xs leading-5 text-[var(--c-text-faint)]">
                  Prematch defaults to match winner and totals. In-play defaults to the configured in-play market family and still requires manual publish.
                </p>
                <Button variant="primary" onClick={() => void saveFeed(feed)} disabled={pending}>
                  {pending ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
