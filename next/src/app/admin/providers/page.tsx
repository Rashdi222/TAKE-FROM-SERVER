"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ProviderCredentialsDrawer } from "@/components/providers/ProviderCredentialsDrawer";
import { ProviderHealthPanel } from "@/components/providers/ProviderHealthPanel";
import { ProviderRegistryTable } from "@/components/providers/ProviderRegistryTable";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { Provider, ProviderSyncLog } from "@/lib/api";
import { isApiError } from "@/lib/api";
import {
  useActivateProvider,
  useEnableProvider,
  useSuperAdminProviderSyncLogs,
  useSuperAdminProviders,
  useSyncProviderNow,
  useUpsertProvider,
} from "@/hooks/useSuperAdmin";

export default function ProvidersPage() {
  const { data, isLoading, error: providersError } = useSuperAdminProviders();
  const { data: syncLogsData, error: syncLogsError } = useSuperAdminProviderSyncLogs({ limit: 200 });
  const upsertProvider = useUpsertProvider();
  const activateProvider = useActivateProvider();
  const enableProvider = useEnableProvider();
  const syncNow = useSyncProviderNow();

  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [drawerProvider, setDrawerProvider] = useState<Provider | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  const providers = useMemo(
    () => (((data as { data?: Provider[] } | undefined)?.data ?? []) as Provider[]),
    [data],
  );
  const syncLogs = useMemo(
    () => (((syncLogsData as { data?: ProviderSyncLog[] } | undefined)?.data ?? []) as ProviderSyncLog[]),
    [syncLogsData],
  );

  const resolvedPageError =
    pageError ||
    (isApiError(providersError) ? providersError.message : null) ||
    (isApiError(syncLogsError) ? syncLogsError.message : null);

  const resolvedSelectedProviderId =
    selectedProviderId && providers.some((provider) => provider.id === selectedProviderId)
      ? selectedProviderId
      : providers[0]?.id ?? null;

  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.id === resolvedSelectedProviderId) ?? null,
    [providers, resolvedSelectedProviderId],
  );

  const configuredCount = useMemo(
    () => providers.filter((provider) => provider.has_api_key).length,
    [providers],
  );

  const enabledCount = useMemo(
    () => providers.filter((provider) => provider.is_enabled).length,
    [providers],
  );

  const handleOpenDrawer = (provider: Provider | null) => {
    setDrawerProvider(provider);
    setDrawerOpen(true);
    setPageError(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--c-accent)]">Global Providers</p>
          <h1 className="mt-2 text-3xl font-semibold text-[var(--c-text)]">Provider Management Desk</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--c-text-muted)]">
            Centralize API credentials, transport settings, enablement, and health monitoring for every sportsbook provider from one secured control plane.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link href="/admin/providers/health">
            <Button variant="secondary">Detailed Health</Button>
          </Link>
          <Button variant="secondary" onClick={() => syncNow.mutate({})} disabled={syncNow.isPending}>
            {syncNow.isPending ? "Syncing..." : "Sync All Now"}
          </Button>
          <Button variant="primary" onClick={() => handleOpenDrawer(null)}>
            New Provider
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <DeskMetric label="Configured Keys" value={configuredCount} />
        <DeskMetric label="Enabled Providers" value={enabledCount} />
        <DeskMetric label="Tracked Providers" value={providers.length} />
      </div>

      {resolvedPageError ? <Alert variant="error">{resolvedPageError}</Alert> : null}

      {isLoading ? (
        <p className="text-[var(--c-text-muted)]">Loading providers...</p>
      ) : providers.length === 0 ? (
        <Card variant="surface-2" className="p-6 text-[var(--c-text-muted)]">
          No providers configured yet.
        </Card>
      ) : (
        <div className="space-y-4">
          <ProviderRegistryTable
            providers={providers}
            selectedProviderId={resolvedSelectedProviderId}
            onSelect={(provider) => setSelectedProviderId(provider.id)}
            onOpenCredentials={handleOpenDrawer}
            onActivate={(id) => activateProvider.mutate(id)}
            onToggleEnabled={(id, enabled) => enableProvider.mutate({ id, enabled })}
            isActivating={activateProvider.isPending}
            isToggling={enableProvider.isPending}
          />

          <ProviderHealthPanel provider={selectedProvider} syncLogs={syncLogs} />

          <Card variant="surface-2" className="p-5 text-sm leading-6 text-[var(--c-text-muted)]">
            <p className="font-medium text-[var(--c-text)]">Security model</p>
            <p className="mt-2">API keys are encrypted at rest in Elixir and never rendered back to the browser in full.</p>
            <p>Blank API key submissions preserve the stored secret. Only a new non-empty key replaces it.</p>
            <p>Provider changes are audit-logged with actor, IP, user agent, and non-secret payload metadata.</p>
          </Card>
        </div>
      )}

      <ProviderCredentialsDrawer
        isOpen={drawerOpen}
        provider={drawerProvider}
        onClose={() => setDrawerOpen(false)}
        isSaving={upsertProvider.isPending}
        onSave={async (payload) => {
          try {
            await upsertProvider.mutateAsync(payload);
            setDrawerOpen(false);
            setDrawerProvider(null);
          } catch (value) {
            if (isApiError(value)) {
              throw new Error(value.message);
            }

            throw new Error("Unable to save provider.");
          }
        }}
      />
    </div>
  );
}

function DeskMetric({ label, value }: { label: string; value: number }) {
  return (
    <Card variant="surface-2" className="p-5">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--c-text-faint)]">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-[var(--c-text)]">{value}</div>
    </Card>
  );
}
