"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Activity, ShieldAlert, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  useEmergencyResumeMatch,
  useEmergencySuspendMatch,
  useForceMatchReprice,
  useResumeMatchMarket,
  useSuspendMatchMarket,
} from "@/hooks/useSuperAdmin";
import type { Match } from "@/lib/api";

const footballMarketFamilies = [
  {
    key: "match_winner",
    label: "Match Winner",
    description: "Main 1X2 trading board for the live match.",
    suspendReason: "goal_scored",
  },
  {
    key: "over_under",
    label: "Over / Under",
    description: "Goal totals and line-sensitive price families.",
    suspendReason: "goal_scored",
  },
  {
    key: "btts",
    label: "Both Teams To Score",
    description: "BTTS pricing when match flow or lineup risk changes.",
    suspendReason: "var_review",
  },
  {
    key: "in_play",
    label: "In-Play Specials",
    description: "Fast-moving event markets that need the strictest guard rails.",
    suspendReason: "manual_admin_review",
  },
] as const;

const suspensionCopy: Record<string, string> = {
  goal_scored: "Goal Scored",
  var_review: "VAR Review",
  manual_admin_review: "Manual Review",
  provider_disconnect: "Provider Disconnect",
  provider_import_failure: "Import Failure",
  red_card: "Red Card",
};

export function FootballLiveMarketControlPanel({ match }: { match: Match }) {
  const suspendMarket = useSuspendMatchMarket();
  const resumeMarket = useResumeMatchMarket();
  const forceReprice = useForceMatchReprice();
  const suspendMatch = useEmergencySuspendMatch();
  const resumeMatch = useEmergencyResumeMatch();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const suspendedMarkets = useMemo(
    () => ((match.suspended_markets as Record<string, { reason?: string | null }> | null | undefined) ?? {}),
    [match.suspended_markets],
  );

  const handleSuspend = async (marketKey: string, reason: string) => {
    setBusyKey(`${marketKey}:suspend`);
    setFeedback(null);

    try {
      await suspendMarket.mutateAsync({
        id: String(match.id),
        marketKey,
        body: {
          reason,
          note: `football_live_control:${reason}`,
        },
      });
      setFeedback(`${labelForReason(reason)} applied to ${humanizeFamily(marketKey)}.`);
    } catch {
      setFeedback(`Unable to suspend ${humanizeFamily(marketKey)} right now.`);
    } finally {
      setBusyKey(null);
    }
  };

  const handleResume = async (marketKey: string) => {
    setBusyKey(`${marketKey}:resume`);
    setFeedback(null);

    try {
      await resumeMarket.mutateAsync({
        id: String(match.id),
        marketKey,
        body: {
          note: "football_live_control:resume",
        },
      });
      setFeedback(`${humanizeFamily(marketKey)} resumed.`);
    } catch {
      setFeedback(`Unable to resume ${humanizeFamily(marketKey)} right now.`);
    } finally {
      setBusyKey(null);
    }
  };

  const handleForceReprice = async () => {
    setBusyKey("force-reprice");
    setFeedback(null);

    try {
      await forceReprice.mutateAsync(String(match.id));
      setFeedback("Fresh football reprice queued.");
    } catch {
      setFeedback("Unable to queue a fresh football reprice right now.");
    } finally {
      setBusyKey(null);
    }
  };

  const handleSuspendMatch = async () => {
    setBusyKey("match:suspend");
    setFeedback(null);

    try {
      await suspendMatch.mutateAsync({
        id: String(match.id),
        body: {
          reason: "manual_admin_review",
          note: "football_live_control:match_suspend",
        },
      });
      setFeedback("Entire football match board suspended.");
    } catch {
      setFeedback("Unable to suspend the full football board right now.");
    } finally {
      setBusyKey(null);
    }
  };

  const handleResumeMatch = async () => {
    setBusyKey("match:resume");
    setFeedback(null);

    try {
      await resumeMatch.mutateAsync({
        id: String(match.id),
        body: {
          note: "football_live_control:match_resume",
        },
      });
      setFeedback("Entire football match board resumed.");
    } catch {
      setFeedback("Unable to resume the full football board right now.");
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <Card variant="surface-1" className="border-[var(--c-border)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--c-text-faint)]">
            Live Market Families
          </div>
          <h3 className="mt-1 text-lg font-semibold text-[var(--c-text)]">Football In-Play Controls</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--c-text-muted)]">
            Pause only the market family that is exposed to a fresh match event. Keep the rest of the football board open
            unless the whole match genuinely needs a global suspend.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            onClick={() => void handleSuspendMatch()}
            disabled={busyKey === "match:suspend" || suspendMatch.isPending}
          >
            {busyKey === "match:suspend" ? "Suspending..." : "Suspend Match"}
          </Button>
          <Button
            variant="ghost"
            onClick={() => void handleResumeMatch()}
            disabled={busyKey === "match:resume" || resumeMatch.isPending}
          >
            {busyKey === "match:resume" ? "Resuming..." : "Resume Match"}
          </Button>
          <Button
            variant="secondary"
            onClick={() => void handleForceReprice()}
            disabled={busyKey === "force-reprice" || forceReprice.isPending}
          >
            <RefreshCcw className="mr-2 h-4 w-4" />
            {busyKey === "force-reprice" ? "Queuing..." : "Force Reprice"}
          </Button>
        </div>
      </div>

      {feedback ? (
        <div className="mt-4 rounded-[var(--r-md)] border border-[var(--c-border)] bg-[rgba(255,255,255,0.03)] px-4 py-3 text-sm text-[var(--c-text-muted)]">
          {feedback}
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        {footballMarketFamilies.map((family) => {
          const suspension = suspendedMarkets[family.key];
          const suspended = Boolean(suspension);
          const reason = suspension?.reason ? labelForReason(suspension.reason) : null;

          return (
            <div
              key={family.key}
              className="rounded-[var(--r-card)] border border-[var(--c-border)] bg-[color:color-mix(in_srgb,var(--c-surface-1)_90%,transparent)] p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-[var(--r-pill)] border border-[var(--c-border)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--c-text-faint)]">
                      {family.key.replaceAll("_", " ")}
                    </span>
                    {suspended ? (
                      <span className="inline-flex items-center gap-1 rounded-[var(--r-pill)] border border-amber-500/30 bg-amber-500/12 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-200">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {reason || "Suspended"}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-[var(--r-pill)] border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-200">
                        <Activity className="h-3.5 w-3.5" />
                        Open
                      </span>
                    )}
                  </div>
                  <h4 className="mt-3 text-base font-semibold text-[var(--c-text)]">{family.label}</h4>
                  <p className="mt-2 text-sm leading-6 text-[var(--c-text-muted)]">{family.description}</p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  onClick={() => void handleSuspend(family.key, family.suspendReason)}
                  disabled={suspended || busyKey === `${family.key}:suspend`}
                >
                  <ShieldAlert className="mr-2 h-4 w-4" />
                  {busyKey === `${family.key}:suspend` ? "Suspending..." : `Pause For ${labelForReason(family.suspendReason)}`}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => void handleResume(family.key)}
                  disabled={!suspended || busyKey === `${family.key}:resume`}
                >
                  {busyKey === `${family.key}:resume` ? "Resuming..." : "Resume Family"}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function humanizeFamily(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function labelForReason(reason: string) {
  return suspensionCopy[reason] || humanizeFamily(reason);
}
