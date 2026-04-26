"use client";

import { useMemo, useState } from "react";
import { useAccountCurrencies, useCreateMasterAdmin } from "@/hooks/useSuperAdmin";
import { Card } from "../ui/Card";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import { Alert } from "../ui/Alert";
import { AccountCurrencySelect } from "../ui/AccountCurrencySelect";
import { CountryPhoneField } from "../ui/CountryPhoneField";

const initialFormData = {
  email: "",
  password: "",
  username: "",
  country_code: "",
  phone_number: "",
  balance: "",
  account_currency: "PKR",
  supported_account_currencies: ["PKR"],
};

export function CreateMasterAdminForm() {
  const [formData, setFormData] = useState(initialFormData);
  const [success, setSuccess] = useState("");

  const createAdmin = useCreateMasterAdmin();
  const { data: currencyData } = useAccountCurrencies();
  const currencies = useMemo(
    () => (currencyData?.data ?? []).filter((currency) => currency.enabled !== false),
    [currencyData]
  );
  const selectedCurrency =
    currencies.some((currency) => currency.code === formData.account_currency)
      ? formData.account_currency
      : (currencies[0]?.code ?? formData.account_currency);

  const selectedSupportedCurrencies =
    formData.supported_account_currencies.includes(selectedCurrency)
      ? formData.supported_account_currencies
      : Array.from(new Set([selectedCurrency, ...formData.supported_account_currencies]));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccess("");

    const body = {
      email: formData.email,
      password: formData.password,
      username: formData.username,
      country_code: formData.country_code || null,
      phone_number: formData.phone_number || null,
      balance: formData.balance === "" ? 0 : formData.balance,
      account_currency: selectedCurrency,
      supported_account_currencies: selectedSupportedCurrencies,
    };

    try {
      await createAdmin.mutateAsync(body);
      setSuccess("Master admin created successfully!");
      setFormData(initialFormData);
    } catch {
      // Error handled by mutation state.
    }
  };

  return (
    <Card variant="surface-2" className="p-6">
      <h3 className="text-xl font-semibold text-[var(--c-text)] mb-4">Create Master Admin</h3>

      {createAdmin.isError && (
        <Alert variant="error" className="mb-4">
          Failed to create master admin. Check the required fields and try again.
        </Alert>
      )}

      {success && <Alert variant="success" className="mb-4">{success}</Alert>}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Username"
          value={formData.username}
          onChange={(e) => setFormData((p) => ({ ...p, username: e.target.value }))}
          required
          placeholder="master_admin_01"
        />

        <Input
          label="Email"
          type="email"
          value={formData.email}
          onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))}
          required
          placeholder="admin@example.com"
        />

        <CountryPhoneField
          countryCode={formData.country_code}
          phoneNumber={formData.phone_number}
          onCountryCodeChange={(value) => setFormData((p) => ({ ...p, country_code: value }))}
          onPhoneNumberChange={(value) => setFormData((p) => ({ ...p, phone_number: value }))}
          helperText="Select a country or enter the international phone code first. The form will synchronize the fields."
        />

        <Input
          label="Initial Balance"
          type="number"
          min="0"
          step="0.01"
          value={formData.balance}
          onChange={(e) => setFormData((p) => ({ ...p, balance: e.target.value }))}
          placeholder="50000"
        />

        <p className="text-xs text-[var(--c-text-faint)]">
          This balance is allocated to the master admin immediately and becomes the pool they use for player funding operations.
        </p>

        {currencies.length > 0 ? (
          <AccountCurrencySelect
            value={selectedCurrency}
            onChange={(value) => setFormData((p) => ({ ...p, account_currency: value }))}
            currencies={currencies}
            helperText="This is the primary operating currency for this master admin."
          />
        ) : null}

        {currencies.length > 0 ? (
          <div className="flex flex-col gap-3">
            <label className="text-sm font-medium text-[var(--c-text)]">Supported Player Currencies</label>
            <div className="flex flex-wrap gap-2">
              {currencies.map((currency) => {
                const checked = selectedSupportedCurrencies.includes(currency.code);
                const locked = currency.code === selectedCurrency;

                return (
                  <button
                    type="button"
                    key={currency.code}
                    onClick={() =>
                      setFormData((p) => ({
                        ...p,
                        supported_account_currencies: locked
                          ? p.supported_account_currencies
                          : checked
                            ? p.supported_account_currencies.filter((code) => code !== currency.code)
                            : Array.from(new Set([...p.supported_account_currencies, currency.code])),
                      }))
                    }
                    className={[
                      "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm transition-colors",
                      checked
                        ? "border-[rgba(58,139,255,0.34)] bg-[rgba(58,139,255,0.14)] text-[var(--c-text)]"
                        : "border-[var(--c-border)] bg-[var(--c-surface-1)] text-[var(--c-text-muted)] hover:text-[var(--c-text)]",
                      locked ? "cursor-default" : "cursor-pointer",
                    ].join(" ")}
                    aria-pressed={checked}
                  >
                    <span className="text-base leading-none">{currency.flag}</span>
                    <span className="font-medium">{currency.code}</span>
                    <span className="text-xs opacity-80">{currency.name}</span>
                    {locked ? (
                      <span className="rounded-full border border-white/10 bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-[var(--c-text-faint)]">
                        Primary
                      </span>
                    ) : checked ? (
                      <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-emerald-200">
                        Enabled
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-[var(--c-text-faint)]">
              Player accounts created under this master admin can use any selected currency. The primary currency is always included.
            </p>
          </div>
        ) : null}

        <Input
          label="Password"
          type="password"
          value={formData.password}
          onChange={(e) => setFormData((p) => ({ ...p, password: e.target.value }))}
          required
          placeholder="••••••••"
        />

        <Button type="submit" variant="primary" className="w-full" disabled={createAdmin.isPending}>
          {createAdmin.isPending ? "Creating..." : "Create Master Admin"}
        </Button>
      </form>
    </Card>
  );
}
