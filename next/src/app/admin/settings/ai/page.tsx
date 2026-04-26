"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { OpenRouterModel } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import {
  useOpenRouterModels,
  useOpenRouterSettings,
  useSetOpenRouterKey,
  useSetOpenRouterModel,
} from "@/hooks/useSuperAdmin";

function modelLabel(model: OpenRouterModel): string {
  return String(model.id ?? model.canonical_slug ?? model.name ?? "unknown-model");
}

export default function AiSettingsPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [draftModel, setDraftModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [search, setSearch] = useState("");
  const [modelTouched, setModelTouched] = useState(false);
  const { data, isLoading } = useOpenRouterModels(refreshKey);
  const { data: currentSettingsData } = useOpenRouterSettings();
  const setModel = useSetOpenRouterModel();
  const setKey = useSetOpenRouterKey();

  const response = (data as { data?: OpenRouterModel[]; cached_at?: string | null } | undefined) ?? {};
  const currentSettings =
    (currentSettingsData as {
      data?: { openrouter_active_model?: string | null; openrouter_api_key_configured?: boolean };
    } | undefined)?.data ?? {};
  const models = (response.data ?? []) as OpenRouterModel[];
  const selectedModel =
    modelTouched ? draftModel : (currentSettings.openrouter_active_model ?? "");

  const needle = search.toLowerCase();
  const filteredModels = models.filter((model) =>
    modelLabel(model).toLowerCase().includes(needle)
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--c-accent)]">AI Settings</p>
          <h1 className="mt-2 text-3xl font-semibold text-[var(--c-text)]">OpenRouter Configuration</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--c-text-muted)]">
            Configure the OpenRouter API key and choose the model used by the backend AI orchestration flows. This page reflects the backend settings endpoints as they exist now.
          </p>
        </div>
        <Button variant="secondary" onClick={() => setRefreshKey((value) => value + 1)}>
          Refresh model catalog
        </Button>
      </div>

      {(setModel.isError || setKey.isError) ? (
        <Alert variant="error">One of the AI settings actions failed. Review the payload and retry.</Alert>
      ) : null}

      <div className="sr-only" aria-hidden="true">
        <input tabIndex={-1} autoComplete="username" name="admin-username-decoy" defaultValue="" />
        <input tabIndex={-1} autoComplete="current-password" name="admin-password-decoy" type="password" defaultValue="" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card variant="surface-2" className="p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Model catalog</p>
              <p className="mt-2 text-sm text-[var(--c-text-muted)]">Cached at {formatDateTime(response.cached_at)}</p>
            </div>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search models"
              name="openrouter-model-search"
              autoComplete="off"
            />
          </div>

          {isLoading ? (
            <p className="mt-6 text-[var(--c-text-muted)]">Loading OpenRouter models...</p>
          ) : (
            <div className="mt-6 grid gap-3 max-h-[34rem] overflow-auto pr-1">
              {filteredModels.map((model) => {
                const label = modelLabel(model);
                const isSelected = selectedModel === label;
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => {
                      setModelTouched(true);
                      setDraftModel(label);
                    }}
                    className={`rounded-[var(--r-sm)] border p-4 text-left transition-colors ${
                      isSelected
                        ? "border-[var(--c-accent)] bg-[var(--c-accent-soft)]"
                        : "border-[var(--c-border)] bg-[var(--c-surface-1)] hover:border-[var(--c-accent)]"
                    }`}
                  >
                    <p className="font-mono text-sm text-[var(--c-text)]">{label}</p>
                    <p className="mt-2 text-sm text-[var(--c-text-muted)]">{String(model.description ?? "No description available.")}</p>
                  </button>
                );
              })}
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card variant="surface-2" className="p-6">
            <h2 className="text-xl font-semibold text-[var(--c-text)]">Set active model</h2>
            <p className="mt-2 text-sm text-[var(--c-text-muted)]">Select a model from the catalog or paste an exact model id.</p>
            <div className="mt-4 space-y-4">
              {currentSettings.openrouter_active_model ? (
                <div className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[color:color-mix(in_srgb,var(--c-accent)_10%,transparent)] px-4 py-3 text-sm text-[var(--c-text-muted)]">
                  Saved model: <span className="font-mono text-[var(--c-text)]">{currentSettings.openrouter_active_model}</span>
                </div>
              ) : null}
              <Input
                value={selectedModel}
                onChange={(e) => {
                  setModelTouched(true);
                  setDraftModel(e.target.value);
                }}
                placeholder="openrouter/model-id"
                name="openrouter-active-model"
                autoComplete="off"
                spellCheck={false}
              />
              <Button variant="primary" onClick={() => setModel.mutate({ model: selectedModel })} disabled={setModel.isPending || !selectedModel.trim()}>
                {setModel.isPending ? "Saving..." : "Save active model"}
              </Button>
            </div>
          </Card>

          <Card variant="surface-2" className="p-6">
            <h2 className="text-xl font-semibold text-[var(--c-text)]">Set API key</h2>
            <p className="mt-2 text-sm text-[var(--c-text-muted)]">The backend stores this key encrypted. It is not echoed back by the API.</p>
            <div className="mt-4 space-y-4">
              <div className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[color:color-mix(in_srgb,var(--c-info)_10%,transparent)] px-4 py-3 text-sm text-[var(--c-text-muted)]">
                {currentSettings.openrouter_api_key_configured ? "API key is configured in the database." : "No API key is currently configured."}
              </div>
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={currentSettings.openrouter_api_key_configured ? "Paste a new key to replace the stored one" : "sk-or-v1-..."}
                name="openrouter-api-key"
                autoComplete="new-password"
                spellCheck={false}
                data-lpignore="true"
              />
              <Button variant="secondary" onClick={() => setKey.mutate({ api_key: apiKey })} disabled={setKey.isPending || !apiKey.trim()}>
                {setKey.isPending ? "Saving..." : "Save API key"}
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
