"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { useResolveCricketSeason } from "@/hooks/useSuperAdmin";
import type { CompetitionFeed, Provider } from "@/lib/api";

export function CompetitionFeedForm({
  providers,
  initialData,
  onSubmit,
}: {
  providers: Provider[];
  initialData?: Partial<CompetitionFeed>;
  onSubmit: (body: Record<string, unknown>) => Promise<void>;
}) {
  const providerOptions = useMemo(
    () => providers.filter((item) => item.is_enabled),
    [providers],
  );

  const [formData, setFormData] = useState({
    name: initialData?.name || "",
    sport: initialData?.sport || "cricket",
    provider_id: initialData?.provider_id || providerOptions[0]?.id || "",
    competition_key: initialData?.competition_key || "",
    league_id: initialData?.league_id || "",
    season_id: initialData?.season_id || "",
    region: initialData?.region || "",
    track: initialData?.track || "",
    import_mode: initialData?.import_mode || "season",
    enabled: initialData?.enabled ?? true,
    live_sync_enabled: initialData?.live_sync_enabled ?? true,
    import_provider_odds: initialData?.import_provider_odds ?? false,
    generate_platform_odds: initialData?.generate_platform_odds ?? true,
    upcoming_window_days: String(initialData?.upcoming_window_days ?? 7),
    live_start_offset_minutes: String(initialData?.live_start_offset_minutes ?? 30),
    live_poll_interval_seconds: String(initialData?.live_poll_interval_seconds ?? 30),
    live_stop_offset_minutes: String(initialData?.live_stop_offset_minutes ?? 15),
    auto_generate_prematch_odds: Boolean(initialData?.auto_generate_prematch_odds ?? false),
    auto_generate_inplay_odds: Boolean(initialData?.auto_generate_inplay_odds ?? false),
    prematch_generation_window_minutes: String(initialData?.prematch_generation_window_minutes ?? 180),
    inplay_generation_interval_seconds: String(initialData?.inplay_generation_interval_seconds ?? 30),
    max_automation_runs_per_match: String(initialData?.max_automation_runs_per_match ?? 8),
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [resolutionMessage, setResolutionMessage] = useState("");
  const resolveCricketSeason = useResolveCricketSeason();

  const selectedProvider = useMemo(
    () => providerOptions.find((provider) => provider.id === formData.provider_id),
    [providerOptions, formData.provider_id],
  );

  useEffect(() => {
    if (!formData.provider_id && providerOptions.length > 0) {
      setFormData((prev) => ({ ...prev, provider_id: providerOptions[0].id }));
    }
  }, [formData.provider_id, providerOptions]);

  const canResolveSportmonksSeason =
    formData.sport === "cricket" &&
    selectedProvider?.name === "sportmonks" &&
    formData.import_mode === "season" &&
    formData.league_id.trim() !== "";

  const handleResolveSeason = async () => {
    if (!canResolveSportmonksSeason) return;

    setError("");
    setResolutionMessage("");

    try {
      const result = (await resolveCricketSeason.mutateAsync(formData.league_id.trim())) as {
        data?: {
          season_id?: string;
          season_label?: string | null;
          season_name?: string | null;
        };
      };

      const seasonId = result?.data?.season_id;

      if (!seasonId) {
        setError("Unable to resolve a season for that SportMonks league right now.");
        return;
      }

      setFormData((prev) => ({ ...prev, season_id: seasonId }));
      setResolutionMessage(result?.data?.season_label || result?.data?.season_name || `Resolved season ${seasonId}`);
    } catch {
      setError("Unable to resolve the current season for that SportMonks league right now.");
      setFormData((prev) => ({ ...prev, season_id: "" }));
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      await onSubmit({
        ...formData,
        upcoming_window_days: Number(formData.upcoming_window_days),
        live_start_offset_minutes: Number(formData.live_start_offset_minutes),
        live_poll_interval_seconds: Number(formData.live_poll_interval_seconds),
        live_stop_offset_minutes: Number(formData.live_stop_offset_minutes),
        prematch_generation_window_minutes: Number(formData.prematch_generation_window_minutes),
        inplay_generation_interval_seconds: Number(formData.inplay_generation_interval_seconds),
        max_automation_runs_per_match: Number(formData.max_automation_runs_per_match),
      });
    } catch {
      setError("Unable to save competition feed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card variant="surface-2" className="p-6">
      <h2 className="text-lg font-semibold text-[var(--c-text)]">Create Competition Feed</h2>
      <p className="mt-2 text-sm text-[var(--c-text-muted)]">
        Define the business-level feed the super admin will manage, import, and monitor.
      </p>

      {error ? <Alert variant="error" className="mt-4">{error}</Alert> : null}

      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        <Input
          label="Feed Name"
          value={formData.name}
          onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
          placeholder="IPL 2026 via SportMonks"
          required
        />

        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-[var(--c-text)]">Sport</label>
            <select
              value={formData.sport}
              onChange={(e) => setFormData((prev) => ({ ...prev, sport: e.target.value }))}
              className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-2 text-[var(--c-text)]"
            >
              <option value="cricket">Cricket</option>
              <option value="football">Football</option>
              <option value="tennis">Tennis</option>
              <option value="horse_racing">Horse Racing</option>
              <option value="dog_racing">Dog Racing</option>
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-[var(--c-text)]">Provider</label>
            <select
              value={formData.provider_id}
              onChange={(e) => setFormData((prev) => ({ ...prev, provider_id: e.target.value }))}
              className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-2 text-[var(--c-text)]"
            >
              {providerOptions.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label="Competition Key"
            value={formData.competition_key}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, competition_key: e.target.value }))
            }
            placeholder="ipl_2026"
            required
          />
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-[var(--c-text)]">Import Mode</label>
            <select
              value={formData.import_mode}
              onChange={(e) => setFormData((prev) => ({ ...prev, import_mode: e.target.value }))}
              className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-2 text-[var(--c-text)]"
            >
              <option value="season">Season</option>
              <option value="date_window">Date Window</option>
              <option value="region">Region</option>
              <option value="track">Track</option>
              <option value="tournament">Tournament</option>
            </select>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label="League ID"
            value={formData.league_id}
            onChange={(e) => setFormData((prev) => ({ ...prev, league_id: e.target.value }))}
          />
          <div className="space-y-2">
            <Input
              label="Season ID"
              value={formData.season_id}
              onChange={(e) => {
                setResolutionMessage("");
                setFormData((prev) => ({ ...prev, season_id: e.target.value }));
              }}
            />
            {canResolveSportmonksSeason ? (
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void handleResolveSeason()}
                  disabled={resolveCricketSeason.isPending}
                >
                  {resolveCricketSeason.isPending ? "Resolving..." : "Resolve Season from League"}
                </Button>
                <span className="text-xs text-[var(--c-text-muted)]">
                  Use this when SportMonks only gives you a league ID.
                </span>
              </div>
            ) : null}
            {resolutionMessage ? (
              <p className="text-xs text-[var(--c-success)]">{resolutionMessage}</p>
            ) : null}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label="Region"
            value={formData.region}
            onChange={(e) => setFormData((prev) => ({ ...prev, region: e.target.value }))}
          />
          <Input
            label="Track"
            value={formData.track}
            onChange={(e) => setFormData((prev) => ({ ...prev, track: e.target.value }))}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Input
            label="Upcoming Window Days"
            type="number"
            min="0"
            value={formData.upcoming_window_days}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, upcoming_window_days: e.target.value }))
            }
          />
          <Input
            label="Live Start Offset (min)"
            type="number"
            min="0"
            value={formData.live_start_offset_minutes}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, live_start_offset_minutes: e.target.value }))
            }
          />
          <Input
            label="Live Poll (sec)"
            type="number"
            min="1"
            value={formData.live_poll_interval_seconds}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, live_poll_interval_seconds: e.target.value }))
            }
          />
          <Input
            label="Live Stop Offset (min)"
            type="number"
            min="0"
            value={formData.live_stop_offset_minutes}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, live_stop_offset_minutes: e.target.value }))
            }
          />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex items-center gap-3 text-sm text-[var(--c-text)]">
            <input
              type="checkbox"
              checked={formData.enabled}
              onChange={(e) => setFormData((prev) => ({ ...prev, enabled: e.target.checked }))}
            />
            Feed enabled
          </label>
          <label className="flex items-center gap-3 text-sm text-[var(--c-text)]">
            <input
              type="checkbox"
              checked={formData.live_sync_enabled}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, live_sync_enabled: e.target.checked }))
              }
            />
            Live sync enabled
          </label>
          <label className="flex items-center gap-3 text-sm text-[var(--c-text)]">
            <input
              type="checkbox"
              checked={formData.import_provider_odds}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, import_provider_odds: e.target.checked }))
              }
            />
            Import provider odds
          </label>
          <label className="flex items-center gap-3 text-sm text-[var(--c-text)]">
            <input
              type="checkbox"
              checked={formData.generate_platform_odds}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, generate_platform_odds: e.target.checked }))
              }
            />
            Generate platform odds
          </label>
        </div>

        {formData.sport === "cricket" ? (
          <div className="space-y-4 rounded-[var(--r-card)] border border-[var(--c-border)] p-4">
            <div>
              <h3 className="text-sm font-semibold text-[var(--c-text)]">Cricket Automation</h3>
              <p className="mt-1 text-xs leading-5 text-[var(--c-text-muted)]">
                These settings create draft odds automatically when the feed reaches eligible pre-match or live windows. Publishing still stays manual.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex items-center gap-3 text-sm text-[var(--c-text)]">
                <input
                  type="checkbox"
                  checked={formData.auto_generate_prematch_odds}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, auto_generate_prematch_odds: e.target.checked }))
                  }
                />
                Auto-generate prematch drafts
              </label>
              <label className="flex items-center gap-3 text-sm text-[var(--c-text)]">
                <input
                  type="checkbox"
                  checked={formData.auto_generate_inplay_odds}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, auto_generate_inplay_odds: e.target.checked }))
                  }
                />
                Auto-generate in-play drafts
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <Input
                label="Prematch Window (min)"
                type="number"
                min="1"
                value={formData.prematch_generation_window_minutes}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, prematch_generation_window_minutes: e.target.value }))
                }
              />
              <Input
                label="In-Play Interval (sec)"
                type="number"
                min="5"
                value={formData.inplay_generation_interval_seconds}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, inplay_generation_interval_seconds: e.target.value }))
                }
              />
              <Input
                label="Max Runs / Match"
                type="number"
                min="1"
                value={formData.max_automation_runs_per_match}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, max_automation_runs_per_match: e.target.value }))
                }
              />
            </div>
          </div>
        ) : null}

        <Button type="submit" variant="primary" disabled={submitting || !formData.provider_id}>
          {submitting ? "Saving..." : "Save Feed"}
        </Button>
      </form>
    </Card>
  );
}
