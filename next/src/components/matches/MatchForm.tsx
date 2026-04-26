"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";

interface MatchFormProps {
  initialData?: {
    sport?: string;
    team1?: string;
    team2?: string;
    start_time?: string;
    status?: string;
    winner?: string | null;
    in_play_enabled?: boolean;
    provider?: string | null;
    external_id?: string | null;
  };
  onSubmit: (body: Record<string, unknown>) => Promise<void>;
  submitLabel: string;
  title: string;
}

function formatDateTimeLocal(value?: string) {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 16);
}

export function MatchForm({ initialData, onSubmit, submitLabel, title }: MatchFormProps) {
  const [formData, setFormData] = useState({
    sport: initialData?.sport || "cricket",
    team1: initialData?.team1 || "",
    team2: initialData?.team2 || "",
    start_time: formatDateTimeLocal(initialData?.start_time),
    status: initialData?.status || "upcoming",
    winner: initialData?.winner || "",
    in_play_enabled: initialData?.in_play_enabled ?? false,
    provider: initialData?.provider || "",
    external_id: initialData?.external_id || "",
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const canSetWinner = useMemo(() => formData.status === "settled", [formData.status]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      await onSubmit({
        sport: formData.sport,
        team1: formData.team1,
        team2: formData.team2,
        start_time: new Date(formData.start_time).toISOString(),
        status: formData.status,
        winner: canSetWinner ? formData.winner || undefined : undefined,
        in_play_enabled: formData.in_play_enabled,
        provider: formData.provider || undefined,
        external_id: formData.external_id || undefined,
      });
    } catch {
      setError("Unable to save match.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card variant="surface-2" className="p-6">
      <h2 className="mb-4 text-xl font-semibold text-[var(--c-text)]">{title}</h2>

      {error ? <Alert variant="error" className="mb-4">{error}</Alert> : null}

      <form onSubmit={handleSubmit} className="space-y-4">
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

          <Input
            label="Start Time"
            type="datetime-local"
            value={formData.start_time}
            onChange={(e) => setFormData((prev) => ({ ...prev, start_time: e.target.value }))}
            required
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label="Team / Runner 1"
            value={formData.team1}
            onChange={(e) => setFormData((prev) => ({ ...prev, team1: e.target.value }))}
            required
          />

          <Input
            label="Team / Runner 2"
            value={formData.team2}
            onChange={(e) => setFormData((prev) => ({ ...prev, team2: e.target.value }))}
            required
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-[var(--c-text)]">Status</label>
            <select
              value={formData.status}
              onChange={(e) => setFormData((prev) => ({ ...prev, status: e.target.value }))}
              className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-2 text-[var(--c-text)]"
            >
              <option value="upcoming">Upcoming</option>
              <option value="live">Live</option>
              <option value="closed">Closed</option>
              <option value="settled">Settled</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <Input
            label="Winner"
            value={formData.winner}
            onChange={(e) => setFormData((prev) => ({ ...prev, winner: e.target.value }))}
            disabled={!canSetWinner}
            placeholder={canSetWinner ? "Required when settled" : "Only used when settled"}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label="Provider"
            value={formData.provider}
            onChange={(e) => setFormData((prev) => ({ ...prev, provider: e.target.value }))}
            placeholder="goalserve"
          />

          <Input
            label="External ID"
            value={formData.external_id}
            onChange={(e) => setFormData((prev) => ({ ...prev, external_id: e.target.value }))}
            placeholder="provider-match-id"
          />
        </div>

        <label className="flex items-center gap-3 text-sm text-[var(--c-text)]">
          <input
            type="checkbox"
            checked={formData.in_play_enabled}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, in_play_enabled: e.target.checked }))
            }
          />
          Enable in-play betting
        </label>

        <Button type="submit" variant="primary" disabled={submitting}>
          {submitting ? "Saving..." : submitLabel}
        </Button>
      </form>
    </Card>
  );
}
