"use client";

import { useMemo, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { CountryPhoneField } from "@/components/ui/CountryPhoneField";
import { ApiError } from "@/lib/api";
import { inferCountryFromPhone, sanitizePhoneNumberInput, syncPhoneWithCountry } from "@/lib/geo/countries";
import { useLandingWhatsappSettings, useUpdateLandingWhatsappSettings } from "@/hooks/useSuperAdmin";

type FormState = {
  enabled: boolean;
  channel: string;
  label: string;
  phone_number: string;
  country_code: string;
  message: string;
};

const EMPTY_FORM: FormState = {
  enabled: false,
  channel: "whatsapp",
  label: "WhatsApp Support",
  phone_number: "",
  country_code: "",
  message: "",
};

export default function LandingWhatsappSettingsPage() {
  const { data } = useLandingWhatsappSettings();
  const updateSettings = useUpdateLandingWhatsappSettings();
  const [draft, setDraft] = useState<FormState | null>(null);
  const [success, setSuccess] = useState("");
  const [validationError, setValidationError] = useState("");

  const persistedForm = useMemo(() => {
    const settings = (data as { data?: Partial<FormState> } | undefined)?.data;
    if (!settings) return EMPTY_FORM;

    const phoneNumber = sanitizePhoneNumberInput(String(settings.phone_number ?? ""));
    const inferredCountry = inferCountryFromPhone(phoneNumber)?.code ?? "";

    return {
      enabled: Boolean(settings.enabled),
      channel: "whatsapp",
      label: String(settings.label ?? "WhatsApp Support"),
      phone_number: phoneNumber,
      country_code: inferredCountry,
      message: String(settings.message ?? ""),
    };
  }, [data]);

  const form = draft ?? persistedForm;

  const handleSave = async () => {
    setSuccess("");
    setValidationError("");

    const normalizedPhone = sanitizePhoneNumberInput(
      syncPhoneWithCountry(form.phone_number, form.country_code, form.country_code),
    );

    if (form.enabled && !/^\+?[1-9]\d{6,14}$/.test(normalizedPhone)) {
      setValidationError("Enter a valid WhatsApp number before enabling the launcher.");
      return;
    }

    await updateSettings.mutateAsync({
      enabled: form.enabled,
      channel: "whatsapp",
      label: form.label,
      phone_number: normalizedPhone,
      country_code: form.country_code,
      message: form.message,
    });
    setDraft({ ...form, phone_number: normalizedPhone, channel: "whatsapp" as const });
    setSuccess("Landing WhatsApp settings saved.");
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.24em] text-[var(--c-accent)]">Landing Contact</p>
        <h1 className="mt-2 text-3xl font-semibold text-[var(--c-text)]">WhatsApp Launcher</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--c-text-muted)]">
          Control the floating WhatsApp contact launcher shown on the public landing experience. If enabled and configured, visitors can open the popup and see the configured channel and contact number.
        </p>
      </div>

      {validationError ? <Alert variant="error">{validationError}</Alert> : null}

      {updateSettings.isError ? (
        <Alert variant="error">
          {updateSettings.error instanceof ApiError
            ? updateSettings.error.message
            : "Unable to save landing WhatsApp settings right now."}
        </Alert>
      ) : null}

      {success ? <Alert variant="success">{success}</Alert> : null}

      <Card variant="surface-2" className="p-6">
        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-3">
              <div>
                <p className="text-sm font-medium text-[var(--c-text)]">Enable landing launcher</p>
                <p className="mt-1 text-xs text-[var(--c-text-muted)]">Only enabled settings with a phone number will render the floating button on the public shell.</p>
              </div>
              <button
                type="button"
                aria-pressed={form.enabled}
                onClick={() => setDraft((prev) => ({ ...(prev ?? form), enabled: !form.enabled, channel: "whatsapp" as const }))}
                className={`relative h-7 w-14 rounded-full transition-colors ${form.enabled ? "bg-[var(--c-accent)]" : "bg-[var(--c-surface-3)]"}`}
              >
                <span
                  className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-transform ${form.enabled ? "translate-x-8" : "translate-x-1"}`}
                />
              </button>
            </div>

            <Input
              label="Popup Label"
              value={form.label}
              onChange={(e) => setDraft((prev) => ({ ...(prev ?? form), label: e.target.value }))}
              placeholder="WhatsApp Support"
            />

            <CountryPhoneField
              countryCode={form.country_code}
              phoneNumber={form.phone_number}
              onCountryCodeChange={(value) => setDraft((prev) => ({ ...(prev ?? form), country_code: value }))}
              onPhoneNumberChange={(value) => setDraft((prev) => ({ ...(prev ?? form), phone_number: value }))}
              helperText="Select a country or type the international WhatsApp number directly. The popup uses this exact number."
              required={form.enabled}
            />

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium tracking-[0.01em] text-[var(--c-text)]">Popup Message</label>
              <textarea
                value={form.message}
                onChange={(e) => setDraft((prev) => ({ ...(prev ?? form), message: e.target.value }))}
                rows={4}
                placeholder="Chat with our support desk on WhatsApp."
                className="px-4 py-3 rounded-[var(--r-sm)] border bg-[var(--c-surface-1)] text-[var(--c-text)] placeholder:text-[var(--c-text-faint)] focus:outline-none focus:border-[var(--c-accent)] focus:ring-2 focus:ring-[rgba(99,32,232,0.18)]"
              />
            </div>

            <Button variant="primary" onClick={() => void handleSave()} disabled={updateSettings.isPending}>
              {updateSettings.isPending ? "Saving..." : "Save launcher settings"}
            </Button>
          </div>

          <div className="rounded-[var(--r-md)] border border-[var(--c-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Preview</p>
            <div className="mt-4 rounded-[var(--r-md)] border border-[var(--c-border)] bg-[var(--c-surface-1)] p-4 shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#25D366] text-lg font-semibold text-white">
                  W
                </div>
                <div>
                  <p className="text-sm font-semibold text-[var(--c-text)]">{form.label || "WhatsApp Support"}</p>
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--c-text-faint)]">whatsapp</p>
                </div>
              </div>
              <div className="mt-4 space-y-2 rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[rgba(255,255,255,0.02)] p-4 text-sm">
                <p className="text-[var(--c-text-muted)]">{form.message || "Chat with our support desk on WhatsApp."}</p>
                <p className="font-mono text-[var(--c-text)]">{form.phone_number || "+923001234567"}</p>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
