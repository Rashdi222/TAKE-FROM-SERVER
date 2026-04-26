"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Provider } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { getProviderPreset } from "./providerCatalog";

interface ProviderCardProps {
  provider: Provider;
  onActivate: (id: string) => void;
  onToggleEnabled: (id: string, enabled: boolean) => void;
  onSyncNow: () => void;
  onDelete: (id: string) => void;
  isActivating?: boolean;
  isToggling?: boolean;
  isSyncing?: boolean;
  isDeleting?: boolean;
}

export function ProviderCard({
  provider,
  onActivate,
  onToggleEnabled,
  onSyncNow,
  onDelete,
  isActivating = false,
  isToggling = false,
  isSyncing = false,
  isDeleting = false,
}: ProviderCardProps) {
  const preset = getProviderPreset(provider.name);

  return (
    <Card variant="surface-2" className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Provider</p>
          <h2 className="mt-2 text-2xl font-semibold text-[var(--c-text)]">{provider.name}</h2>
          <p className="mt-2 text-sm text-[var(--c-text-muted)]">
            {preset?.description || "Configured provider connection"}
          </p>
          <p className="mt-2 text-xs text-[var(--c-text-faint)]">{provider.base_url || "No base URL configured"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              provider.is_active
                ? "border border-[var(--c-success)] bg-[var(--c-success)]/15 text-[var(--c-success)]"
                : "border border-[var(--c-border)] bg-[var(--c-surface-1)] text-[var(--c-text-muted)]"
            }`}
          >
            {provider.is_active ? "Ready" : "Standby"}
          </span>
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              provider.is_enabled
                ? "border border-[var(--c-info)] bg-[var(--c-info)]/15 text-[var(--c-info)]"
                : "border border-[var(--c-border)] bg-[var(--c-surface-1)] text-[var(--c-text-muted)]"
            }`}
          >
            {provider.is_enabled ? "Enabled" : "Disabled"}
          </span>
          <span className="rounded-full border border-[var(--c-border)] bg-[var(--c-surface-1)] px-3 py-1 text-xs font-medium text-[var(--c-text-muted)]">
            {provider.has_api_key ? "API key present" : "No API key"}
          </span>
        </div>
      </div>

      <dl className="mt-6 grid gap-3 text-sm md:grid-cols-2">
        <div className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] p-4">
          <dt className="text-[var(--c-text-faint)]">Auth method</dt>
          <dd className="mt-2 text-[var(--c-text)]">{preset?.authLabel || "Generic"}</dd>
        </div>
        <div className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] p-4">
          <dt className="text-[var(--c-text-faint)]">Updated</dt>
          <dd className="mt-2 text-[var(--c-text)]">{formatDateTime(provider.updated_at)}</dd>
        </div>
      </dl>

      <div className="mt-5 rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] p-4">
        <p className="mb-2 text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Config summary</p>
        <div className="space-y-2 text-xs leading-6 text-[var(--c-text-muted)]">
          <div>Stored config keys: {Object.keys(provider.config ?? {}).length}</div>
          <div>Provider odds: {preset?.supportsProviderOdds ? "Available in current flow" : "Not currently supported"}</div>
          <div>Best next step: create a feed that uses this provider, then import fixtures from the feed.</div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Button variant="primary" onClick={() => onActivate(provider.id)} disabled={isActivating || provider.is_active}>
          {isActivating ? "Activating..." : provider.is_active ? "Ready" : "Mark ready"}
        </Button>
        <Button
          variant="secondary"
          onClick={() => onToggleEnabled(provider.id, !provider.is_enabled)}
          disabled={isToggling}
        >
          {isToggling ? "Saving..." : provider.is_enabled ? "Disable" : "Enable"}
        </Button>
        <Button variant="secondary" onClick={onSyncNow} disabled={isSyncing}>
          {isSyncing ? "Syncing..." : "Sync now"}
        </Button>
        <Button variant="destructive" onClick={() => onDelete(provider.id)} disabled={isDeleting}>
          {isDeleting ? "Deleting..." : "Delete"}
        </Button>
      </div>
    </Card>
  );
}
