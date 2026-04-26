"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { Provider } from "@/lib/api";
import { PROVIDER_PRESETS } from "./providerCatalog";

type ProviderCredentialsDrawerProps = {
  isOpen: boolean;
  provider: Provider | null;
  onClose: () => void;
  onSave: (payload: Record<string, unknown>) => Promise<void>;
  isSaving?: boolean;
};

function stringifyJson(value: unknown) {
  if (!value || typeof value !== "object") return "{}";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "{}";
  }
}

function parseJson(value: string, fallback: Record<string, unknown> = {}) {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  const parsed = JSON.parse(trimmed);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : fallback;
}

export function ProviderCredentialsDrawer({
  isOpen,
  provider,
  onClose,
  onSave,
  isSaving = false,
}: ProviderCredentialsDrawerProps) {
  if (!isOpen) return null;

  return (
    <DrawerContent
      key={provider?.id ?? "new-provider"}
      provider={provider}
      onClose={onClose}
      onSave={onSave}
      isSaving={isSaving}
    />
  );
}

function DrawerContent({
  provider,
  onClose,
  onSave,
  isSaving,
}: {
  provider: Provider | null;
  onClose: () => void;
  onSave: (payload: Record<string, unknown>) => Promise<void>;
  isSaving: boolean;
}) {
  const [name, setName] = useState(provider?.name || "");
  const [baseUrl, setBaseUrl] = useState(provider?.base_url || "");
  const [socketUrl, setSocketUrl] = useState(provider?.socket_url || "");
  const [authMode, setAuthMode] = useState(provider?.auth_mode || "generic");
  const [apiKey, setApiKey] = useState("");
  const [sportScope, setSportScope] = useState(provider?.sport_scope?.join(", ") || "");
  const [headersTemplate, setHeadersTemplate] = useState(stringifyJson(provider?.headers_template || {}));
  const [queryTemplate, setQueryTemplate] = useState(stringifyJson(provider?.query_template || {}));
  const [configJson, setConfigJson] = useState(stringifyJson(provider?.config || {}));
  const [error, setError] = useState<string | null>(null);

  const preset = PROVIDER_PRESETS.find((item) => item.name === name);

  return (
    <div className="fixed inset-0 z-[70]">
      <button type="button" className="absolute inset-0 bg-black/60" onClick={onClose} aria-label="Close provider drawer" />
      <div className="absolute inset-y-0 right-0 flex w-full max-w-2xl flex-col border-l border-[var(--c-border)] bg-[var(--c-surface-nav)] shadow-[var(--shadow-2)]">
        <div className="border-b border-[var(--c-border)] px-5 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--c-text-faint)]">
            Provider Credentials
          </div>
          <div className="mt-2 text-xl font-semibold text-[var(--c-text)]">
            {provider ? provider.name : "New Provider"}
          </div>
          {provider?.api_key_masked ? (
            <div className="mt-2 text-xs font-mono text-[var(--c-text-muted)]">
              Stored key: {provider.api_key_masked}
            </div>
          ) : null}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="grid gap-4">
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-[var(--c-text)]">Provider Name</span>
              <select
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-2.5 text-[var(--c-text)]"
                disabled={Boolean(provider)}
              >
                <option value="">Select provider</option>
                {PROVIDER_PRESETS.map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.title}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <Input label="Base URL" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} />
              <Input label="Socket URL" value={socketUrl} onChange={(event) => setSocketUrl(event.target.value)} />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-[var(--c-text)]">Auth Mode</span>
                <select
                  value={authMode}
                  onChange={(event) => setAuthMode(event.target.value)}
                  className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-2.5 text-[var(--c-text)]"
                >
                  <option value="generic">Generic</option>
                  <option value="header">Header</option>
                  <option value="query">Query</option>
                  <option value="path">Path</option>
                </select>
              </label>

              <Input
                label={provider?.has_api_key ? "Replace API Key" : "API Key"}
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={provider?.api_key_masked || "Paste a new key"}
              />
            </div>

            <Input
              label="Sport Scope"
              value={sportScope}
              onChange={(event) => setSportScope(event.target.value)}
              placeholder="cricket, football, tennis"
            />

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-[var(--c-text)]">Headers Template</span>
              <textarea
                value={headersTemplate}
                onChange={(event) => setHeadersTemplate(event.target.value)}
                rows={5}
                className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-3 font-mono text-sm text-[var(--c-text)]"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-[var(--c-text)]">Query Template</span>
              <textarea
                value={queryTemplate}
                onChange={(event) => setQueryTemplate(event.target.value)}
                rows={5}
                className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-3 font-mono text-sm text-[var(--c-text)]"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-[var(--c-text)]">Config</span>
              <textarea
                value={configJson}
                onChange={(event) => setConfigJson(event.target.value)}
                rows={8}
                className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-3 font-mono text-sm text-[var(--c-text)]"
              />
            </label>

            {preset ? (
              <div className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[rgba(255,255,255,0.025)] p-4 text-xs leading-6 text-[var(--c-text-muted)]">
                <div className="font-semibold text-[var(--c-text)]">{preset.title}</div>
                <div>{preset.description}</div>
              </div>
            ) : null}

            {error ? (
              <div className="rounded-[var(--r-sm)] border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {error}
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-[var(--c-border)] px-5 py-4">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={isSaving}
            onClick={async () => {
              try {
                setError(null);

                const payload: Record<string, unknown> = {
                  name,
                  base_url: baseUrl,
                  socket_url: socketUrl || null,
                  auth_mode: authMode,
                  sport_scope: sportScope.split(",").map((item) => item.trim()).filter(Boolean),
                  headers_template: parseJson(headersTemplate),
                  query_template: parseJson(queryTemplate),
                  config: parseJson(configJson),
                };

                if (apiKey.trim()) payload.api_key = apiKey.trim();

                await onSave(payload);
              } catch (value) {
                setError(value instanceof Error ? value.message : "Unable to save provider settings.");
              }
            }}
          >
            {isSaving ? "Saving..." : "Save Provider"}
          </Button>
        </div>
      </div>
    </div>
  );
}
