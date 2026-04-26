"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, CreditCard, Landmark, Upload, Wallet } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import type { PaymentMethod } from "@/lib/api";
import {
  PAYMENT_METHOD_PRESETS,
  PAYMENT_METHOD_PRESET_MAP,
  resolvePaymentMethodLogoSrc,
} from "@/lib/payments/paymentMethodPresets";

type SubmitValues = {
  provider: string;
  preset_key: string | null;
  method_name: string;
  bank_name: string;
  account_title: string;
  iban_or_account_number: string;
  instructions: string;
  is_active: boolean;
  supports_deposit: boolean;
  supports_withdrawal: boolean;
  logo_path: string | null;
  account_label_hint: string;
  account_number_label: string;
  account_number_placeholder: string;
  instructions_hint: string;
  sort_order: number;
};

const groupedPresets = ["Pakistan", "India", "International", "Crypto", "Custom"].map((category) => ({
  category,
  items: PAYMENT_METHOD_PRESETS.filter((preset) => preset.category === category),
}));

function presetIcon(category: string) {
  switch (category) {
    case "Pakistan":
    case "India":
      return Wallet;
    case "International":
      return Landmark;
    case "Crypto":
      return CreditCard;
    default:
      return Building2;
  }
}

export function PaymentMethodEditorForm({
  title,
  description,
  backHref,
  submitLabel,
  initialMethod,
  isPending,
  onSubmit,
  onUploadLogo,
}: {
  title: string;
  description: string;
  backHref: string;
  submitLabel: string;
  initialMethod?: PaymentMethod | null;
  isPending?: boolean;
  onSubmit: (values: SubmitValues) => Promise<void>;
  onUploadLogo: (body: FormData) => Promise<{ data?: { logo_path?: string } } | { logo_path?: string }>;
}) {
  const router = useRouter();
  const initialPresetKey = String(initialMethod?.preset_key ?? initialMethod?.provider ?? "manual");
  const [presetKey, setPresetKey] = useState(initialPresetKey);
  const initialPreset = PAYMENT_METHOD_PRESET_MAP.get(initialPresetKey) ?? PAYMENT_METHOD_PRESET_MAP.get("manual");
  const [provider, setProvider] = useState(String(initialMethod?.provider ?? initialPreset?.provider ?? "manual"));
  const [methodName, setMethodName] = useState(String(initialMethod?.method_name ?? initialPreset?.label ?? ""));
  const [bankName, setBankName] = useState(String(initialMethod?.bank_name ?? initialPreset?.bankName ?? ""));
  const [accountTitle, setAccountTitle] = useState(String(initialMethod?.account_title ?? initialMethod?.account_label ?? ""));
  const [ibanOrAccountNumber, setIbanOrAccountNumber] = useState(
    String(initialMethod?.iban_or_account_number ?? initialMethod?.account_number ?? "")
  );
  const [instructions, setInstructions] = useState(String(initialMethod?.instructions ?? ""));
  const [isActive, setIsActive] = useState(Boolean(initialMethod?.is_active ?? true));
  const [supportsDeposit, setSupportsDeposit] = useState(Boolean(initialMethod?.supports_deposit ?? initialPreset?.defaultSupportsDeposit ?? true));
  const [supportsWithdrawal, setSupportsWithdrawal] = useState(Boolean(initialMethod?.supports_withdrawal ?? initialPreset?.defaultSupportsWithdrawal ?? true));
  const [logoPath, setLogoPath] = useState<string | null>(String(initialMethod?.logo_path ?? initialPreset?.logoPath ?? "") || null);
  const [accountLabelHint, setAccountLabelHint] = useState(String(initialMethod?.account_label_hint ?? initialPreset?.accountTitlePlaceholder ?? ""));
  const [accountNumberLabel, setAccountNumberLabel] = useState(String(initialMethod?.account_number_label ?? initialPreset?.accountNumberLabel ?? "Account Number"));
  const [accountNumberPlaceholder, setAccountNumberPlaceholder] = useState(
    String(initialMethod?.account_number_placeholder ?? initialPreset?.accountNumberPlaceholder ?? "")
  );
  const [instructionsHint, setInstructionsHint] = useState(String(initialMethod?.instructions_hint ?? initialPreset?.instructionsHint ?? ""));
  const [sortOrder, setSortOrder] = useState(String(initialMethod?.sort_order ?? 0));
  const [localError, setLocalError] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);

  const selectedPreset = useMemo(
    () => PAYMENT_METHOD_PRESET_MAP.get(presetKey) ?? PAYMENT_METHOD_PRESET_MAP.get("manual")!,
    [presetKey]
  );
  const logoSrc = resolvePaymentMethodLogoSrc(logoPath);

  const applyPreset = (nextPresetKey: string) => {
    const preset = PAYMENT_METHOD_PRESET_MAP.get(nextPresetKey);
    if (!preset) return;
    setPresetKey(nextPresetKey);
    setProvider(preset.provider);
    setMethodName((current) => (initialMethod ? current : preset.label));
    setBankName((current) => (current && current !== initialPreset?.bankName ? current : preset.bankName));
    setAccountLabelHint(preset.accountTitlePlaceholder);
    setAccountNumberLabel(preset.accountNumberLabel);
    setAccountNumberPlaceholder(preset.accountNumberPlaceholder);
    setInstructionsHint(preset.instructionsHint);
    setSupportsDeposit(preset.defaultSupportsDeposit);
    setSupportsWithdrawal(preset.defaultSupportsWithdrawal);
    if (!initialMethod?.logo_path || initialMethod.logo_path === logoPath) {
      setLogoPath(preset.logoPath);
    }
  };

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setLocalError(null);
    setLogoUploading(true);

    try {
      const body = new FormData();
      body.set("logo", file);
      const result = await onUploadLogo(body);
      const nextLogoPath = result?.data?.logo_path ?? (result as { logo_path?: string })?.logo_path;
      if (!nextLogoPath) throw new Error("Logo upload failed.");
      setLogoPath(nextLogoPath);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Unable to upload logo.");
    } finally {
      setLogoUploading(false);
      event.target.value = "";
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalError(null);

    if (!provider || !methodName || !accountTitle || !ibanOrAccountNumber || !instructions) {
      setLocalError("All structured payment fields are required.");
      return;
    }

    if (!supportsDeposit && !supportsWithdrawal) {
      setLocalError("Enable deposit or withdrawal support for this method.");
      return;
    }

    try {
      await onSubmit({
        provider,
        preset_key: presetKey || null,
        method_name: methodName,
        bank_name: bankName,
        account_title: accountTitle,
        iban_or_account_number: ibanOrAccountNumber,
        instructions,
        is_active: isActive,
        supports_deposit: supportsDeposit,
        supports_withdrawal: supportsWithdrawal,
        logo_path: logoPath,
        account_label_hint: accountLabelHint,
        account_number_label: accountNumberLabel,
        account_number_placeholder: accountNumberPlaceholder,
        instructions_hint: instructionsHint,
        sort_order: Number(sortOrder || 0),
      });
      router.push(backHref);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Unable to save payment method.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--c-accent)]">Payments</p>
          <h1 className="mt-2 text-3xl font-semibold text-[var(--c-text)]">{title}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--c-text-muted)]">{description}</p>
        </div>
        <Link href={backHref} className="text-sm text-[var(--c-accent)] hover:text-[var(--c-text)]">
          Back to methods
        </Link>
      </div>

      <Card variant="surface-2" className="p-6">
        <form className="space-y-6" onSubmit={handleSubmit}>
          {localError ? <Alert variant="error">{localError}</Alert> : null}

          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-[var(--c-text)]">Preset Library</p>
              <p className="mt-1 text-xs leading-6 text-[var(--c-text-muted)]">
                Start from a real payment rail preset, then customize the labels, instructions, usage flow, and logo.
              </p>
            </div>
            <div className="space-y-4">
              {groupedPresets.map((group) => {
                const Icon = presetIcon(group.category);
                return (
                  <div key={group.category} className="space-y-3">
                    <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-[var(--c-text-faint)]">
                      <Icon className="h-4 w-4" />
                      <span>{group.category}</span>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {group.items.map((preset) => {
                        const active = presetKey === preset.key;
                        return (
                          <button
                            key={preset.key}
                            type="button"
                            onClick={() => applyPreset(preset.key)}
                            className={`flex items-center gap-3 rounded-[var(--r-md)] border px-4 py-3 text-left transition ${
                              active
                                ? "border-[var(--c-accent)] bg-[rgba(99,32,232,0.14)]"
                                : "border-[var(--c-border)] bg-[var(--c-surface-1)] hover:border-[var(--c-accent)]/40"
                            }`}
                          >
                            <div className="relative h-11 w-11 overflow-hidden rounded-xl border border-white/10 bg-black/15">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={preset.logoPath} alt={preset.label} className="h-full w-full object-contain p-1.5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-[var(--c-text)]">{preset.label}</p>
                              <p className="truncate text-[11px] uppercase tracking-[0.16em] text-[var(--c-text-faint)]">{preset.provider}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-[var(--c-text)]">Provider Key</label>
                  <input
                    value={provider}
                    onChange={(event) => setProvider(event.target.value)}
                    className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-2 text-[var(--c-text)]"
                    placeholder="jazzcash or custom_wallet"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-[var(--c-text)]">Display Name</label>
                  <input
                    value={methodName}
                    onChange={(event) => setMethodName(event.target.value)}
                    className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-2 text-[var(--c-text)]"
                    placeholder={selectedPreset.label}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-[var(--c-text)]">Bank / Network</label>
                  <input
                    value={bankName}
                    onChange={(event) => setBankName(event.target.value)}
                    className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-2 text-[var(--c-text)]"
                    placeholder={selectedPreset.bankName || "JazzCash, UBL, TRON, Skrill"}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-[var(--c-text)]">Sort Priority</label>
                  <input
                    type="number"
                    min="0"
                    value={sortOrder}
                    onChange={(event) => setSortOrder(event.target.value)}
                    className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-2 text-[var(--c-text)]"
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-[var(--c-text)]">Account Title</label>
                  <input
                    value={accountTitle}
                    onChange={(event) => setAccountTitle(event.target.value)}
                    className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-2 text-[var(--c-text)]"
                    placeholder={selectedPreset.accountTitlePlaceholder}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-[var(--c-text)]">Player Label For Title</label>
                  <input
                    value={accountLabelHint}
                    onChange={(event) => setAccountLabelHint(event.target.value)}
                    className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-2 text-[var(--c-text)]"
                    placeholder="Account holder name"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-[var(--c-text)]">Account / Wallet Field Label</label>
                  <input
                    value={accountNumberLabel}
                    onChange={(event) => setAccountNumberLabel(event.target.value)}
                    className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-2 text-[var(--c-text)]"
                    placeholder={selectedPreset.accountNumberLabel}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-[var(--c-text)]">Account / Wallet Placeholder</label>
                  <input
                    value={accountNumberPlaceholder}
                    onChange={(event) => setAccountNumberPlaceholder(event.target.value)}
                    className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-2 text-[var(--c-text)]"
                    placeholder={selectedPreset.accountNumberPlaceholder}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-[var(--c-text)]">Destination Account / Wallet</label>
                  <input
                    value={ibanOrAccountNumber}
                    onChange={(event) => setIbanOrAccountNumber(event.target.value)}
                    className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-2 font-mono text-[var(--c-text)]"
                    placeholder={selectedPreset.accountNumberPlaceholder}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-[var(--c-text)]">Player Instructions Hint</label>
                  <input
                    value={instructionsHint}
                    onChange={(event) => setInstructionsHint(event.target.value)}
                    className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-2 text-[var(--c-text)]"
                    placeholder={selectedPreset.instructionsHint}
                  />
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <label className="flex items-center gap-3 rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-3 text-sm text-[var(--c-text)]">
                  <input type="checkbox" checked={supportsDeposit} onChange={(event) => setSupportsDeposit(event.target.checked)} />
                  Use for deposits
                </label>
                <label className="flex items-center gap-3 rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-3 text-sm text-[var(--c-text)]">
                  <input type="checkbox" checked={supportsWithdrawal} onChange={(event) => setSupportsWithdrawal(event.target.checked)} />
                  Use for withdrawals
                </label>
                <label className="flex items-center gap-3 rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-3 text-sm text-[var(--c-text)]">
                  <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
                  Mark active after save
                </label>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-[var(--c-text)]">Instructions</label>
                <textarea
                  value={instructions}
                  onChange={(event) => setInstructions(event.target.value)}
                  rows={8}
                  className="w-full rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-3 text-sm leading-6 text-[var(--c-text)] outline-none transition-colors focus:border-[var(--c-accent)]"
                  placeholder={selectedPreset.instructionsHint}
                />
                <p className="text-xs leading-6 text-[var(--c-text-faint)]">
                  Make the steps exact. Players should know where to send funds, what note to include, and what proof to upload or what payout detail to expect.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <Card variant="surface-1" className="p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Logo</p>
                <div className="mt-3 flex items-center gap-4">
                  <div className="relative h-20 w-20 overflow-hidden rounded-2xl border border-white/10 bg-black/20">
                    {logoSrc ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={logoSrc} alt={methodName || selectedPreset.label} className="h-full w-full object-contain p-2" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-[var(--c-text-faint)]">No logo</div>
                    )}
                  </div>
                  <div className="flex-1">
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-[var(--r-pill)] border border-[var(--c-border)] px-4 py-2 text-sm text-[var(--c-text)] hover:border-[var(--c-accent)]/40">
                      <Upload className="h-4 w-4" />
                      {logoUploading ? "Uploading..." : "Upload custom logo"}
                      <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={handleLogoUpload} />
                    </label>
                    <p className="mt-2 text-xs leading-6 text-[var(--c-text-faint)]">
                      Use your own brand asset or keep the preset logo. PNG, JPG, WEBP, and SVG are supported.
                    </p>
                  </div>
                </div>
              </Card>

              <Card variant="surface-1" className="p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Preview</p>
                <div className="mt-4 rounded-[var(--r-md)] border border-[var(--c-border)] bg-[rgba(255,255,255,0.03)] p-4">
                  <div className="flex items-start gap-3">
                    <div className="relative h-12 w-12 overflow-hidden rounded-xl border border-white/10 bg-black/20">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {logoSrc ? <img src={logoSrc} alt={methodName || selectedPreset.label} className="h-full w-full object-contain p-1.5" /> : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-semibold text-[var(--c-text)]">{methodName || selectedPreset.label}</p>
                      <p className="truncate text-xs uppercase tracking-[0.16em] text-[var(--c-text-faint)]">{provider}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {supportsDeposit ? <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-emerald-200">Deposit</span> : null}
                        {supportsWithdrawal ? <span className="rounded-full border border-sky-400/30 bg-sky-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-sky-200">Withdrawal</span> : null}
                        <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-[var(--c-text-faint)]">{isActive ? "Active" : "Inactive"}</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 rounded-[var(--r-sm)] border border-white/10 bg-black/15 px-3 py-3">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--c-text-faint)]">{accountNumberLabel || "Account"}</p>
                    <p className="mt-1 font-mono text-sm text-[var(--c-text)]">{ibanOrAccountNumber || accountNumberPlaceholder || "Not configured yet"}</p>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[var(--c-text-muted)]">{instructions || instructionsHint}</p>
                </div>
              </Card>
            </div>
          </div>

          <div className="flex gap-3">
            <Button type="submit" variant="primary" disabled={isPending || logoUploading}>
              {isPending ? "Saving..." : submitLabel}
            </Button>
            <Link href={backHref}>
              <Button type="button" variant="secondary">Cancel</Button>
            </Link>
          </div>
        </form>
      </Card>
    </div>
  );
}
