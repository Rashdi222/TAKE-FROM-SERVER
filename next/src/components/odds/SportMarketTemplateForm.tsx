"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import type { SportMarketConfig } from "@/lib/api";

export function SportMarketTemplateForm({
  initialData,
  onSubmit,
}: {
  initialData?: Partial<SportMarketConfig>;
  onSubmit: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [formData, setFormData] = useState({
    sport: initialData?.sport || "cricket",
    bet_type: initialData?.bet_type || "match_winner",
    default_min_odds: String(initialData?.default_min_odds || "1.10"),
    default_max_odds: String(initialData?.default_max_odds || "5.00"),
    default_max_stake_amount: String(initialData?.default_max_stake_amount || ""),
    default_max_payout_amount: String(initialData?.default_max_payout_amount || ""),
    is_enabled: initialData?.is_enabled ?? true,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      await onSubmit({
        sport: formData.sport,
        bet_type: formData.bet_type,
        default_min_odds: formData.default_min_odds,
        default_max_odds: formData.default_max_odds,
        default_max_stake_amount: formData.default_max_stake_amount || undefined,
        default_max_payout_amount: formData.default_max_payout_amount || undefined,
        is_enabled: formData.is_enabled,
      });
    } catch {
      setError("Unable to save market template.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card variant="surface-2" className="p-6">
      <h2 className="text-lg font-semibold text-[var(--c-text)]">Upsert Market Template</h2>
      <p className="mt-2 text-sm text-[var(--c-text-muted)]">
        One template row controls whether a market is available and what default limits the odds desk applies.
      </p>

      {error ? <Alert variant="error" className="mt-4">{error}</Alert> : null}

      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
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
            <label className="text-sm font-medium text-[var(--c-text)]">Bet Type</label>
            <select
              value={formData.bet_type}
              onChange={(e) => setFormData((prev) => ({ ...prev, bet_type: e.target.value }))}
              className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-2 text-[var(--c-text)]"
            >
              <option value="match_winner">Match Winner</option>
              <option value="over_under">Over / Under</option>
              <option value="in_play">In Play</option>
            </select>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label="Default Min Odds"
            type="number"
            min="1.01"
            step="0.01"
            value={formData.default_min_odds}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, default_min_odds: e.target.value }))
            }
          />
          <Input
            label="Default Max Odds"
            type="number"
            min="1.01"
            step="0.01"
            value={formData.default_max_odds}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, default_max_odds: e.target.value }))
            }
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label="Default Max Stake"
            type="number"
            min="0"
            step="0.01"
            value={formData.default_max_stake_amount}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, default_max_stake_amount: e.target.value }))
            }
          />
          <Input
            label="Default Max Payout"
            type="number"
            min="0"
            step="0.01"
            value={formData.default_max_payout_amount}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, default_max_payout_amount: e.target.value }))
            }
          />
        </div>

        <label className="flex items-center gap-3 text-sm text-[var(--c-text)]">
          <input
            type="checkbox"
            checked={formData.is_enabled}
            onChange={(e) => setFormData((prev) => ({ ...prev, is_enabled: e.target.checked }))}
          />
          Enable this market for the selected sport
        </label>

        <Button type="submit" variant="primary" disabled={submitting}>
          {submitting ? "Saving..." : "Save Template"}
        </Button>
      </form>
    </Card>
  );
}
