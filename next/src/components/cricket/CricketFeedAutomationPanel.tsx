"use client";

import { useMemo, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import type { CompetitionFeed } from "@/lib/api";

export function CricketFeedAutomationPanel({
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
        <p className="text-sm text-[var(--c-text-muted)]">Create at least one cricket feed before configuring automation.</p>
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
        live_ai_publish_mode: String(getValue(feed, "live_ai_publish_mode", feed.live_ai_publish_mode || "auto_publish")),
      });
    } catch {
      setError(`Unable to save automation settings right now.`);
    }
  };

  return (
    <Card variant="surface-2" className="p-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-[var(--c-text)]">Cricket Automation Controls</h2>
        <p className="text-sm leading-6 text-[var(--c-text-muted)]">
          Configure cricket automation and decide how the live LangGraph board behaves. `Auto Publish` lets live AI prices update the public board continuously. `Review Required` saves each generated live board as a draft and keeps the market suspended until you publish it manually.
        </p>
      </div>

      {error ? <Alert variant="error" className="mt-4">{error}</Alert> : null}

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        {sortedFeeds.map((feed) => {
          const pending = busyId === feed.id;

          return (
            <div key={feed.id} className="rounded-[var(--r-card)] border border-[var(--c-border)] p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-base font-semibold text-[var(--c-text)]">{feed.name}</h3>
                  <p className="mt-1 text-xs uppercase tracking-[0.14em] text-[var(--c-text-faint)]">
                    {feed.competition_key} · {feed.provider?.name ?? "provider"}
                  </p>
                </div>
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

                <div className="rounded-[var(--r-card)] border border-[var(--c-border)] p-3">
                  <div className="text-xs uppercase tracking-[0.16em] text-[var(--c-text-faint)]">Live AI Publish Mode</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {[
                      { id: "auto_publish", label: "Auto Publish" },
                      { id: "review_required", label: "Review Required" },
                    ].map((mode) => {
                      const active = String(getValue(feed, "live_ai_publish_mode", feed.live_ai_publish_mode || "auto_publish")) === mode.id;
                      return (
                        <button
                          key={mode.id}
                          type="button"
                          onClick={() => updateDraft(feed, "live_ai_publish_mode", mode.id)}
                          className={[
                            "rounded-[var(--r-pill)] border px-3 py-2 text-sm transition-colors",
                            active
                              ? "border-[var(--c-accent)] bg-[var(--c-accent-soft)] text-[var(--c-text)]"
                              : "border-[var(--c-border)] text-[var(--c-text-muted)] hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--c-text)]",
                          ].join(" ")}
                        >
                          {mode.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-3 text-xs leading-5 text-[var(--c-text-faint)]">
                    `Auto Publish` keeps live odds fully automated. `Review Required` stores the generated live board as draft odds so you can inspect it in `Draft Odds` or `Odds Desk` before publishing.
                  </p>
                </div>

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
                  Prematch defaults to `match_winner` and `over_under`. In-play uses the safe structured cricket in-play market only. Review mode affects live LangGraph publishing, not the per-ball pricing logic itself.
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
