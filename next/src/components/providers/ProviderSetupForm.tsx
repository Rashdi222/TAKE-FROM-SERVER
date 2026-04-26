"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import type { Provider } from "@/lib/api";
import { getProviderPreset, PROVIDER_PRESETS } from "./providerCatalog";

type ProviderSetupPayload = {
  name: string;
  base_url: string | null;
  api_key: string | null;
  is_enabled: boolean;
  config: Record<string, unknown>;
};

export function ProviderSetupForm({
  providers,
  onSubmit,
  isSubmitting,
  error,
}: {
  providers: Provider[];
  onSubmit: (payload: ProviderSetupPayload) => Promise<void>;
  isSubmitting?: boolean;
  error?: string | null;
}) {
  const [selectedName, setSelectedName] = useState(PROVIDER_PRESETS[0]?.name ?? "sportmonks");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [isEnabled, setIsEnabled] = useState(true);
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const [advancedJson, setAdvancedJson] = useState("{}");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const preset = useMemo(() => getProviderPreset(selectedName), [selectedName]);
  const existingProvider = useMemo(
    () => providers.find((provider) => provider.name === selectedName),
    [providers, selectedName],
  );

  useEffect(() => {
    const nextPreset = getProviderPreset(selectedName);
    const existingConfig = (existingProvider?.config ?? {}) as Record<string, unknown>;

    const nextConfigValues = Object.fromEntries(
      (nextPreset?.configFields ?? []).map((field) => {
        const raw = existingConfig[field.key];
        return [field.key, raw == null ? "" : String(raw)];
      }),
    );

    setBaseUrl(existingProvider?.base_url ?? nextPreset?.defaultBaseUrl ?? "");
    setApiKey("");
    setIsEnabled(existingProvider?.is_enabled ?? true);
    setConfigValues(nextConfigValues);

    const advancedConfig = Object.fromEntries(
      Object.entries(existingConfig).filter(([key]) => !(nextPreset?.configFields ?? []).some((field) => field.key === key)),
    );

    setAdvancedJson(JSON.stringify(advancedConfig, null, 2));
    setFormError(null);
  }, [selectedName, existingProvider]);

  const knownConfig = useMemo(() => {
    return Object.fromEntries(
      Object.entries(configValues)
        .map(([key, value]) => [key, normalizeConfigValue(value)] as const)
        .filter((entry): entry is [string, string | number | boolean] => entry[1] !== null),
    );
  }, [configValues]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    let advancedConfig: Record<string, unknown> = {};

    try {
      const parsed = JSON.parse(advancedJson || "{}") as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("invalid");
      }
      advancedConfig = parsed as Record<string, unknown>;
    } catch {
      setFormError("Advanced JSON must be a valid object.");
      return;
    }

    await onSubmit({
      name: selectedName,
      base_url: baseUrl.trim() || null,
      api_key: apiKey.trim() || null,
      is_enabled: isEnabled,
      config: {
        ...knownConfig,
        ...advancedConfig,
      },
    });
  };

  return (
    <form className="space-y-6" onSubmit={handleSubmit} autoComplete="off">
      {error || formError ? <Alert variant="error">{error || formError}</Alert> : null}

      <div className="sr-only" aria-hidden="true">
        <input tabIndex={-1} autoComplete="username" name="provider-username-decoy" defaultValue="" />
        <input tabIndex={-1} autoComplete="current-password" name="provider-password-decoy" type="password" defaultValue="" />
      </div>

      <Card variant="surface-2" className="p-6">
        <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-[var(--c-text)]">Provider</label>
              <select
                value={selectedName}
                onChange={(event) => setSelectedName(event.target.value)}
                className="mt-2 w-full rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-3 text-[var(--c-text)] outline-none focus:border-[var(--c-accent)]"
              >
                {PROVIDER_PRESETS.map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.title} ({item.name})
                  </option>
                ))}
              </select>
            </div>

            <div className="rounded-[var(--r-md)] border border-[var(--c-border)] bg-[var(--c-surface-1)] p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">{preset?.category}</p>
              <h2 className="mt-2 text-xl font-semibold text-[var(--c-text)]">{preset?.title}</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--c-text-muted)]">{preset?.description}</p>
              <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
                <div className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[color:color-mix(in_srgb,var(--c-surface-2)_78%,transparent)] p-3">
                  <p className="text-[var(--c-text-faint)]">Auth method</p>
                  <p className="mt-1 text-[var(--c-text)]">{preset?.authLabel}</p>
                </div>
                <div className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[color:color-mix(in_srgb,var(--c-surface-2)_78%,transparent)] p-3">
                  <p className="text-[var(--c-text-faint)]">Provider odds</p>
                  <p className="mt-1 text-[var(--c-text)]">{preset?.supportsProviderOdds ? "Supported" : "Not currently supported"}</p>
                </div>
              </div>
            </div>

            {existingProvider ? (
              <div className="rounded-[var(--r-md)] border border-[var(--c-border)] bg-[color:color-mix(in_srgb,var(--c-info)_14%,transparent)] p-4 text-sm text-[var(--c-text-muted)]">
                Existing provider found. Saving this form will update the current <span className="font-medium text-[var(--c-text)]">{selectedName}</span> record instead of creating a duplicate.
              </div>
            ) : (
              <div className="rounded-[var(--r-md)] border border-[var(--c-border)] bg-[color:color-mix(in_srgb,var(--c-accent)_12%,transparent)] p-4 text-sm text-[var(--c-text-muted)]">
                This provider is not configured yet. Saving will create a new provider record.
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Input
                label="Base URL"
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                placeholder={preset?.defaultBaseUrl || "https://api.example.com"}
                name={`${selectedName}-base-url`}
                autoComplete="url"
                spellCheck={false}
              />
              <Input
                label={preset?.authLabel || "Credential"}
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={existingProvider?.has_api_key ? "Leave blank to keep stored credential" : "Paste provider credential"}
                type="password"
                name={`${selectedName}-provider-credential`}
                autoComplete="new-password"
                spellCheck={false}
                data-lpignore="true"
              />
            </div>

            <label className="flex items-center gap-3 rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-3 text-sm text-[var(--c-text)]">
              <input type="checkbox" checked={isEnabled} onChange={(event) => setIsEnabled(event.target.checked)} />
              Provider is enabled for operations
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              {(preset?.configFields ?? []).map((field) => (
                <div key={field.key} className="space-y-2">
                  <Input
                    label={field.label}
                    value={configValues[field.key] ?? ""}
                    onChange={(event) =>
                      setConfigValues((current) => ({
                        ...current,
                        [field.key]: event.target.value,
                      }))
                    }
                    placeholder={field.placeholder}
                  />
                  <p className="text-xs leading-5 text-[var(--c-text-faint)]">{field.help}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <Card variant="surface-2" className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-[var(--c-text)]">Advanced Config</h3>
            <p className="mt-1 text-sm text-[var(--c-text-muted)]">
              Only use this for uncommon provider-specific keys. Normal setup should be done through the form fields above.
            </p>
          </div>
          <Button type="button" variant="secondary" onClick={() => setAdvancedOpen((value) => !value)}>
            {advancedOpen ? "Hide advanced JSON" : "Show advanced JSON"}
          </Button>
        </div>

        {advancedOpen ? (
          <div className="mt-5 space-y-4">
            <textarea
              value={advancedJson}
              onChange={(event) => setAdvancedJson(event.target.value)}
              rows={10}
              className="w-full rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-3 font-mono text-sm leading-6 text-[var(--c-text)] outline-none focus:border-[var(--c-accent)]"
            />
            <div className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] p-4 text-xs leading-6 text-[var(--c-text-muted)]">
              Saved config preview:
              <pre className="mt-2 overflow-auto text-[11px]">{JSON.stringify({ ...knownConfig, ...safeJsonPreview(advancedJson) }, null, 2)}</pre>
            </div>
          </div>
        ) : null}
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button type="submit" variant="primary" disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : existingProvider ? "Update provider" : "Create provider"}
        </Button>
      </div>
    </form>
  );
}

function normalizeConfigValue(value: string): string | number | boolean | null {
  const trimmed = value.trim();

  if (!trimmed) return null;
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (/^-?\d+$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}

function safeJsonPreview(value: string) {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
