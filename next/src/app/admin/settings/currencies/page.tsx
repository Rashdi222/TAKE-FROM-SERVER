"use client";

import { useMemo, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAccountCurrencies, useUpdateAccountCurrencies } from "@/hooks/useSuperAdmin";
import type { AccountCurrency } from "@/lib/api";

export default function CurrencySettingsPage() {
  const { data, isLoading } = useAccountCurrencies();
  const updateCurrencies = useUpdateAccountCurrencies();
  const currencies = useMemo(() => (data?.data ?? []) as AccountCurrency[], [data]);
  const [selected, setSelected] = useState<string[] | null>(null);

  const selectedCodes = selected ?? currencies.filter((currency) => currency.enabled !== false).map((currency) => currency.code);

  const toggle = (code: string) => {
    setSelected((current) => {
      const next = current ?? selectedCodes;
      return next.includes(code) ? next.filter((item) => item !== code) : [...next, code];
    });
  };

  const save = async () => {
    await updateCurrencies.mutateAsync({ enabled_codes: selectedCodes });
    setSelected(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.24em] text-[var(--c-accent)]">SEO and Platform Settings</p>
        <h1 className="mt-2 text-3xl font-semibold text-[var(--c-text)]">Account Currencies</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--c-text-muted)]">
          Control which account currencies are available for new registrations and admin-created accounts. Each account operates in exactly one currency.
        </p>
      </div>

      {updateCurrencies.isError ? (
        <Alert variant="error">Saving account currencies failed. Keep at least one currency enabled and retry.</Alert>
      ) : null}

      {updateCurrencies.isSuccess ? (
        <Alert variant="success">Account currencies updated.</Alert>
      ) : null}

      <Card variant="surface-2" className="p-6">
        {isLoading ? (
          <p className="text-[var(--c-text-muted)]">Loading account currencies...</p>
        ) : (
          <div className="space-y-4">
            {currencies.map((currency) => {
              const checked = selectedCodes.includes(currency.code);

              return (
                <label
                  key={currency.code}
                  className="flex items-start justify-between gap-4 rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-[var(--c-text)]">
                      {currency.flag} {currency.code} - {currency.name}
                    </p>
                    <p className="mt-1 text-xs text-[var(--c-text-faint)]">
                      {currency.kind === "crypto" ? "Crypto account" : "Fiat account"} • Symbol {currency.symbol}
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(currency.code)}
                    className="mt-1 h-4 w-4 accent-[var(--c-accent)]"
                  />
                </label>
              );
            })}

            <div className="flex justify-end pt-2">
              <Button variant="primary" onClick={save} disabled={updateCurrencies.isPending}>
                {updateCurrencies.isPending ? "Saving..." : "Save Currency Settings"}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
