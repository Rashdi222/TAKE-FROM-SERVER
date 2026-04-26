"use client";

import type { AccountCurrency } from "@/lib/api";

type AccountCurrencySelectProps = {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  currencies: AccountCurrency[];
  disabled?: boolean;
  helperText?: string;
};

export function AccountCurrencySelect({
  label = "Account Currency",
  value,
  onChange,
  currencies,
  disabled = false,
  helperText,
}: AccountCurrencySelectProps) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium tracking-[0.01em] text-[var(--c-text)]">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="px-4 py-2.5 rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.025),rgba(255,255,255,0.01))] bg-[var(--c-surface-1)] text-[var(--c-text)] transition-colors focus:outline-none focus:border-[var(--c-accent)] focus:ring-2 focus:ring-[rgba(99,32,232,0.18)] disabled:cursor-not-allowed disabled:opacity-70"
      >
        {currencies.map((currency) => (
          <option key={currency.code} value={currency.code}>
            {currency.flag} {currency.code} - {currency.name}
          </option>
        ))}
      </select>
      {helperText ? <p className="text-xs text-[var(--c-text-faint)]">{helperText}</p> : null}
    </div>
  );
}
