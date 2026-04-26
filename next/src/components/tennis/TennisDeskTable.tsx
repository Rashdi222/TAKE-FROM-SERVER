"use client";

import { useEffect, useState } from "react";
import type { TennisMatchState } from "@/lib/api";
import { Button } from "@/components/ui/Button";

type Props = {
  matches: TennisMatchState[];
  connectionStatus?: string;
  margin: string;
  onMarginChange: (margin: string) => Promise<void>;
  simulationEnabled: boolean;
  activeScenario?: string | null;
  scenarios: string[];
  onSimulationToggle: (enabled: boolean) => Promise<void>;
  onInjectScenario: (scenario: string) => Promise<void>;
};

export function TennisDeskTable({
  matches,
  connectionStatus,
  margin,
  onMarginChange,
  simulationEnabled,
  activeScenario,
  scenarios,
  onSimulationToggle,
  onInjectScenario,
}: Props) {
  const [draftMargin, setDraftMargin] = useState(margin);
  const [saving, setSaving] = useState(false);
  const [simBusy, setSimBusy] = useState(false);

  useEffect(() => {
    setDraftMargin(margin);
  }, [margin]);

  function workflowTone(match: TennisMatchState) {
    const state = match.tracking_status || "waiting_live_state";

    if (state === "published" || state === "auto_live") {
      return "text-emerald-200";
    }

    if (state === "ready_to_publish") {
      return "text-amber-200";
    }

    return "text-white/65";
  }

  return (
    <section className="rounded-3xl border border-white/10 bg-[#06111a] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-amber-300/70">Publishing Control</p>
          <h2 className="mt-1 text-lg font-semibold text-white">Live Margin Desk</h2>
          <p className="mt-1 max-w-2xl text-xs leading-6 text-white/60">
            This desk applies the global margin to provider odds and shows which live courts are public automatically. Tracking is optional operator management, not a gate for public visibility.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100/80">
            socket {connectionStatus || "connecting"}
          </div>
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-100/80">
            margin {Number(margin) * 100}%
          </div>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
        <label className="flex min-w-[220px] flex-1 flex-col gap-2">
          <span className="text-[11px] uppercase tracking-[0.24em] text-white/45">Global House Margin</span>
          <input
            type="range"
            min="0.01"
            max="0.12"
            step="0.01"
            value={draftMargin}
            onChange={(event) => setDraftMargin(event.target.value)}
            className="w-full"
          />
        </label>
        <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 font-mono text-sm text-white/85">
          {(Number(draftMargin) * 100).toFixed(0)}%
        </div>
        <Button
          onClick={async () => {
            setSaving(true);
            try {
              await onMarginChange(draftMargin);
            } finally {
              setSaving(false);
            }
          }}
          disabled={saving || draftMargin === margin}
          className="rounded-xl px-4 py-2"
        >
          {saving ? "Applying..." : "Apply Margin"}
        </Button>
      </div>

      <div className="mb-4 rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.24em] text-cyan-100/60">Simulation Suite</div>
            <div className="mt-1 text-sm font-semibold text-cyan-50">Bypass Adapter</div>
            <div className="mt-1 text-xs text-cyan-100/70">
              Mock mode swaps API Tennis polling for local scenario files without changing the frontend contract.
            </div>
          </div>
          <Button
            variant="secondary"
            onClick={async () => {
              setSimBusy(true);
              try {
                await onSimulationToggle(!simulationEnabled);
              } finally {
                setSimBusy(false);
              }
            }}
            disabled={simBusy}
            className="rounded-xl px-4 py-2"
          >
            {simulationEnabled ? "Disable Mock Mode" : "Enable Mock Mode"}
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full border border-white/15 bg-black/20 px-3 py-1 text-white/80">
            {simulationEnabled ? "Mock Mode On" : "Mock Mode Off"}
          </span>
          {activeScenario ? (
            <span className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-cyan-100">
              {activeScenario}
            </span>
          ) : null}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {scenarios.map((scenario) => (
            <Button
              key={scenario}
              variant="secondary"
              disabled={simBusy || !simulationEnabled}
              onClick={async () => {
                setSimBusy(true);
                try {
                  await onInjectScenario(scenario);
                } finally {
                  setSimBusy(false);
                }
              }}
              className="rounded-xl px-3 py-2 text-xs"
            >
              {scenario.replace(/^scenario_/, "").replace(/_/g, " ")}
            </Button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[920px]">
          <div className="grid grid-cols-[2fr_1.2fr_120px_100px_120px_120px] border-b border-white/10 px-3 py-2 text-[10px] uppercase tracking-[0.24em] text-white/45">
            <div>Match</div>
            <div>Visibility</div>
            <div>Markets</div>
            <div>Server</div>
            <div>Status</div>
            <div className="text-right">Flow</div>
          </div>

          {matches.map((match) => {
            const liveOddsCount = Array.isArray(match.published_odds) ? match.published_odds.length : 0;
            const pressureFlags = [match.break_point && "Break", match.set_point && "Set", match.match_point && "Match"]
              .filter(Boolean)
              .join(" / ");
            const autoVisible = liveOddsCount > 0;
            const managed = Boolean(match.tracked_at);

            return (
              <div
                key={match.event_key}
                className="grid grid-cols-[2fr_1.2fr_120px_100px_120px_120px] items-center border-b border-white/5 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm text-white">{match.player_1_name || "Player 1"} vs {match.player_2_name || "Player 2"}</div>
                  <div className="truncate font-mono text-[11px] text-white/45">{match.current_game_score || "-"} / {match.current_point_score || "-"}</div>
                </div>
                <div className="min-w-0 text-xs text-white/70">
                  <div className={workflowTone(match)}>
                    {match.workflow_label || (liveOddsCount > 0 ? "Auto live" : "Waiting for provider odds")}
                  </div>
                  <div className="truncate text-[11px] text-white/45">
                    {match.workflow_hint || pressureFlags || "Normal rally"}
                  </div>
                </div>
                <div className="font-mono text-sm text-emerald-200">{liveOddsCount}</div>
                <div className="truncate text-xs text-white/70">{match.server || "-"}</div>
                <div className="text-xs text-white/70">
                  <div>{match.status || "tracking"}</div>
                  <div className="text-[11px] text-white/45">{autoVisible ? "public live" : "hidden until odds"}</div>
                </div>
                <div className="text-right">
                  <span
                    className={`inline-flex rounded-xl border px-3 py-2 text-xs ${
                      autoVisible
                        ? managed
                          ? "border-cyan-400/20 bg-cyan-500/10 text-cyan-100"
                          : "border-emerald-400/20 bg-emerald-500/10 text-emerald-200"
                        : "border-white/10 bg-white/5 text-white/65"
                    }`}
                  >
                    {autoVisible ? (managed ? "Managed" : "Auto") : "Waiting"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
