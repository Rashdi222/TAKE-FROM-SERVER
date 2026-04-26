"use client";

import { useState } from "react";
import { useRiskControls } from "@/hooks/useSuperAdmin";
import { Card } from "../ui/Card";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import { Alert } from "../ui/Alert";

interface RiskControlsFormProps {
  userId: string;
  initialValues?: {
    max_stake_per_bet?: number | string | null;
    daily_max_exposure?: number | string | null;
    betting_locked?: boolean;
    payments_locked?: boolean;
  };
}

export function RiskControlsForm({ userId, initialValues }: RiskControlsFormProps) {
  const [formData, setFormData] = useState({
    max_stake_per_bet: initialValues?.max_stake_per_bet?.toString() || "",
    daily_max_exposure: initialValues?.daily_max_exposure?.toString() || "",
    betting_locked: initialValues?.betting_locked ?? false,
    payments_locked: initialValues?.payments_locked ?? false,
  });
  const [success, setSuccess] = useState("");

  const riskControls = useRiskControls();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccess("");

    try {
      await riskControls.mutateAsync({
        id: userId,
        body: {
          max_stake_per_bet: Number(formData.max_stake_per_bet) || null,
          daily_max_exposure: Number(formData.daily_max_exposure) || null,
          betting_locked: formData.betting_locked,
          payments_locked: formData.payments_locked,
        },
      });
      setSuccess("Risk controls updated!");
    } catch {
      // Error handled by mutation state.
    }
  };

  return (
    <Card variant="surface-2" className="p-6">
      <h3 className="text-lg font-semibold text-[var(--c-text)] mb-4">Risk Controls</h3>

      {riskControls.isError && (
        <Alert variant="error" className="mb-4">
          Failed to update risk controls
        </Alert>
      )}

      {success && (
        <Alert variant="success" className="mb-4">
          {success}
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Max Stake Per Bet"
          type="number"
          min="0"
          step="0.01"
          value={formData.max_stake_per_bet}
          onChange={(e) => setFormData((p) => ({ ...p, max_stake_per_bet: e.target.value }))}
          placeholder="Leave empty for no limit"
        />

        <Input
          label="Daily Max Exposure"
          type="number"
          min="0"
          step="0.01"
          value={formData.daily_max_exposure}
          onChange={(e) => setFormData((p) => ({ ...p, daily_max_exposure: e.target.value }))}
          placeholder="Leave empty for no limit"
        />

        <label className="flex items-center gap-3 text-sm text-[var(--c-text)]">
          <input
            type="checkbox"
            checked={formData.betting_locked}
            onChange={(e) => setFormData((p) => ({ ...p, betting_locked: e.target.checked }))}
          />
          Lock betting for this user
        </label>

        <label className="flex items-center gap-3 text-sm text-[var(--c-text)]">
          <input
            type="checkbox"
            checked={formData.payments_locked}
            onChange={(e) => setFormData((p) => ({ ...p, payments_locked: e.target.checked }))}
          />
          Lock payments for this user
        </label>

        <Button type="submit" variant="primary" disabled={riskControls.isPending}>
          {riskControls.isPending ? "Saving..." : "Save Controls"}
        </Button>
      </form>
    </Card>
  );
}
