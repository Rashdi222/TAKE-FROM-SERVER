"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

interface OddsFormProps {
  title: string;
  submitLabel: string;
  initialData?: {
    bet_type?: string | null;
    outcome?: string | null;
    odds_value?: number | string | null;
    max_stake_amount?: number | string | null;
    max_payout_amount?: number | string | null;
    limit_scope?: string | null;
    admin_note?: string | null;
    is_active?: boolean;
  };
  onSubmit: (body: Record<string, unknown>) => Promise<void>;
}

export function OddsForm({ title, submitLabel, initialData, onSubmit }: OddsFormProps) {
  const [formData, setFormData] = useState({
    bet_type: initialData?.bet_type || "match_winner",
    outcome: initialData?.outcome || "",
    odds_value: initialData?.odds_value?.toString() || "",
    max_stake_amount: initialData?.max_stake_amount?.toString() || "",
    max_payout_amount: initialData?.max_payout_amount?.toString() || "",
    limit_scope: initialData?.limit_scope || "market",
    admin_note: initialData?.admin_note || "",
    is_active: initialData?.is_active ?? true,
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      await onSubmit({
        bet_type: formData.bet_type,
        outcome: formData.outcome,
        odds_value: Number(formData.odds_value),
        max_stake_amount: formData.max_stake_amount
          ? Number(formData.max_stake_amount)
          : undefined,
        max_payout_amount: formData.max_payout_amount
          ? Number(formData.max_payout_amount)
          : undefined,
        limit_scope: formData.limit_scope,
        admin_note: formData.admin_note || undefined,
        is_active: formData.is_active,
      });
      setFormData((prev) => ({
        ...prev,
        outcome: "",
        odds_value: "",
        max_stake_amount: "",
        max_payout_amount: "",
        admin_note: "",
      }));
    } catch {
      setError("Unable to save odds.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card variant="surface-2" className="p-6">
      <h3 className="mb-4 text-lg font-semibold text-[var(--c-text)]">{title}</h3>

      {error ? <Alert variant="error" className="mb-4">{error}</Alert> : null}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
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

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-[var(--c-text)]">Limit Scope</label>
            <select
              value={formData.limit_scope}
              onChange={(e) => setFormData((prev) => ({ ...prev, limit_scope: e.target.value }))}
              className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-2 text-[var(--c-text)]"
            >
              <option value="global">Global</option>
              <option value="market">Market</option>
              <option value="selection">Selection</option>
            </select>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label="Outcome"
            value={formData.outcome}
            onChange={(e) => setFormData((prev) => ({ ...prev, outcome: e.target.value }))}
            required
            placeholder="Home / Over 2.5 / Team A"
          />

          <Input
            label="Odds Value"
            type="number"
            min="1.01"
            step="0.01"
            value={formData.odds_value}
            onChange={(e) => setFormData((prev) => ({ ...prev, odds_value: e.target.value }))}
            required
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label="Max Stake Amount"
            type="number"
            min="0"
            step="0.01"
            value={formData.max_stake_amount}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, max_stake_amount: e.target.value }))
            }
          />

          <Input
            label="Max Payout Amount"
            type="number"
            min="0"
            step="0.01"
            value={formData.max_payout_amount}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, max_payout_amount: e.target.value }))
            }
          />
        </div>

        <Input
          label="Admin Note"
          value={formData.admin_note}
          onChange={(e) => setFormData((prev) => ({ ...prev, admin_note: e.target.value }))}
          placeholder="Optional internal note"
        />

        <label className="flex items-center gap-3 text-sm text-[var(--c-text)]">
          <input
            type="checkbox"
            checked={formData.is_active}
            onChange={(e) => setFormData((prev) => ({ ...prev, is_active: e.target.checked }))}
          />
          Active after save
        </label>

        <Button type="submit" variant="primary" disabled={submitting}>
          {submitting ? "Saving..." : submitLabel}
        </Button>
      </form>
    </Card>
  );
}
