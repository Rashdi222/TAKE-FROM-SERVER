"use client";

import { Copy } from "lucide-react";
import type { PaymentMethod } from "@/lib/api";
import { resolvePaymentMethodLogoSrc } from "@/lib/payments/paymentMethodPresets";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

type Props = {
  methods: PaymentMethod[];
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder: string;
  purpose?: "deposit" | "withdrawal";
  disabled?: boolean;
};

export function PaymentMethodSelector({
  methods,
  value,
  onChange,
  label,
  placeholder,
  purpose = "deposit",
  disabled,
}: Props) {
  const { showToast } = useToast();
  const selectedMethod = methods.find((method) => String(method.id) === value);
  const logoSrc = resolvePaymentMethodLogoSrc(selectedMethod?.logo_path as string | null | undefined);
  const shouldShowDestination = purpose === "deposit";

  const handleCopyAccountNumber = async () => {
    const accountNumber = String(selectedMethod?.account_number ?? "").trim();
    if (!accountNumber) return;

    try {
      await navigator.clipboard.writeText(accountNumber);
      showToast("Account number copied.", "success");
    } catch {
      showToast("Could not copy account number.", "error");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-[var(--c-text)]">{label}</label>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-2 text-[var(--c-text)]"
          required
          disabled={disabled}
        >
          <option value="">{placeholder}</option>
          {methods.map((method) => (
            <option key={String(method.id)} value={String(method.id)}>
              {String(method.label ?? method.provider)}
            </option>
          ))}
        </select>
      </div>

      {selectedMethod ? (
        <div className="rounded-[var(--r-md)] border border-[var(--c-border)] bg-[rgba(255,255,255,0.03)] p-4">
          <div className="flex items-start gap-3">
            <div className="relative h-12 w-12 overflow-hidden rounded-xl border border-white/10 bg-black/15">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {logoSrc ? <img src={logoSrc} alt={String(selectedMethod.label ?? selectedMethod.provider)} className="h-full w-full object-contain p-1.5" /> : null}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-[var(--c-text)]">
                    {String(selectedMethod.label ?? selectedMethod.provider)}
                  </p>
                  {selectedMethod.description ? (
                    <p className="mt-1 text-sm text-[var(--c-text-muted)]">
                      {String(selectedMethod.description)}
                    </p>
                  ) : null}
                  {selectedMethod.bank_name ? (
                    <p className="mt-2 text-xs uppercase tracking-[0.16em] text-[var(--c-text-faint)]">
                      {String(selectedMethod.bank_name)}
                    </p>
                  ) : null}
                </div>
                <span className="rounded-full border border-[var(--c-border)] px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-[var(--c-text-faint)]">
                  {String(selectedMethod.provider)}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {selectedMethod.supports_deposit ? (
                  <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-emerald-200">
                    Deposit
                  </span>
                ) : null}
                {selectedMethod.supports_withdrawal ? (
                  <span className="rounded-full border border-sky-400/30 bg-sky-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-sky-200">
                    Withdrawal
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          {selectedMethod.instructions ? (
            <p className="mt-3 text-sm text-[var(--c-text)]">{String(selectedMethod.instructions)}</p>
          ) : null}

          {shouldShowDestination && (selectedMethod.account_label || selectedMethod.account_number) ? (
            <div className="mt-3 rounded-[var(--r-sm)] border border-[rgba(255,255,255,0.08)] bg-[rgba(0,0,0,0.12)] px-3 py-2">
              {selectedMethod.account_label ? (
                <div className="flex items-center justify-between gap-3 border-b border-[rgba(255,255,255,0.06)] pb-2">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--c-text-faint)]">Account Title</p>
                  <p className="text-sm text-[var(--c-text)]">{String(selectedMethod.account_label)}</p>
                </div>
              ) : null}
              {selectedMethod.account_number ? (
                <div className="flex items-center justify-between gap-3 pt-2">
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--c-text-faint)]">
                      {String(selectedMethod.account_number_label ?? "Account Number")}
                    </p>
                    <p className="mt-1 break-all font-mono text-sm text-[var(--c-text)]">{String(selectedMethod.account_number)}</p>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    className="px-3 py-2 text-xs"
                    onClick={handleCopyAccountNumber}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          {!shouldShowDestination && selectedMethod ? (
            <div className="mt-3 rounded-[var(--r-sm)] border border-[rgba(255,255,255,0.08)] bg-[rgba(0,0,0,0.12)] px-3 py-2 text-sm text-[var(--c-text-muted)]">
              Enter your payout account details below for this withdrawal method.
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
