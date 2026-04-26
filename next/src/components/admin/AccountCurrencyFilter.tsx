"use client";

import type { AccountCurrency } from "@/lib/api";

export function AccountCurrencyFilter({
  value,
  onChange,
  currencies,
  label = "Currency",
}: {
  value: string;
  onChange: (value: string) => void;
  currencies: AccountCurrency[];
  label?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-[var(--c-text)]">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-2 text-[var(--c-text)]"
      >
        <option value="">All currencies</option>
        {currencies.map((currency) => (
          <option key={currency.code} value={currency.code}>
            {currency.flag} {currency.code}
          </option>
        ))}
      </select>
    </div>
  );
}
