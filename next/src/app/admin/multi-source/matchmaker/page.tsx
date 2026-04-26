"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import {
  useApproveMatchSuggestion,
  useCreateScraperConfiguration,
  useCreateEgressGateway,
  useCricketPollingProfiles,
  useDeleteScraperConfiguration,
  useDeleteEgressGateway,
  useEgressGateways,
  useFetchSourceNow,
  useInjectTestSuggestion,
  useManualLinkMatchSuggestion,
  useMultiSourceAutomationEvents,
  useMultiSourceAutomationStatus,
  useMultiSourceCanonicalMatches,
  useMultiSourceHealth,
  useMultiSourceMatchSuggestions,
  usePruneInvalidMatchSuggestions,
  useRejectMatchSuggestion,
  useReplayScraperConfiguration,
  useReplayScraperConfigurations,
  useScraperConfigurations,
  useSourceRefreshAdvisory,
  useUpdateEgressGateway,
  useUpdateScraperConfiguration,
} from "@/hooks/useSuperAdmin";
import type {
  CanonicalMatchCandidate,
  CricketPollingProfileResponse,
  EgressGateway,
  MatchMappingSuggestion,
  MatchSuggestionSummary,
  MultiSourceAutomationEvent,
  MultiSourceAutomationStatus,
  MultiSourceHealth,
  ScraperConfiguration,
  SourceRefreshAdvisory,
} from "@/lib/api";
import { formatDateTime } from "@/lib/format";

type SuggestionFilters = {
  status?: string;
  source_name?: string;
  competition?: string;
};

type ScraperDraft = {
  source_name: string;
  transport: "websocket" | "polling";
  bootstrap_url: string;
  ws_url: string;
  poll_url: string;
  gateway_id: string;
  is_active: boolean;
};

type GatewayDraft = {
  name: string;
  url: string;
  is_default_direct: boolean;
};

type PollingBoardFilter = "all" | "risky" | "fetchable" | "unmapped";
type PollingBoardSort = "priority" | "stale_first" | "kickoff_nearest" | "live_activity";
type PollingBoardPreset = "custom" | "live_trading_queue" | "unmapped_first" | "high_risk_review";

function normalizeString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function safeTimestamp(value?: string | null) {
  if (!value) {
    return 0;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pollingPriorityScore(profile: CricketPollingProfileResponse["data"][number]) {
  const phaseScore =
    profile.source_refresh_phase === "hot_live"
      ? 5
      : profile.source_refresh_phase === "warmup"
        ? 4
        : profile.source_refresh_phase === "cooldown"
          ? 3
          : profile.source_refresh_phase === "scheduled"
            ? 2
            : 1;
  const riskScore = profile.risk_flags.length;
  const refreshScore = profile.source_refresh_required ? 4 : 0;
  const pendingScore = profile.source_refresh_status?.last_status === "requested" ? 3 : 0;
  const mappingPenalty = profile.source_fetch_enabled ? 1 : 0;

  return phaseScore * 100 + riskScore * 10 + refreshScore + pendingScore + mappingPenalty;
}

function snapshotTeamName(snapshot: Record<string, unknown> | null | undefined, side: "home_team" | "away_team") {
  const team = snapshot?.[side];
  return typeof team === "object" && team !== null ? normalizeString((team as Record<string, unknown>).name) : "";
}

function snapshotCompetition(snapshot: Record<string, unknown> | null | undefined) {
  const competition = snapshot?.competition;
  if (typeof competition === "object" && competition !== null) {
    return normalizeString((competition as Record<string, unknown>).name);
  }

  return normalizeString(snapshot?.competition_name);
}

function snapshotKickoff(snapshot: Record<string, unknown> | null | undefined) {
  const value = snapshot?.start_time;
  return typeof value === "string" ? value : undefined;
}

function deriveSuggestionFlags(suggestion: MatchMappingSuggestion) {
  const sourceSnapshot = (suggestion.source_snapshot ?? {}) as Record<string, unknown>;
  const flags: Array<{ label: string; tone: "warn" | "danger" | "info" }> = [];
  const confidence = Number(suggestion.confidence || 0);
  const hasCandidate = Boolean(suggestion.candidate_canonical_match?.id);
  const hasKickoff = Boolean(snapshotKickoff(sourceSnapshot));
  const home = snapshotTeamName(sourceSnapshot, "home_team");
  const away = snapshotTeamName(sourceSnapshot, "away_team");

  if (suggestion.mapping_status === "needs_review") {
    flags.push({ label: "manual review", tone: "warn" });
  }
  if (!hasCandidate) {
    flags.push({ label: "no candidate", tone: "danger" });
  }
  if (confidence < 0.5) {
    flags.push({ label: "low confidence", tone: "warn" });
  }
  if (!hasKickoff) {
    flags.push({ label: "missing kickoff", tone: "info" });
  }
  if (!home || !away) {
    flags.push({ label: "invalid teams", tone: "danger" });
  }

  return flags;
}

function StatusBadge({ status }: { status: string }) {
  const className =
    status === "manual_confirmed"
      ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
      : status === "rejected"
        ? "border-rose-400/30 bg-rose-500/10 text-rose-200"
        : status === "needs_review"
          ? "border-amber-400/30 bg-amber-500/10 text-amber-200"
          : "border-sky-400/30 bg-sky-500/10 text-sky-200";

  return (
    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${className}`}>
      {status.replaceAll("_", " ")}
    </span>
  );
}

function SummaryCard({ title, value, tone }: { title: string; value: number; tone?: "default" | "good" | "warn" }) {
  const toneClass =
    tone === "good"
      ? "text-emerald-200 border-emerald-400/20 bg-emerald-500/8"
      : tone === "warn"
        ? "text-amber-200 border-amber-400/20 bg-amber-500/8"
        : "text-[var(--c-text)] border-[var(--c-border)] bg-[var(--c-surface-1)]";

  return (
    <Card variant="surface-1" className={`p-4 ${toneClass}`}>
      <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--c-text-faint)]">{title}</p>
      <p className="mt-3 text-3xl font-semibold">{value}</p>
    </Card>
  );
}

function HealthPill({ label, ok, detail }: { label: string; ok: boolean; detail?: string }) {
  return (
    <div
      className={`rounded-[var(--r-sm)] border px-3 py-3 ${
        ok ? "border-emerald-400/25 bg-emerald-500/8" : "border-rose-400/25 bg-rose-500/8"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${ok ? "bg-emerald-300" : "bg-rose-300"}`} />
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--c-text)]">{label}</p>
      </div>
      {detail ? <p className="mt-2 text-sm text-[var(--c-text-muted)]">{detail}</p> : null}
    </div>
  );
}

function CandidatePreview({ candidate }: { candidate?: CanonicalMatchCandidate | null }) {
  if (!candidate) {
    return (
      <div className="rounded-[var(--r-sm)] border border-dashed border-white/12 bg-black/10 p-4 text-sm text-[var(--c-text-muted)]">
        No candidate match is linked yet. Use manual search to force-link this source match.
      </div>
    );
  }

  return (
    <div className="rounded-[var(--r-sm)] border border-white/10 bg-black/10 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--c-text-faint)]">Canonical Match</p>
          <h3 className="mt-2 text-lg font-semibold text-[var(--c-text)]">
            {candidate.home_team?.name || "Unknown"} vs {candidate.away_team?.name || "Unknown"}
          </h3>
          <p className="mt-2 text-sm text-[var(--c-text-muted)]">{candidate.competition_name || "Competition unavailable"}</p>
        </div>
        <div className="text-right text-xs text-[var(--c-text-muted)]">
          <p className="font-mono text-[var(--c-text)]">{candidate.id.slice(0, 8)}...</p>
          <p className="mt-2">{formatDateTime(candidate.start_time || undefined)}</p>
        </div>
      </div>
    </div>
  );
}

function TransportSelector({
  value,
  onChange,
}: {
  value: "websocket" | "polling";
  onChange: (value: "websocket" | "polling") => void;
}) {
  return (
    <div className="grid gap-2 md:grid-cols-2">
      <button
        type="button"
        onClick={() => onChange("websocket")}
        className={`rounded-[var(--r-sm)] border px-4 py-3 text-left text-sm ${
          value === "websocket"
            ? "border-sky-400/40 bg-sky-500/10 text-sky-100"
            : "border-[var(--c-border)] bg-[var(--c-surface-1)] text-[var(--c-text-muted)]"
        }`}
      >
        <span className="block font-semibold text-[var(--c-text)]">WebSocket</span>
        <span className="mt-1 block text-xs">Persistent live socket transport</span>
      </button>
      <button
        type="button"
        onClick={() => onChange("polling")}
        className={`rounded-[var(--r-sm)] border px-4 py-3 text-left text-sm ${
          value === "polling"
            ? "border-amber-400/40 bg-amber-500/10 text-amber-100"
            : "border-[var(--c-border)] bg-[var(--c-surface-1)] text-[var(--c-text-muted)]"
        }`}
      >
        <span className="block font-semibold text-[var(--c-text)]">HTTP Polling</span>
        <span className="mt-1 block text-xs">High-frequency XHR/JSON polling transport</span>
      </button>
    </div>
  );
}

function ScraperSettingsDrawer({
  open,
  onClose,
  configs,
  gateways,
  saving,
  deletingId,
  onCreate,
  onUpdate,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  configs: ScraperConfiguration[];
  gateways: EgressGateway[];
  saving: boolean;
  deletingId?: string | null;
  onCreate: (draft: ScraperDraft) => Promise<void>;
  onUpdate: (id: string, draft: ScraperDraft) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [createDraft, setCreateDraft] = useState<ScraperDraft>({
    source_name: "",
    transport: "websocket",
    bootstrap_url: "",
    ws_url: "",
    poll_url: "",
    gateway_id: "",
    is_active: false,
  });
  const [editState, setEditState] = useState<Record<string, ScraperDraft>>({});

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/55 backdrop-blur-sm">
      <div className="h-full w-full max-w-3xl overflow-y-auto border-l border-white/10 bg-[var(--c-bg)] p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--c-accent)]">Multi-Source</p>
            <h2 className="mt-2 text-2xl font-semibold text-[var(--c-text)]">Scraper Settings</h2>
            <p className="mt-2 text-sm text-[var(--c-text-muted)]">
              Edit transport targets and assign egress routes for each source. Saving pushes a control message to the Rust worker over Redis.
            </p>
          </div>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>

        <Card variant="surface-1" className="mt-6 p-5">
          <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--c-text-faint)]">New scraper source</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <input
              value={createDraft.source_name}
              onChange={(event) => setCreateDraft((current) => ({ ...current, source_name: event.target.value }))}
              placeholder="Source name, for example one_x_bet_worker"
              className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-3 text-sm text-[var(--c-text)]"
            />
            <label className="flex items-center gap-3 rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-3 text-sm text-[var(--c-text)]">
              <input
                type="checkbox"
                checked={createDraft.is_active}
                onChange={(event) => setCreateDraft((current) => ({ ...current, is_active: event.target.checked }))}
              />
              Active
            </label>
            <div className="md:col-span-2">
              <TransportSelector
                value={createDraft.transport}
                onChange={(transport) =>
                  setCreateDraft((current) => ({
                    ...current,
                    transport,
                    ws_url: transport === "websocket" ? current.ws_url : "",
                    poll_url: transport === "polling" ? current.poll_url : "",
                  }))
                }
              />
            </div>
            <input
              value={createDraft.bootstrap_url}
              onChange={(event) => setCreateDraft((current) => ({ ...current, bootstrap_url: event.target.value }))}
              placeholder="https://target.example/bootstrap"
              className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-3 text-sm text-[var(--c-text)] md:col-span-2"
            />
            {createDraft.transport === "websocket" ? (
              <input
                value={createDraft.ws_url}
                onChange={(event) => setCreateDraft((current) => ({ ...current, ws_url: event.target.value }))}
                placeholder="wss://target.example/live"
                className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-3 text-sm text-[var(--c-text)] md:col-span-2"
              />
            ) : (
              <input
                value={createDraft.poll_url}
                onChange={(event) => setCreateDraft((current) => ({ ...current, poll_url: event.target.value }))}
                placeholder="https://target.example/poll"
                className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-3 text-sm text-[var(--c-text)] md:col-span-2"
              />
            )}
            <select
              value={createDraft.gateway_id}
              onChange={(event) => setCreateDraft((current) => ({ ...current, gateway_id: event.target.value }))}
              className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-3 text-sm text-[var(--c-text)] md:col-span-2"
            >
              <option value="">No gateway assigned</option>
              {gateways.map((gateway) => (
                <option key={gateway.id} value={gateway.id}>
                  {gateway.name} {gateway.is_default_direct ? "(Direct Route)" : gateway.url ? `(${gateway.url})` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-4 flex justify-end">
            <Button
              onClick={async () => {
                await onCreate(createDraft);
                setCreateDraft({
                  source_name: "",
                  transport: "websocket",
                  bootstrap_url: "",
                  ws_url: "",
                  poll_url: "",
                  gateway_id: "",
                  is_active: false,
                });
              }}
              disabled={saving || !createDraft.source_name.trim()}
            >
              Create Source
            </Button>
          </div>
        </Card>

        <div className="mt-6 space-y-4">
          {configs.length === 0 ? (
            <Card variant="surface-1" className="p-5 text-sm text-[var(--c-text-muted)]">
              No scraper configurations have been saved yet.
            </Card>
          ) : (
            configs.map((configuration) => {
              const draft =
                editState[configuration.id] ??
                ({
                  source_name: configuration.source_name,
                  transport: configuration.transport === "polling" ? "polling" : "websocket",
                  bootstrap_url: configuration.bootstrap_url || "",
                  ws_url: configuration.ws_url || "",
                  poll_url: configuration.poll_url || "",
                  gateway_id: configuration.gateway_id || "",
                  is_active: configuration.is_active,
                } satisfies ScraperDraft);

              return (
                <Card key={configuration.id} variant="surface-1" className="p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.22em] text-[var(--c-text-faint)]">Source</p>
                      <h3 className="mt-2 text-lg font-semibold text-[var(--c-text)]">{configuration.source_name}</h3>
                      <p className="mt-2 text-sm text-[var(--c-text-muted)]">
                        Updated {formatDateTime(configuration.updated_at || configuration.inserted_at || undefined)}
                      </p>
                      <p className="mt-1 text-xs uppercase tracking-[0.16em] text-[var(--c-text-faint)]">{draft.transport}</p>
                      <p className="mt-1 text-xs text-[var(--c-text-muted)]">
                        Route: {configuration.gateway?.name || "No gateway assigned"}
                      </p>
                    </div>
                    <span
                      className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.16em] ${
                        draft.is_active
                          ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
                          : "border-white/10 bg-black/10 text-[var(--c-text-muted)]"
                      }`}
                    >
                      {draft.is_active ? "active" : "inactive"}
                    </span>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <input
                      value={draft.source_name}
                      onChange={(event) =>
                        setEditState((current) => ({
                          ...current,
                          [configuration.id]: { ...draft, source_name: event.target.value },
                        }))
                      }
                      className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-3 text-sm text-[var(--c-text)]"
                    />
                    <label className="flex items-center gap-3 rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-3 text-sm text-[var(--c-text)]">
                      <input
                        type="checkbox"
                        checked={draft.is_active}
                        onChange={(event) =>
                          setEditState((current) => ({
                            ...current,
                            [configuration.id]: { ...draft, is_active: event.target.checked },
                          }))
                        }
                      />
                      Active
                    </label>
                    <div className="md:col-span-2">
                      <TransportSelector
                        value={draft.transport}
                        onChange={(transport) =>
                          setEditState((current) => ({
                            ...current,
                            [configuration.id]: {
                              ...draft,
                              transport,
                              ws_url: transport === "websocket" ? draft.ws_url : "",
                              poll_url: transport === "polling" ? draft.poll_url : "",
                            },
                          }))
                        }
                      />
                    </div>
                    <input
                      value={draft.bootstrap_url}
                      onChange={(event) =>
                        setEditState((current) => ({
                          ...current,
                          [configuration.id]: { ...draft, bootstrap_url: event.target.value },
                        }))
                      }
                      placeholder="https://target.example/bootstrap"
                      className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-3 text-sm text-[var(--c-text)] md:col-span-2"
                    />
                    {draft.transport === "websocket" ? (
                      <input
                        value={draft.ws_url}
                        onChange={(event) =>
                          setEditState((current) => ({
                            ...current,
                            [configuration.id]: { ...draft, ws_url: event.target.value },
                          }))
                        }
                        placeholder="wss://target.example/live"
                        className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-3 text-sm text-[var(--c-text)] md:col-span-2"
                      />
                    ) : (
                      <input
                        value={draft.poll_url}
                        onChange={(event) =>
                          setEditState((current) => ({
                            ...current,
                            [configuration.id]: { ...draft, poll_url: event.target.value },
                          }))
                        }
                        placeholder="https://target.example/poll"
                        className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-3 text-sm text-[var(--c-text)] md:col-span-2"
                      />
                    )}
                    <select
                      value={draft.gateway_id}
                      onChange={(event) =>
                        setEditState((current) => ({
                          ...current,
                          [configuration.id]: { ...draft, gateway_id: event.target.value },
                        }))
                      }
                      className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-3 text-sm text-[var(--c-text)] md:col-span-2"
                    >
                      <option value="">No gateway assigned</option>
                      {gateways.map((gateway) => (
                        <option key={gateway.id} value={gateway.id}>
                          {gateway.name} {gateway.is_default_direct ? "(Direct Route)" : gateway.url ? `(${gateway.url})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="mt-4 flex flex-wrap justify-end gap-3">
                    <Button
                      variant="destructive"
                      onClick={() => onDelete(configuration.id)}
                      disabled={saving || deletingId === configuration.id}
                    >
                      Delete
                    </Button>
                    <Button
                      onClick={() => onUpdate(configuration.id, draft)}
                      disabled={saving || !draft.source_name.trim()}
                    >
                      Save & Push
                    </Button>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function OperationsPanel({
  replayingAll,
  replayingOneId,
  pruning,
  onReplayAll,
  onReplayOne,
  onPruneInvalid,
  scraperConfigurations,
  automationStatus,
  pollingProfiles,
  pollingProfilesLoading,
  onRefreshProfiles,
  onRequestAdvisory,
  onFetchSourceNow,
  advisoryByMatchId,
  requestingAdvisoryMatchId,
  fetchingSourceMatchId,
}: {
  replayingAll: boolean;
  replayingOneId?: string | null;
  pruning: boolean;
  onReplayAll: () => Promise<void>;
  onReplayOne: (id: string) => Promise<void>;
  onPruneInvalid: () => Promise<void>;
  scraperConfigurations: ScraperConfiguration[];
  automationStatus: MultiSourceAutomationStatus | null;
  pollingProfiles: CricketPollingProfileResponse | null;
  pollingProfilesLoading: boolean;
  onRefreshProfiles: () => Promise<void>;
  onRequestAdvisory: (matchId: string) => Promise<void>;
  onFetchSourceNow: (matchId: string) => Promise<void>;
  advisoryByMatchId: Record<string, SourceRefreshAdvisory>;
  requestingAdvisoryMatchId?: string | null;
  fetchingSourceMatchId?: string | null;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <Card variant="surface-1" className="p-5">
        <p className="text-xs uppercase tracking-[0.24em] text-[var(--c-accent)]">Operations</p>
        <h2 className="mt-2 text-xl font-semibold text-[var(--c-text)]">Runtime Control</h2>
        <p className="mt-2 text-sm text-[var(--c-text-muted)]">
          Use these controls to rebroadcast saved worker configs and clean the queue when invalid source rows slip through.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button variant="secondary" onClick={onReplayAll} disabled={replayingAll}>
            Replay All Scraper Configs
          </Button>
          <Button variant="secondary" onClick={onPruneInvalid} disabled={pruning}>
            Prune Invalid Suggestions
          </Button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {scraperConfigurations.map((configuration) => (
            <div key={configuration.id} className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-black/10 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[var(--c-text)]">{configuration.source_name}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.16em] text-[var(--c-text-faint)]">
                    {configuration.transport} · {configuration.is_active ? "active" : "inactive"}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  onClick={() => onReplayOne(configuration.id)}
                  disabled={replayingOneId === configuration.id}
                >
                  Replay Worker
                </Button>
              </div>
            </div>
          ))}
        </div>
        </Card>

        <Card variant="surface-1" className="p-5">
        <p className="text-xs uppercase tracking-[0.24em] text-[var(--c-accent)]">AI Orchestration Policy</p>
        <h2 className="mt-2 text-xl font-semibold text-[var(--c-text)]">Managed Boundaries</h2>
        <div className="mt-4 space-y-3 text-sm text-[var(--c-text-muted)]">
          <p><span className="font-semibold text-[var(--c-text)]">AI may manage:</span> polling cadence, stale market cleanup, invalid-row pruning, candidate reranking, and source re-fetch requests when match context becomes ambiguous.</p>
          <p><span className="font-semibold text-[var(--c-text)]">AI must not invent:</span> bookmaker prices, suspensions, or market availability. Those remain source-truth from 1xBet.</p>
          <p><span className="font-semibold text-[var(--c-text)]">Cost and safety:</span> imported Sportmonks cricket matches define the allowed universe, while operators can rebroadcast configs instead of hammering the source manually.</p>
        </div>
        </Card>
      </div>

      <AutomationStatusPanel status={automationStatus} />

      <CricketPollingProfilesPanel
        response={pollingProfiles}
        loading={pollingProfilesLoading}
        onRefresh={onRefreshProfiles}
        onRequestAdvisory={onRequestAdvisory}
        onFetchSourceNow={onFetchSourceNow}
        advisoryByMatchId={advisoryByMatchId}
        requestingAdvisoryMatchId={requestingAdvisoryMatchId}
        fetchingSourceMatchId={fetchingSourceMatchId}
      />
    </div>
  );
}

function AutomationStatusPanel({ status }: { status: MultiSourceAutomationStatus | null }) {
  if (!status) {
    return (
      <Card variant="surface-1" className="p-5 text-sm text-[var(--c-text-muted)]">
        Automation status is loading.
      </Card>
    );
  }

  const orchestrator = status.workers?.orchestrator;
  const refreshResult = (orchestrator?.refresh_result ?? {}) as Record<string, unknown>;
  const mappingResult = (orchestrator?.mapping_result ?? {}) as Record<string, unknown>;
  const timeoutStatus = status.workers?.refresh_timeout;
  const pruneStatus = status.workers?.matchmaker_prune;

  return (
    <Card variant="surface-1" className="p-5">
      <div className="flex flex-col gap-3 border-b border-[var(--c-border)] pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--c-accent)]">Automation Status</p>
          <h2 className="mt-2 text-xl font-semibold text-[var(--c-text)]">Live Automation Audit</h2>
          <p className="mt-2 text-sm text-[var(--c-text-muted)]">
            This confirms whether source refresh, AI-assisted match linking, timeout recovery, and queue cleanup are running automatically.
          </p>
        </div>
        <div className="text-right text-xs text-[var(--c-text-faint)]">
          <p>Generated {formatDateTime(status.generated_at || undefined) || "-"}</p>
          <p>AI {status.ai_enabled ? `on${status.ai_model ? ` · ${status.ai_model}` : ""}` : "off"}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <SummaryCard title="Pending Fetches" value={status.pending_source_fetches} tone="warn" />
        <SummaryCard title="Completed 24h" value={status.completed_source_fetches_24h} tone="good" />
        <SummaryCard title="Timed Out 24h" value={status.timed_out_source_fetches_24h} tone="warn" />
        <SummaryCard title="Auto Matched 24h" value={status.auto_confirmed_mappings_24h} tone="good" />
        <SummaryCard title="Open Live Queue" value={status.open_live_cricket_suggestions} tone="warn" />
        <SummaryCard title="AI" value={status.ai_enabled ? "On" : "Off"} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-black/10 p-4 text-sm">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--c-text-faint)]">Orchestrator</p>
          <p className="mt-2 text-[var(--c-text)]">Last run {formatDateTime(orchestrator?.ran_at || undefined) || "-"}</p>
          <p className="mt-2 text-[var(--c-text-muted)]">
            Requested {Number(refreshResult.requested ?? 0)} source refreshes, failed {Number(refreshResult.failed ?? 0)}.
          </p>
          <p className="mt-1 text-[var(--c-text-muted)]">
            Auto-confirmed {Number(mappingResult.auto_confirmed ?? 0)} mappings, failed {Number(mappingResult.failed ?? 0)}.
          </p>
        </div>
        <div className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-black/10 p-4 text-sm">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--c-text-faint)]">Timeout Recovery</p>
          <p className="mt-2 text-[var(--c-text)]">Last run {formatDateTime(timeoutStatus?.ran_at || undefined) || "-"}</p>
          <p className="mt-2 text-[var(--c-text-muted)]">
            Timeout window {timeoutStatus?.timeout_seconds || "-"}s.
          </p>
          <p className="mt-1 text-[var(--c-text-muted)]">
            Timed out {Number(((timeoutStatus?.result ?? {}) as Record<string, unknown>).timed_out ?? 0)} stuck fetches.
          </p>
        </div>
        <div className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-black/10 p-4 text-sm">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--c-text-faint)]">Queue Cleanup</p>
          <p className="mt-2 text-[var(--c-text)]">Last run {formatDateTime(pruneStatus?.ran_at || undefined) || "-"}</p>
          <p className="mt-2 text-[var(--c-text-muted)]">
            Deleted {Number(pruneStatus?.deleted_count ?? 0)} invalid Matchmaker rows in the latest prune pass.
          </p>
        </div>
      </div>
    </Card>
  );
}

function AutomationEventLogPanel({ events }: { events: MultiSourceAutomationEvent[] }) {
  return (
    <Card variant="surface-1" className="p-5">
      <div className="flex flex-col gap-3 border-b border-[var(--c-border)] pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--c-accent)]">Automation Events</p>
          <h2 className="mt-2 text-xl font-semibold text-[var(--c-text)]">Recent Source and Mapping Actions</h2>
          <p className="mt-2 text-sm text-[var(--c-text-muted)]">
            Each row shows what the automation actually did: source refresh requests, scraper results, auto-confirmed mappings, and timeout recovery.
          </p>
        </div>
      </div>

      {events.length === 0 ? (
        <p className="mt-4 text-sm text-[var(--c-text-muted)]">No automation events have been recorded yet.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {events.map((event) => (
            <div key={event.id} className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-black/10 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--c-text-faint)]">
                    {event.event_type.replaceAll("_", " ")} · {event.status}
                  </p>
                  <p className="mt-2 text-sm text-[var(--c-text)]">{event.message || "Automation event recorded."}</p>
                </div>
                <div className="text-right text-xs text-[var(--c-text-faint)]">
                  <p>{formatDateTime(event.inserted_at || undefined) || "-"}</p>
                  <p>{event.source_name ? `${event.source_name} · ${event.source_match_id || "-"}` : "system"}</p>
                </div>
              </div>

              <div className="mt-3 grid gap-3 text-sm text-[var(--c-text-muted)] md:grid-cols-3">
                <div>
                  <p className="text-[var(--c-text-faint)]">Imported match</p>
                  <p className="mt-1 text-[var(--c-text)]">{event.match_id || "-"}</p>
                </div>
                <div>
                  <p className="text-[var(--c-text-faint)]">Canonical match</p>
                  <p className="mt-1 text-[var(--c-text)]">{event.canonical_match_id || "-"}</p>
                </div>
                <div>
                  <p className="text-[var(--c-text-faint)]">Metadata</p>
                  <p className="mt-1 text-[var(--c-text)]">
                    {Object.keys(event.metadata || {}).length > 0 ? JSON.stringify(event.metadata) : "-"}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function CricketPollingProfilesPanel({
  response,
  loading,
  onRefresh,
  onRequestAdvisory,
  onFetchSourceNow,
  advisoryByMatchId,
  requestingAdvisoryMatchId,
  fetchingSourceMatchId,
}: {
  response: CricketPollingProfileResponse | null;
  loading: boolean;
  onRefresh: () => Promise<void>;
  onRequestAdvisory: (matchId: string) => Promise<void>;
  onFetchSourceNow: (matchId: string) => Promise<void>;
  advisoryByMatchId: Record<string, SourceRefreshAdvisory>;
  requestingAdvisoryMatchId?: string | null;
  fetchingSourceMatchId?: string | null;
}) {
  const profiles = useMemo(() => response?.data ?? [], [response]);
  const summary = response?.summary ?? null;
  const [boardFilter, setBoardFilter] = useState<PollingBoardFilter>("all");
  const [boardSort, setBoardSort] = useState<PollingBoardSort>("priority");
  const [boardPreset, setBoardPreset] = useState<PollingBoardPreset>("custom");
  const sortReferenceTime = safeTimestamp(response?.generated_at);

  function applyPreset(preset: PollingBoardPreset) {
    setBoardPreset(preset);

    switch (preset) {
      case "live_trading_queue":
        setBoardFilter("fetchable");
        setBoardSort("live_activity");
        return;
      case "unmapped_first":
        setBoardFilter("unmapped");
        setBoardSort("priority");
        return;
      case "high_risk_review":
        setBoardFilter("risky");
        setBoardSort("stale_first");
        return;
      case "custom":
      default:
        return;
    }
  }

  const filteredProfiles = useMemo(() => {
    const filtered = profiles.filter((profile) => {
      switch (boardFilter) {
        case "risky":
          return profile.source_refresh_required || profile.risk_flags.length > 0;
        case "fetchable":
          return Boolean(profile.source_fetch_enabled);
        case "unmapped":
          return !profile.source_fetch_enabled;
        default:
          return true;
      }
    });

    return filtered.sort((left, right) => {
      switch (boardSort) {
        case "stale_first":
          return safeTimestamp(left.source_refresh_status?.last_completed_at) - safeTimestamp(right.source_refresh_status?.last_completed_at);
        case "kickoff_nearest": {
          const leftDelta = Math.abs(safeTimestamp(left.start_time) - sortReferenceTime) || Number.MAX_SAFE_INTEGER;
          const rightDelta = Math.abs(safeTimestamp(right.start_time) - sortReferenceTime) || Number.MAX_SAFE_INTEGER;
          return leftDelta - rightDelta;
        }
        case "live_activity":
          return safeTimestamp(right.last_live_event_at) - safeTimestamp(left.last_live_event_at);
        case "priority":
        default:
          return pollingPriorityScore(right) - pollingPriorityScore(left);
      }
    });
  }, [boardFilter, boardSort, profiles, sortReferenceTime]);

  const pendingCount = profiles.filter((profile) => profile.source_refresh_status?.last_status === "requested").length;

  return (
    <Card variant="surface-1" className="p-5">
      <div className="flex flex-col gap-3 border-b border-[var(--c-border)] pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--c-accent)]">Cricket Source Policy</p>
          <h2 className="mt-2 text-xl font-semibold text-[var(--c-text)]">Imported Match Polling Profiles</h2>
          <p className="mt-2 max-w-3xl text-sm text-[var(--c-text-muted)]">
            This board shows how imported cricket matches should consume 1xBet source odds right now. Sportmonks drives state and timing; AI may adjust cadence and cleanup, but source prices remain external truth.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-right text-xs text-[var(--c-text-faint)]">
            <p>Generated {formatDateTime(response?.generated_at || undefined) || "-"}</p>
            <p>AI {response?.ai_enabled ? `on${response?.ai_model ? ` · ${response.ai_model}` : ""}` : "off"}</p>
          </div>
          <Button variant="secondary" onClick={onRefresh} disabled={loading}>
            Refresh Policy Board
          </Button>
        </div>
      </div>

      {summary ? (
        <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <SummaryCard title="Tracked" value={summary.total} />
          <SummaryCard title="Hot Live" value={summary.hot_live} tone="warn" />
          <SummaryCard title="Warmup" value={summary.warmup} />
          <SummaryCard title="Scheduled" value={summary.scheduled} />
          <SummaryCard title="Cooldown" value={summary.cooldown} tone="warn" />
          <SummaryCard title="Need Refresh" value={summary.needs_source_refresh} tone="good" />
        </div>
      ) : null}

      <div className="mt-4 flex flex-col gap-3 border-b border-[var(--c-border)] pb-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {([
              ["all", "All Matches"],
              ["risky", "Only Risky"],
              ["fetchable", "Only Fetchable"],
              ["unmapped", "Only Unmapped"],
            ] as Array<[PollingBoardFilter, string]>).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setBoardPreset("custom");
                  setBoardFilter(value);
                }}
                className={`rounded-full border px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] transition ${
                  boardFilter === value
                    ? "border-[var(--c-accent)] bg-[var(--c-accent)]/10 text-[var(--c-text)]"
                    : "border-white/10 bg-black/20 text-[var(--c-text-muted)] hover:border-[var(--c-border-strong)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {([
              ["priority", "Highest Risk"],
              ["stale_first", "Stale First"],
              ["kickoff_nearest", "Kickoff Nearest"],
              ["live_activity", "Latest Live Activity"],
            ] as Array<[PollingBoardSort, string]>).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setBoardPreset("custom");
                  setBoardSort(value);
                }}
                className={`rounded-full border px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] transition ${
                  boardSort === value
                    ? "border-[var(--c-accent)] bg-[var(--c-accent)]/10 text-[var(--c-text)]"
                    : "border-white/10 bg-black/20 text-[var(--c-text-muted)] hover:border-[var(--c-border-strong)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {([
              ["live_trading_queue", "Live Trading Queue"],
              ["unmapped_first", "Unmapped First"],
              ["high_risk_review", "High Risk Review"],
            ] as Array<[PollingBoardPreset, string]>).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => applyPreset(value)}
                className={`rounded-full border px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] transition ${
                  boardPreset === value
                    ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
                    : "border-white/10 bg-black/20 text-[var(--c-text-muted)] hover:border-[var(--c-border-strong)]"
                }`}
              >
                {label}
              </button>
            ))}
            {boardPreset !== "custom" ? (
              <button
                type="button"
                onClick={() => setBoardPreset("custom")}
                className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] text-[var(--c-text-muted)] transition hover:border-[var(--c-border-strong)]"
              >
                Exit Preset
              </button>
            ) : null}
          </div>
        </div>
        <div className="text-xs text-[var(--c-text-faint)]">
          <p>
            Showing {filteredProfiles.length} of {profiles.length} tracked matches
          </p>
          <p>
            {pendingCount > 0
              ? `${pendingCount} one-shot fetch ${pendingCount === 1 ? "is" : "are"} awaiting scraper acknowledgement`
              : "Board is on standard refresh cadence"}
          </p>
          <p>{boardPreset === "custom" ? "Custom operator view" : `Preset active: ${boardPreset.replaceAll("_", " ")}`}</p>
        </div>
      </div>

      {loading && profiles.length === 0 ? (
        <p className="mt-4 text-sm text-[var(--c-text-muted)]">Loading imported cricket polling profiles...</p>
      ) : profiles.length === 0 ? (
        <p className="mt-4 text-sm text-[var(--c-text-muted)]">No enabled imported cricket matches are available for policy tracking yet.</p>
      ) : filteredProfiles.length === 0 ? (
        <p className="mt-4 text-sm text-[var(--c-text-muted)]">
          No polling profiles match the current board filter.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {filteredProfiles.map((profile) => {
            const advisory = advisoryByMatchId[profile.match_id];

            return (
              <div key={profile.match_id} className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-black/10 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--c-text-faint)]">
                    {profile.competition_name || "Imported cricket feed"} · {profile.status || "unknown"}
                  </p>
                  <h3 className="mt-2 text-lg font-semibold text-[var(--c-text)]">
                    {profile.team1 || "Team 1"} vs {profile.team2 || "Team 2"}
                  </h3>
                  <p className="mt-2 text-sm text-[var(--c-text-muted)]">
                    {profile.rationale || "No policy rationale available."}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full border border-sky-400/30 bg-sky-500/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-sky-200">
                    {profile.source_refresh_phase.replaceAll("_", " ")}
                  </span>
                  <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-[var(--c-text-muted)]">
                    {profile.recommended_poll_interval_seconds > 0
                      ? `${profile.recommended_poll_interval_seconds}s cadence`
                      : "stop source polling"}
                  </span>
                  <span
                    className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] ${
                      profile.source_refresh_required
                        ? "border-amber-400/30 bg-amber-500/10 text-amber-200"
                        : "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
                    }`}
                  >
                    {profile.source_refresh_required ? "source refresh required" : "source stable"}
                  </span>
                  <Button
                    variant="secondary"
                    onClick={() => onRequestAdvisory(profile.match_id)}
                    disabled={requestingAdvisoryMatchId === profile.match_id}
                  >
                    Ask AI Refresh Advice
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => onFetchSourceNow(profile.match_id)}
                    disabled={!profile.source_fetch_enabled || fetchingSourceMatchId === profile.match_id}
                  >
                    Fetch 1xBet Now
                  </Button>
                </div>
              </div>

              <div className="mt-4 grid gap-3 text-sm text-[var(--c-text-muted)] md:grid-cols-4">
                <div>
                  <p className="text-[var(--c-text-faint)]">Kickoff</p>
                  <p className="mt-1 text-[var(--c-text)]">{formatDateTime(profile.start_time || undefined)}</p>
                </div>
                <div>
                  <p className="text-[var(--c-text-faint)]">Score context</p>
                  <p className="mt-1 text-[var(--c-text)]">
                    Innings {profile.current_innings || 0} · Over {profile.current_over || "-"} · Ball {profile.current_ball_in_over || 0}
                  </p>
                </div>
                <div>
                  <p className="text-[var(--c-text-faint)]">Last live event</p>
                  <p className="mt-1 text-[var(--c-text)]">{formatDateTime(profile.last_live_event_at || undefined) || "-"}</p>
                </div>
                <div>
                  <p className="text-[var(--c-text-faint)]">AI policy</p>
                  <p className="mt-1 text-[var(--c-text)]">
                    {profile.ai_policy || "rules_only"}
                    {profile.ai_model ? ` · ${profile.ai_model}` : ""}
                  </p>
                </div>
                <div>
                  <p className="text-[var(--c-text-faint)]">Source mapping</p>
                  <p className="mt-1 text-[var(--c-text)]">
                    {profile.source_fetch_enabled ? `${profile.source_name} · ${profile.source_match_id}` : "No approved 1xBet mapping yet"}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 text-sm text-[var(--c-text-muted)] md:grid-cols-3">
                <div>
                  <p className="text-[var(--c-text-faint)]">Last fetch request</p>
                  <p className="mt-1 text-[var(--c-text)]">
                    {formatDateTime(profile.source_refresh_status?.last_requested_at || undefined) || "-"}
                  </p>
                </div>
                <div>
                  <p className="text-[var(--c-text-faint)]">Last fetch outcome</p>
                  <p className="mt-1 text-[var(--c-text)]">
                    {profile.source_refresh_status?.last_status || "idle"}
                    {profile.source_refresh_status?.last_completed_at
                      ? ` · ${formatDateTime(profile.source_refresh_status.last_completed_at || undefined)}`
                      : ""}
                  </p>
                </div>
                <div>
                  <p className="text-[var(--c-text-faint)]">Fetcher note</p>
                  <p className="mt-1 text-[var(--c-text)]">
                    {profile.source_refresh_status?.last_message || "No one-shot fetch has been recorded yet."}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {(profile.risk_flags ?? []).map((flag) => (
                  <span
                    key={`${profile.match_id}-${flag}`}
                    className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] ${
                      flag === "score_context_stale" || flag === "status_drift"
                        ? "border-rose-400/30 bg-rose-500/10 text-rose-200"
                        : flag === "suspended_markets" || flag === "live_without_in_play"
                          ? "border-amber-400/30 bg-amber-500/10 text-amber-200"
                          : "border-white/10 bg-black/20 text-[var(--c-text-muted)]"
                    }`}
                  >
                    {flag.replaceAll("_", " ")}
                  </span>
                ))}
                {profile.risk_flags.length === 0 ? (
                  <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-emerald-200">
                    no active risk flags
                  </span>
                ) : null}
              </div>
              {advisory ? (
                <div className="mt-4 rounded-[var(--r-sm)] border border-violet-400/20 bg-violet-500/8 p-4 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-violet-400/30 bg-violet-500/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-violet-200">
                      {advisory.ai_used ? "agent advisory" : "rules advisory"}
                    </span>
                    <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-[var(--c-text-muted)]">
                      {advisory.model}
                    </span>
                    <span
                      className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] ${
                        advisory.refresh_now
                          ? "border-amber-400/30 bg-amber-500/10 text-amber-200"
                          : "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
                      }`}
                    >
                      {advisory.refresh_now ? "refresh now" : "no immediate refresh"}
                    </span>
                    <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-[var(--c-text-muted)]">
                      {advisory.recommended_interval_seconds}s recommended
                    </span>
                    <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-[var(--c-text-muted)]">
                      confidence {(advisory.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                  <p className="mt-3 text-[var(--c-text)]">{advisory.reason}</p>
                  {advisory.requires_manual_review ? (
                    <p className="mt-2 text-amber-200">Manual review is recommended before trusting a slower cadence.</p>
                  ) : null}
                </div>
              ) : null}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function NetworkGatewaysPanel({
  gateways,
  saving,
  deletingId,
  onCreate,
  onUpdate,
  onDelete,
}: {
  gateways: EgressGateway[];
  saving: boolean;
  deletingId?: string | null;
  onCreate: (draft: GatewayDraft) => Promise<void>;
  onUpdate: (id: string, draft: GatewayDraft) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [createDraft, setCreateDraft] = useState<GatewayDraft>({ name: "", url: "", is_default_direct: false });
  const [editState, setEditState] = useState<Record<string, GatewayDraft>>({});

  return (
    <div className="space-y-4">
      <Card variant="surface-1" className="p-5">
        <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--c-text-faint)]">Add egress gateway</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <input
            value={createDraft.name}
            onChange={(event) => setCreateDraft((current) => ({ ...current, name: event.target.value }))}
            placeholder="Gateway name"
            className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-3 text-sm text-[var(--c-text)]"
          />
          <label className="flex items-center gap-3 rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-3 text-sm text-[var(--c-text)]">
            <input
              type="checkbox"
              checked={createDraft.is_default_direct}
              onChange={(event) => setCreateDraft((current) => ({ ...current, is_default_direct: event.target.checked }))}
            />
            Direct Route
          </label>
          <input
            value={createDraft.url}
            onChange={(event) => setCreateDraft((current) => ({ ...current, url: event.target.value }))}
            placeholder="http://user:pass@proxy.provider:8000"
            className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-3 text-sm text-[var(--c-text)] md:col-span-2"
            disabled={createDraft.is_default_direct}
          />
        </div>
        <div className="mt-4 flex justify-end">
          <Button
            onClick={async () => {
              await onCreate(createDraft);
              setCreateDraft({ name: "", url: "", is_default_direct: false });
            }}
            disabled={saving || !createDraft.name.trim()}
          >
            Add Gateway
          </Button>
        </div>
      </Card>

      {gateways.length === 0 ? (
        <Card variant="surface-1" className="p-5 text-sm text-[var(--c-text-muted)]">
          No network gateways have been saved yet.
        </Card>
      ) : (
        gateways.map((gateway) => {
          const draft =
            editState[gateway.id] ??
            ({ name: gateway.name, url: gateway.url || "", is_default_direct: gateway.is_default_direct } satisfies GatewayDraft);

          return (
            <Card key={gateway.id} variant="surface-1" className="p-5">
              <div className="grid gap-3 md:grid-cols-2">
                <input
                  value={draft.name}
                  onChange={(event) =>
                    setEditState((current) => ({ ...current, [gateway.id]: { ...draft, name: event.target.value } }))
                  }
                  className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-3 text-sm text-[var(--c-text)]"
                />
                <label className="flex items-center gap-3 rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-3 text-sm text-[var(--c-text)]">
                  <input
                    type="checkbox"
                    checked={draft.is_default_direct}
                    onChange={(event) =>
                      setEditState((current) => ({
                        ...current,
                        [gateway.id]: { ...draft, is_default_direct: event.target.checked, url: event.target.checked ? "" : draft.url },
                      }))
                    }
                  />
                  Direct Route
                </label>
                <input
                  value={draft.url}
                  onChange={(event) =>
                    setEditState((current) => ({ ...current, [gateway.id]: { ...draft, url: event.target.value } }))
                  }
                  placeholder="http://user:pass@proxy.provider:8000"
                  className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-3 text-sm text-[var(--c-text)] md:col-span-2"
                  disabled={draft.is_default_direct}
                />
              </div>
              <div className="mt-4 flex justify-end gap-3">
                <Button variant="destructive" onClick={() => onDelete(gateway.id)} disabled={saving || deletingId === gateway.id}>
                  Delete
                </Button>
                <Button onClick={() => onUpdate(gateway.id, draft)} disabled={saving || !draft.name.trim()}>
                  Save Gateway
                </Button>
              </div>
            </Card>
          );
        })
      )}
    </div>
  );
}

export default function MatchmakerPage() {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<"match_links" | "scrapers" | "gateways">("match_links");
  const [filters, setFilters] = useState<SuggestionFilters>({ status: "suggested" });
  const [manualTarget, setManualTarget] = useState<string | null>(null);
  const [manualQuery, setManualQuery] = useState("");
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sourceRefreshAdvisories, setSourceRefreshAdvisories] = useState<Record<string, SourceRefreshAdvisory>>({});

  const suggestionsQuery = useMultiSourceMatchSuggestions(filters);
  const healthQuery = useMultiSourceHealth();
  const automationStatusQuery = useMultiSourceAutomationStatus();
  const automationEventsQuery = useMultiSourceAutomationEvents(30);
  const pollingProfilesQuery = useCricketPollingProfiles();
  const scraperConfigurationsQuery = useScraperConfigurations();
  const egressGatewaysQuery = useEgressGateways();
  const injectTestSuggestionMutation = useInjectTestSuggestion();
  const suggestions = useMemo(
    () =>
      (((suggestionsQuery.data as { data?: MatchMappingSuggestion[] } | undefined)?.data ?? []) as MatchMappingSuggestion[]),
    [suggestionsQuery.data]
  );
  const summary = (((suggestionsQuery.data as { summary?: MatchSuggestionSummary } | undefined)?.summary ??
    {
      total: suggestions.length,
      suggested: 0,
      needs_review: 0,
      rejected: 0,
      approved: 0,
    }) as MatchSuggestionSummary);

  const activeManualSuggestion = suggestions.find((suggestion) => suggestion.id === manualTarget) ?? null;
  const canonicalSearchQuery = useMultiSourceCanonicalMatches(
    {
      query: manualQuery,
      sport: activeManualSuggestion?.candidate_canonical_match?.sport || normalizeString(activeManualSuggestion?.source_snapshot?.sport),
    },
    { enabled: Boolean(manualTarget && manualQuery.trim().length >= 2) }
  );
  const manualCandidates = (((canonicalSearchQuery.data as { data?: CanonicalMatchCandidate[] } | undefined)?.data ??
    []) as CanonicalMatchCandidate[]);
  const health = (((healthQuery.data as { data?: MultiSourceHealth } | undefined)?.data ?? null) as MultiSourceHealth | null);
  const automationStatus =
    (((automationStatusQuery.data as { data?: MultiSourceAutomationStatus } | undefined)?.data ??
      null) as MultiSourceAutomationStatus | null);
  const automationEvents =
    ((((automationEventsQuery.data as { data?: MultiSourceAutomationEvent[] } | undefined)?.data ?? []) as MultiSourceAutomationEvent[]));
  const pollingProfiles = ((pollingProfilesQuery.data as CricketPollingProfileResponse | undefined) ?? null) as CricketPollingProfileResponse | null;
  const scraperConfigurations = (((scraperConfigurationsQuery.data as { data?: ScraperConfiguration[] } | undefined)?.data ??
    []) as ScraperConfiguration[]);
  const egressGateways = (((egressGatewaysQuery.data as { data?: EgressGateway[] } | undefined)?.data ?? []) as EgressGateway[]);

  const approveMutation = useApproveMatchSuggestion();
  const rejectMutation = useRejectMatchSuggestion();
  const manualLinkMutation = useManualLinkMatchSuggestion();
  const createScraperConfigurationMutation = useCreateScraperConfiguration();
  const updateScraperConfigurationMutation = useUpdateScraperConfiguration();
  const deleteScraperConfigurationMutation = useDeleteScraperConfiguration();
  const createEgressGatewayMutation = useCreateEgressGateway();
  const updateEgressGatewayMutation = useUpdateEgressGateway();
  const deleteEgressGatewayMutation = useDeleteEgressGateway();
  const replayAllScrapersMutation = useReplayScraperConfigurations();
  const replayScraperMutation = useReplayScraperConfiguration();
  const pruneInvalidSuggestionsMutation = usePruneInvalidMatchSuggestions();
  const sourceRefreshAdvisoryMutation = useSourceRefreshAdvisory();
  const fetchSourceNowMutation = useFetchSourceNow();
  const hasPendingSourceFetch =
    (pollingProfiles?.data ?? []).some((profile) => profile.source_refresh_status?.last_status === "requested") ||
    fetchSourceNowMutation.isPending;

  const busy = approveMutation.isPending || rejectMutation.isPending || manualLinkMutation.isPending;
  const settingsBusy =
    createScraperConfigurationMutation.isPending ||
    updateScraperConfigurationMutation.isPending ||
    deleteScraperConfigurationMutation.isPending;
  const gatewayBusy =
    createEgressGatewayMutation.isPending ||
    updateEgressGatewayMutation.isPending ||
    deleteEgressGatewayMutation.isPending;

  useEffect(() => {
    if (!hasPendingSourceFetch) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      void pollingProfilesQuery.refetch();
    }, 2_500);

    return () => window.clearInterval(intervalId);
  }, [hasPendingSourceFetch, pollingProfilesQuery]);

  async function approveSuggestion(suggestion: MatchMappingSuggestion, canonicalMatchId?: string) {
    try {
      await approveMutation.mutateAsync({
        sourceName: suggestion.source_name,
        sourceMatchId: suggestion.source_match_id,
        body: canonicalMatchId ? { canonical_match_id: canonicalMatchId } : {},
      });
      showToast("Match link approved.", "success");
      if (manualTarget === suggestion.id) {
        setManualTarget(null);
        setManualQuery("");
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not approve match link.", "error");
    }
  }

  async function rejectSuggestion(suggestion: MatchMappingSuggestion) {
    try {
      await rejectMutation.mutateAsync({
        sourceName: suggestion.source_name,
        sourceMatchId: suggestion.source_match_id,
        body: { reason: rejectReason[suggestion.id] || "Operator rejected candidate link" },
      });
      showToast("Suggestion rejected.", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not reject suggestion.", "error");
    }
  }

  async function manualLinkSuggestion(suggestion: MatchMappingSuggestion, canonicalMatchId: string) {
    try {
      await manualLinkMutation.mutateAsync({
        sourceName: suggestion.source_name,
        sourceMatchId: suggestion.source_match_id,
        body: { canonical_match_id: canonicalMatchId, note: "Manual operator link" },
      });
      showToast("Manual link saved.", "success");
      setManualTarget(null);
      setManualQuery("");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not save manual link.", "error");
    }
  }

  async function injectTestSuggestion() {
    try {
      await injectTestSuggestionMutation.mutateAsync({});
      showToast("Test suggestion injected into the review queue.", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not inject test suggestion.", "error");
    }
  }

  async function createScraperConfiguration(draft: ScraperDraft) {
    try {
      await createScraperConfigurationMutation.mutateAsync({
        source_name: draft.source_name.trim(),
        transport: draft.transport,
        bootstrap_url: draft.bootstrap_url.trim() || null,
        ws_url: draft.transport === "websocket" ? draft.ws_url.trim() || null : null,
        poll_url: draft.transport === "polling" ? draft.poll_url.trim() || null : null,
        gateway_id: draft.gateway_id || null,
        is_active: draft.is_active,
      });
      showToast("Scraper source saved and control message published.", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not create scraper source.", "error");
      throw error;
    }
  }

  async function updateScraperConfiguration(id: string, draft: ScraperDraft) {
    try {
      await updateScraperConfigurationMutation.mutateAsync({
        id,
        body: {
          source_name: draft.source_name.trim(),
          transport: draft.transport,
          bootstrap_url: draft.bootstrap_url.trim() || null,
          ws_url: draft.transport === "websocket" ? draft.ws_url.trim() || null : null,
          poll_url: draft.transport === "polling" ? draft.poll_url.trim() || null : null,
          gateway_id: draft.gateway_id || null,
          is_active: draft.is_active,
        },
      });
      showToast("Scraper configuration pushed to the worker.", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not update scraper configuration.", "error");
    }
  }

  async function deleteScraperConfiguration(id: string) {
    try {
      await deleteScraperConfigurationMutation.mutateAsync(id);
      showToast("Scraper configuration deleted.", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not delete scraper configuration.", "error");
    }
  }

  async function createGateway(draft: GatewayDraft) {
    try {
      await createEgressGatewayMutation.mutateAsync({
        name: draft.name.trim(),
        url: draft.is_default_direct ? null : draft.url.trim() || null,
        is_default_direct: draft.is_default_direct,
      });
      showToast("Egress gateway saved.", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not create gateway.", "error");
      throw error;
    }
  }

  async function updateGateway(id: string, draft: GatewayDraft) {
    try {
      await updateEgressGatewayMutation.mutateAsync({
        id,
        body: {
          name: draft.name.trim(),
          url: draft.is_default_direct ? null : draft.url.trim() || null,
          is_default_direct: draft.is_default_direct,
        },
      });
      showToast("Gateway updated.", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not update gateway.", "error");
    }
  }

  async function deleteGateway(id: string) {
    try {
      await deleteEgressGatewayMutation.mutateAsync(id);
      showToast("Gateway deleted.", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not delete gateway.", "error");
    }
  }
  async function replayAllScraperConfigurations() {
    try {
      await replayAllScrapersMutation.mutateAsync();
      showToast("All saved scraper configurations were replayed to Redis.", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not replay scraper configurations.", "error");
    }
  }

  async function replayScraperConfiguration(id: string) {
    try {
      await replayScraperMutation.mutateAsync(id);
      showToast("Worker configuration rebroadcast to Redis.", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not replay worker configuration.", "error");
    }
  }

  async function pruneInvalidSuggestions() {
    try {
      const result = (await pruneInvalidSuggestionsMutation.mutateAsync()) as { data?: { deleted_count?: number } };
      const deletedCount = Number(result?.data?.deleted_count || 0);
      showToast(`Pruned ${deletedCount} invalid queue row${deletedCount === 1 ? "" : "s"}.`, "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not prune invalid suggestions.", "error");
    }
  }

  async function refreshPollingProfiles() {
    await pollingProfilesQuery.refetch();
  }

  async function requestSourceRefreshAdvisory(matchId: string) {
    try {
      const response = (await sourceRefreshAdvisoryMutation.mutateAsync(matchId)) as { data?: SourceRefreshAdvisory };
      const advisory = response?.data;
      if (advisory) {
        setSourceRefreshAdvisories((current) => ({ ...current, [matchId]: advisory }));
        showToast("Source refresh advisory updated.", "success");
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not load source refresh advisory.", "error");
    }
  }

  async function fetchSourceNow(matchId: string) {
    try {
      const response = (await fetchSourceNowMutation.mutateAsync(matchId)) as {
        data?: { source_name?: string; source_match_id?: string };
      };
      const sourceName = response?.data?.source_name || "one_x_bet_worker";
      const sourceMatchId = response?.data?.source_match_id || "unknown";
      showToast(`Triggered one-shot source fetch for ${sourceName} · ${sourceMatchId}.`, "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not trigger source fetch.", "error");
    }
  }


  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--c-accent)]">Multi-Source</p>
          <h1 className="mt-2 text-3xl font-semibold text-[var(--c-text)]">Matchmaker</h1>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-[var(--c-text-muted)]">
            Deterministic reconciliation queue for unmapped scraper matches. Operators review the raw source event on the left,
            compare it with the canonical candidate on the right, and approve or reject the link without touching the live
            canonical graph directly.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {activeTab === "match_links" ? (
            <>
              <Button
                variant="secondary"
                onClick={injectTestSuggestion}
                disabled={injectTestSuggestionMutation.isPending}
              >
                Inject Test Suggestion
              </Button>
              <select
                value={filters.status || ""}
                onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value || undefined }))}
                className="rounded-[var(--r-pill)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-3 text-sm text-[var(--c-text)]"
              >
                <option value="suggested">Suggested</option>
                <option value="needs_review">Needs Review</option>
                <option value="manual_confirmed">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="">All statuses</option>
              </select>
              <input
                value={filters.source_name || ""}
                onChange={(event) => setFilters((current) => ({ ...current, source_name: event.target.value || undefined }))}
                placeholder="Source name"
                className="rounded-[var(--r-pill)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-3 text-sm text-[var(--c-text)] placeholder:text-[var(--c-text-faint)]"
              />
              <input
                value={filters.competition || ""}
                onChange={(event) => setFilters((current) => ({ ...current, competition: event.target.value || undefined }))}
                placeholder="Competition"
                className="rounded-[var(--r-pill)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-3 text-sm text-[var(--c-text)] placeholder:text-[var(--c-text-faint)]"
              />
            </>
          ) : activeTab === "scrapers" ? (
            <Button variant="secondary" onClick={() => setSettingsOpen(true)}>
              Scraper Settings
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        {[
          ["match_links", "Match Links"],
          ["scrapers", "Scrapers"],
          ["gateways", "Network Gateways"],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setActiveTab(value as "match_links" | "scrapers" | "gateways")}
            className={`rounded-[var(--r-pill)] border px-4 py-2.5 text-sm font-medium ${
              activeTab === value
                ? "border-sky-400/35 bg-sky-500/12 text-sky-100"
                : "border-[var(--c-border)] bg-[var(--c-surface-1)] text-[var(--c-text-muted)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === "match_links" ? (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <SummaryCard title="Queue" value={summary.total} />
            <SummaryCard title="Suggested" value={summary.suggested} tone="good" />
            <SummaryCard title="Needs Review" value={summary.needs_review} tone="warn" />
            <SummaryCard title="Rejected" value={summary.rejected} />
          </div>

          <Card variant="surface-1" className="p-5">
        <div className="flex flex-col gap-3 border-b border-[var(--c-border)] pb-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--c-accent)]">Service Health</p>
            <h2 className="mt-2 text-xl font-semibold text-[var(--c-text)]">Ingestion Readiness</h2>
            <p className="mt-2 text-sm text-[var(--c-text-muted)]">
              This confirms whether the Matchmaker is actually receiving unmapped scraper traffic or simply waiting on the first event.
            </p>
          </div>
          {health ? (
            <div className="text-sm text-[var(--c-text-muted)]">
              Latest queue update: {formatDateTime(health.latest_suggestion_at || health.redis_consumer.last_message_at || undefined)}
            </div>
          ) : null}
        </div>

        {healthQuery.isLoading ? (
          <p className="pt-4 text-sm text-[var(--c-text-muted)]">Checking arbiter and Redis health...</p>
        ) : health ? (
          <div className="space-y-4 pt-4">
            <div className="grid gap-3 lg:grid-cols-4">
              <HealthPill
                label="Arbiter Flag"
                ok={health.arbiter_enabled}
                detail={health.arbiter_enabled ? "MULTI_SOURCE_ARBITER_ENABLED is on" : "Turn on MULTI_SOURCE_ARBITER_ENABLED"}
              />
              <HealthPill
                label="Redis PubSub"
                ok={health.redis_pubsub_running}
                detail={health.redis_pubsub_running ? "Redis PubSub process is running" : "Redis PubSub process is not running"}
              />
              <HealthPill
                label="Consumer"
                ok={health.redis_consumer.running && health.redis_consumer.subscribed}
                detail={
                  health.redis_consumer.subscribed
                    ? `Subscribed to ${health.redis_consumer.channel}`
                    : `Not subscribed to ${health.redis_consumer.channel}`
                }
              />
              <HealthPill
                label="Queue"
                ok={health.suggestion_count > 0}
                detail={
                  health.suggestion_count > 0
                    ? `${health.suggestion_count} suggestion${health.suggestion_count === 1 ? "" : "s"} waiting`
                    : "No suggestions yet. Waiting for the first unmapped source event."
                }
              />
            </div>
            <div className="grid gap-3 lg:grid-cols-3">
              <div className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-black/10 p-4 text-sm text-[var(--c-text-muted)]">
                <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--c-text-faint)]">Consumer activity</p>
                <p className="mt-2 text-[var(--c-text)]">
                  Last Redis message: {formatDateTime(health.redis_consumer.last_message_at || undefined) || "No messages seen yet"}
                </p>
              </div>
              <div className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-black/10 p-4 text-sm text-[var(--c-text-muted)]">
                <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--c-text-faint)]">Canonical trading</p>
                <p className="mt-2 text-[var(--c-text)]">
                  {health.canonical_live_trading_enabled ? "Canonical live trading is enabled." : "Shadow mode is still active."}
                </p>
              </div>
              <div className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-black/10 p-4 text-sm text-[var(--c-text-muted)]">
                <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--c-text-faint)]">Local test</p>
                <p className="mt-2">
                  Use <span className="font-semibold text-[var(--c-text)]">Inject Test Suggestion</span> to prove the queue and API are working
                  before debugging real scraper traffic.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <p className="pt-4 text-sm text-rose-200">Could not load multi-source service health.</p>
        )}
          </Card>

          {suggestionsQuery.isLoading ? (
        <Card variant="surface-1" className="p-6 text-[var(--c-text-muted)]">
          Loading match suggestions...
        </Card>
          ) : suggestions.length === 0 ? (
        <Card variant="surface-1" className="p-6">
          <p className="text-lg font-semibold text-[var(--c-text)]">No match suggestions are waiting in this queue.</p>
          <div className="mt-4 space-y-2 text-sm text-[var(--c-text-muted)]">
            <p>Checklist:</p>
            <p>1. `MULTI_SOURCE_ARBITER_ENABLED=true`</p>
            <p>2. Redis is running and the consumer is subscribed</p>
            <p>3. The scraper is publishing unmapped source matches</p>
            <p>4. Or use `Inject Test Suggestion` to verify the queue end to end</p>
          </div>
        </Card>
          ) : (
        <div className="space-y-4">
          {suggestions.map((suggestion) => {
            const sourceSnapshot = (suggestion.source_snapshot ?? {}) as Record<string, unknown>;
            const sourceCompetition = snapshotCompetition(sourceSnapshot);
            const sourceKickoff = snapshotKickoff(sourceSnapshot);
            const isManualOpen = manualTarget === suggestion.id;

            return (
              <Card key={suggestion.id} variant="surface-2" className="p-5">
                <div className="flex flex-col gap-4 border-b border-[var(--c-border)] pb-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.22em] text-[var(--c-text-faint)]">
                      {suggestion.source_name} · {suggestion.source_match_id}
                    </p>
                    <h2 className="mt-2 text-xl font-semibold text-[var(--c-text)]">
                      {snapshotTeamName(sourceSnapshot, "home_team") || "Unknown"} vs {snapshotTeamName(sourceSnapshot, "away_team") || "Unknown"}
                    </h2>
                    <p className="mt-2 text-sm text-[var(--c-text-muted)]">
                      {sourceCompetition || "Competition unavailable"} · {formatDateTime(sourceKickoff)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <StatusBadge status={suggestion.mapping_status} />
                    <span className="rounded-full border border-white/10 bg-black/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-[var(--c-text-muted)]">
                      Confidence {(Number(suggestion.confidence || 0) * 100).toFixed(0)}%
                    </span>
                    <span className="rounded-full border border-white/10 bg-black/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-[var(--c-text-muted)]">
                      Delta {Math.abs(Number(suggestion.kickoff_delta_seconds || 0))}s
                    </span>
                    {deriveSuggestionFlags(suggestion).map((flag) => (
                      <span
                        key={`${suggestion.id}-${flag.label}`}
                        className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] ${
                          flag.tone === "danger"
                            ? "border-rose-400/30 bg-rose-500/10 text-rose-200"
                            : flag.tone === "warn"
                              ? "border-amber-400/30 bg-amber-500/10 text-amber-200"
                              : "border-sky-400/30 bg-sky-500/10 text-sky-200"
                        }`}
                      >
                        {flag.label}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <div className="space-y-3 rounded-[var(--r-sm)] border border-white/10 bg-black/10 p-4">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--c-text-faint)]">Source Snapshot</p>
                    <div className="grid gap-3 text-sm text-[var(--c-text-muted)] sm:grid-cols-2">
                      <div>
                        <p className="text-[var(--c-text-faint)]">Home</p>
                        <p className="mt-1 text-[var(--c-text)]">{snapshotTeamName(sourceSnapshot, "home_team") || "-"}</p>
                      </div>
                      <div>
                        <p className="text-[var(--c-text-faint)]">Away</p>
                        <p className="mt-1 text-[var(--c-text)]">{snapshotTeamName(sourceSnapshot, "away_team") || "-"}</p>
                      </div>
                      <div>
                        <p className="text-[var(--c-text-faint)]">Competition</p>
                        <p className="mt-1 text-[var(--c-text)]">{sourceCompetition || "-"}</p>
                      </div>
                      <div>
                        <p className="text-[var(--c-text-faint)]">Kickoff</p>
                        <p className="mt-1 text-[var(--c-text)]">{formatDateTime(sourceKickoff)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--c-text-faint)]">Canonical Candidate</p>
                    <CandidatePreview candidate={suggestion.candidate_canonical_match} />
                  </div>
                </div>

                <div className="mt-5 flex flex-col gap-3 border-t border-[var(--c-border)] pt-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex flex-1 flex-col gap-3 lg:flex-row lg:items-center">
                    <textarea
                      value={rejectReason[suggestion.id] || ""}
                      onChange={(event) =>
                        setRejectReason((current) => ({ ...current, [suggestion.id]: event.target.value }))
                      }
                      placeholder="Optional review note or reject reason"
                      className="min-h-[48px] w-full rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-3 text-sm text-[var(--c-text)] placeholder:text-[var(--c-text-faint)] lg:max-w-xl"
                    />
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setManualTarget(isManualOpen ? null : suggestion.id);
                        setManualQuery(
                          isManualOpen
                            ? ""
                            : `${snapshotTeamName(sourceSnapshot, "home_team")} ${snapshotTeamName(sourceSnapshot, "away_team")}`.trim()
                        );
                      }}
                      disabled={busy}
                    >
                      {isManualOpen ? "Close Manual Search" : "Open Manual Search"}
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => rejectSuggestion(suggestion)}
                      disabled={busy}
                    >
                      Reject
                    </Button>
                    <Button
                      variant="primary"
                      onClick={() => approveSuggestion(suggestion, suggestion.candidate_canonical_match?.id)}
                      disabled={busy || !suggestion.candidate_canonical_match?.id}
                    >
                      Approve Link
                    </Button>
                  </div>
                </div>

                {isManualOpen ? (
                  <div className="mt-5 rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                      <input
                        value={manualQuery}
                        onChange={(event) => setManualQuery(event.target.value)}
                        placeholder="Search canonical matches by competition or team"
                        className="w-full rounded-[var(--r-pill)] border border-[var(--c-border)] bg-black/10 px-4 py-3 text-sm text-[var(--c-text)] placeholder:text-[var(--c-text-faint)]"
                      />
                      <div className="text-xs uppercase tracking-[0.18em] text-[var(--c-text-faint)]">
                        {canonicalSearchQuery.isFetching ? "Searching..." : `${manualCandidates.length} candidates`}
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3">
                      {manualQuery.trim().length < 2 ? (
                        <p className="text-sm text-[var(--c-text-muted)]">Type at least two characters to search the canonical match graph.</p>
                      ) : manualCandidates.length === 0 ? (
                        <p className="text-sm text-[var(--c-text-muted)]">No canonical matches matched this search.</p>
                      ) : (
                        manualCandidates.map((candidate) => (
                          <div
                            key={candidate.id}
                            className="flex flex-col gap-3 rounded-[var(--r-sm)] border border-white/10 bg-black/10 p-4 lg:flex-row lg:items-center lg:justify-between"
                          >
                            <div>
                              <p className="font-medium text-[var(--c-text)]">
                                {candidate.home_team?.name || "Unknown"} vs {candidate.away_team?.name || "Unknown"}
                              </p>
                              <p className="mt-1 text-sm text-[var(--c-text-muted)]">
                                {candidate.competition_name || "Competition unavailable"} · {formatDateTime(candidate.start_time || undefined)}
                              </p>
                            </div>
                            <Button
                              variant="primary"
                              onClick={() => manualLinkSuggestion(suggestion, candidate.id)}
                              disabled={busy}
                            >
                              Link to This Match
                            </Button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
          )}
        </>
      ) : null}

      {activeTab === "scrapers" ? (
        <div className="space-y-4">
          <OperationsPanel
            replayingAll={replayAllScrapersMutation.isPending}
            replayingOneId={(replayScraperMutation.variables as string | undefined) ?? null}
            pruning={pruneInvalidSuggestionsMutation.isPending}
            onReplayAll={replayAllScraperConfigurations}
            onReplayOne={replayScraperConfiguration}
            onPruneInvalid={pruneInvalidSuggestions}
            scraperConfigurations={scraperConfigurations}
            automationStatus={automationStatus}
            pollingProfiles={pollingProfiles}
            pollingProfilesLoading={pollingProfilesQuery.isLoading || pollingProfilesQuery.isFetching}
            onRefreshProfiles={refreshPollingProfiles}
            onRequestAdvisory={requestSourceRefreshAdvisory}
            onFetchSourceNow={fetchSourceNow}
            advisoryByMatchId={sourceRefreshAdvisories}
            requestingAdvisoryMatchId={(sourceRefreshAdvisoryMutation.variables as string | undefined) ?? null}
            fetchingSourceMatchId={(fetchSourceNowMutation.variables as string | undefined) ?? null}
          />

          <AutomationEventLogPanel events={automationEvents} />

          <Card variant="surface-1" className="p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-[var(--c-accent)]">Transport Control</p>
                <h2 className="mt-2 text-xl font-semibold text-[var(--c-text)]">Scraper Runtime Routes</h2>
                <p className="mt-2 text-sm text-[var(--c-text-muted)]">
                  Manage source transports, bootstrap endpoints, and assigned egress routes. Saving pushes a control payload to Redis.
                </p>
              </div>
              <Button variant="secondary" onClick={() => setSettingsOpen(true)}>
                Open Scraper Settings
              </Button>
            </div>
          </Card>

          {scraperConfigurations.length === 0 ? (
            <Card variant="surface-1" className="p-5 text-sm text-[var(--c-text-muted)]">
              No scraper configurations exist yet.
            </Card>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {scraperConfigurations.map((configuration) => (
                <Card key={configuration.id} variant="surface-1" className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-[var(--c-text-faint)]">{configuration.transport}</p>
                      <h3 className="mt-2 text-lg font-semibold text-[var(--c-text)]">{configuration.source_name}</h3>
                      <p className="mt-2 text-sm text-[var(--c-text-muted)]">
                        Route: {configuration.gateway?.name || "Direct local route"}
                      </p>
                    </div>
                    <span
                      className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.16em] ${
                        configuration.is_active
                          ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
                          : "border-white/10 bg-black/10 text-[var(--c-text-muted)]"
                      }`}
                    >
                      {configuration.is_active ? "active" : "inactive"}
                    </span>
                  </div>
                  <div className="mt-4 space-y-2 text-sm text-[var(--c-text-muted)]">
                    <p>Bootstrap: {configuration.bootstrap_url || "-"}</p>
                    <p>WebSocket: {configuration.ws_url || "-"}</p>
                    <p>Poll URL: {configuration.poll_url || "-"}</p>
                    <p>Proxy: {configuration.proxy_url || "Direct"}</p>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {activeTab === "gateways" ? (
        <NetworkGatewaysPanel
          gateways={egressGateways}
          saving={gatewayBusy}
          deletingId={(deleteEgressGatewayMutation.variables as string | undefined) ?? null}
          onCreate={createGateway}
          onUpdate={updateGateway}
          onDelete={deleteGateway}
        />
      ) : null}

      <ScraperSettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        configs={scraperConfigurations}
        gateways={egressGateways}
        saving={settingsBusy}
        deletingId={deleteScraperConfigurationMutation.variables ?? null}
        onCreate={createScraperConfiguration}
        onUpdate={updateScraperConfiguration}
        onDelete={deleteScraperConfiguration}
      />
    </div>
  );
}
