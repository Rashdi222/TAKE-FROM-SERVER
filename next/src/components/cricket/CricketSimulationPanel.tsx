"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CircleDotDashed, Waves } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { useInjectSimulationScenario } from "@/hooks/useOdds";
import type { Match } from "@/lib/api";

const SIMULATION_SCENARIOS = [
  {
    id: "desperate_chase",
    label: "Desperate Chase",
    description: "Inject a 2nd-innings pressure overlay so boundary necessity and reviewer elasticity can be audited.",
    icon: AlertTriangle,
  },
  {
    id: "early_wicket",
    label: "Early Wicket",
    description: "Inject an early collapse state to test dampening and safe repricing after wicket shock.",
    icon: CircleDotDashed,
  },
  {
    id: "dot_ball_pressure",
    label: "Dot Ball Pressure",
    description: "Inject four-dot pressure so fancy dead-over logic can be observed without waiting for live play.",
    icon: Waves,
  },
] as const;

export function CricketSimulationPanel({ matches }: { matches: Match[] }) {
  const [simulationMatchId, setSimulationMatchId] = useState("");
  const { showToast } = useToast();
  const activeMatchId = useMemo(
    () => simulationMatchId || String(matches[0]?.id || ""),
    [matches, simulationMatchId],
  );
  const injectSimulationScenario = useInjectSimulationScenario(activeMatchId);

  const handleSimulationInject = async (scenario: string) => {
    if (!activeMatchId) {
      showToast("Select a target match for the sandbox run.", "error");
      return;
    }

    try {
      await injectSimulationScenario.mutateAsync(scenario);
      showToast(`Sandbox scenario queued: ${scenario.replace(/_/g, " ")}.`, "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Sandbox scenario failed", "error");
    }
  };

  return (
    <Card variant="surface-2" className="p-5">
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-[var(--c-accent)]">Scenario Sandbox</p>
          <h2 className="mt-2 text-xl font-semibold text-[var(--c-text)]">Run Mock Cricket States</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--c-text-muted)]">
            Use a real match shell, inject a mock SportMonks-shaped payload, and let the normal reviewer plus self-heal pipeline process it.
          </p>
        </div>

        <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium tracking-[0.01em] text-[var(--c-text)]">Sandbox Target Match</label>
            <select
              value={activeMatchId}
              onChange={(event) => setSimulationMatchId(event.target.value)}
              className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-2.5 text-[var(--c-text)] focus:border-[var(--c-accent)] focus:outline-none"
            >
              <option value="">Select upcoming or live match shell</option>
              {matches.map((match) => (
                <option key={String(match.id)} value={String(match.id)}>
                  {(match.team1 || "Team 1")} vs {(match.team2 || "Team 2")} · {match.status}
                </option>
              ))}
            </select>
            <p className="text-xs text-[var(--c-text-faint)]">
              This is a sandbox overlay only. It does not start the real match and does not modify the SportMonks integration.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {SIMULATION_SCENARIOS.map((scenario) => {
              const Icon = scenario.icon;
              return (
                <button
                  key={scenario.id}
                  type="button"
                  onClick={() => void handleSimulationInject(scenario.id)}
                  disabled={!activeMatchId || injectSimulationScenario.isPending}
                  className="rounded-[var(--r-card)] border border-[var(--c-border)] bg-[color:color-mix(in_srgb,var(--c-surface-1)_88%,transparent)] p-4 text-left transition hover:border-[var(--c-accent)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-[0.9rem] border border-[rgba(64,179,255,0.18)] bg-[rgba(64,179,255,0.08)] text-[rgb(110,196,255)]">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[var(--c-text)]">{scenario.label}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.14em] text-[var(--c-text-faint)]">
                        {scenario.id.replace(/_/g, " ")}
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[var(--c-text-muted)]">{scenario.description}</p>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
}
