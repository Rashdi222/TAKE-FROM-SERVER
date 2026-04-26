"use client";

import { Button } from "@/components/ui/Button";
import type { Provider } from "@/lib/api";

type ProviderRegistryTableProps = {
  providers: Provider[];
  selectedProviderId: string | null;
  onSelect: (provider: Provider) => void;
  onActivate: (id: string) => void;
  onToggleEnabled: (id: string, enabled: boolean) => void;
  onOpenCredentials: (provider: Provider) => void;
  isActivating?: boolean;
  isToggling?: boolean;
};

export function ProviderRegistryTable({
  providers,
  selectedProviderId,
  onSelect,
  onActivate,
  onToggleEnabled,
  onOpenCredentials,
  isActivating = false,
  isToggling = false,
}: ProviderRegistryTableProps) {
  return (
    <div className="overflow-hidden rounded-[var(--r-md)] border border-[var(--c-border)] bg-[var(--c-surface-1)]">
      <div className="hidden grid-cols-[minmax(220px,1.45fr)_minmax(140px,0.8fr)_minmax(150px,0.95fr)_minmax(180px,1fr)_minmax(220px,1.15fr)] gap-4 border-b border-[var(--c-border)] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--c-text-faint)] xl:grid">
        <div>Provider</div>
        <div>Scope / Auth</div>
        <div>Status</div>
        <div>API Key</div>
        <div>Actions</div>
      </div>

      <div className="divide-y divide-[var(--c-border)]">
        {providers.map((provider) => {
          const selected = provider.id === selectedProviderId;

          return (
            <div
              key={provider.id}
              className={`px-4 py-4 transition-colors ${
                selected ? "bg-[var(--c-accent-soft)]/40" : "hover:bg-[rgba(255,255,255,0.025)]"
              }`}
            >
              <div className="grid gap-4 xl:grid-cols-[minmax(220px,1.45fr)_minmax(140px,0.8fr)_minmax(150px,0.95fr)_minmax(180px,1fr)_minmax(220px,1.15fr)] xl:items-center">
                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={() => onSelect(provider)}
                    className="block min-w-0 text-left"
                  >
                    <div className="truncate text-sm font-semibold text-[var(--c-text)]">
                      {provider.name}
                    </div>
                    <div className="truncate text-xs text-[var(--c-text-muted)]">
                      {provider.base_url || "No base URL configured"}
                    </div>
                  </button>
                </div>

                <div className="grid gap-1 text-xs xl:block">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--c-text-faint)] xl:hidden">
                    Scope / Auth
                  </div>
                  <div className="truncate text-[var(--c-text)]">
                    {provider.sport_scope?.length ? provider.sport_scope.join(", ") : "global"}
                  </div>
                  <div className="text-[var(--c-text-muted)]">{provider.auth_mode || "generic"}</div>
                </div>

                <div className="grid gap-1 xl:block">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--c-text-faint)] xl:hidden">
                    Status
                  </div>
                  <div className="flex flex-wrap gap-2 text-[11px]">
                    <span
                      className={`rounded-full px-2 py-1 ${
                        provider.is_active
                          ? "bg-emerald-500/12 text-emerald-300"
                          : "bg-[rgba(255,255,255,0.05)] text-[var(--c-text-muted)]"
                      }`}
                    >
                      {provider.is_active ? "Ready" : "Standby"}
                    </span>
                    <span
                      className={`rounded-full px-2 py-1 ${
                        provider.is_enabled
                          ? "bg-sky-500/12 text-sky-300"
                          : "bg-[rgba(255,255,255,0.05)] text-[var(--c-text-muted)]"
                      }`}
                    >
                      {provider.is_enabled ? "Enabled" : "Disabled"}
                    </span>
                  </div>
                </div>

                <div className="grid gap-1 min-w-0 xl:block">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--c-text-faint)] xl:hidden">
                    API Key
                  </div>
                  <div className="truncate text-xs font-mono text-[var(--c-text-muted)]">
                    {provider.api_key_masked || (provider.has_api_key ? "Configured" : "Not set")}
                  </div>
                </div>

                <div className="grid gap-1 xl:block">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--c-text-faint)] xl:hidden">
                    Actions
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      className="px-3 py-2 text-xs"
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpenCredentials(provider);
                      }}
                    >
                      Configure
                    </Button>
                    <Button
                      variant="secondary"
                      className="px-3 py-2 text-xs"
                      disabled={isToggling}
                      onClick={(event) => {
                        event.stopPropagation();
                        onToggleEnabled(provider.id, !provider.is_enabled);
                      }}
                    >
                      {provider.is_enabled ? "Disable" : "Enable"}
                    </Button>
                    <Button
                      variant="primary"
                      className="px-3 py-2 text-xs"
                      disabled={isActivating || provider.is_active}
                      onClick={(event) => {
                        event.stopPropagation();
                        onActivate(provider.id);
                      }}
                    >
                      {provider.is_active ? "Ready" : "Mark Ready"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
