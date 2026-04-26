"use client";

import { useState } from "react";
import { useCreatePlayer } from "@/hooks/useMasterPlayers";
import { useMasterDashboard } from "@/hooks/useMasterDashboard";
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
  amount: "",
  account_currency: "PKR",
};

export function CreatePlayerForm() {
  const [formData, setFormData] = useState(initialFormData);
  const [success, setSuccess] = useState("");

  const createPlayer = useCreatePlayer();
  const { data: dashboardData } = useMasterDashboard();
  const dashboard = (dashboardData as { data?: { account_currency?: string; supported_account_currencies?: string[] } } | undefined)?.data;
  const masterCurrency = String(dashboard?.account_currency ?? "PKR");
  const supportedCurrencies = (dashboard?.supported_account_currencies?.length ? dashboard.supported_account_currencies : [masterCurrency]).map((code) => ({
    code: code as "PKR" | "BDT" | "INR" | "USD" | "USDT",
    name: code,
    symbol: code,
    flag: "•",
    kind: code === "USDT" ? "crypto" : "fiat",
  }));
  const selectedCurrency = supportedCurrencies.some((currency) => currency.code === formData.account_currency)
    ? formData.account_currency
    : masterCurrency;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccess("");

    try {
      await createPlayer.mutateAsync({
        email: formData.email,
        password: formData.password,
        username: formData.username || null,
        country_code: formData.country_code || null,
        phone_number: formData.phone_number || null,
        amount: formData.amount || 0,
        account_currency: selectedCurrency,
      });
      setSuccess("Player created successfully!");
      setFormData(initialFormData);
    } catch {
      // Error handled by mutation state.
    }
  };

  return (
    <Card variant="surface-2" className="p-6">
      <h3 className="text-xl font-semibold text-[var(--c-text)] mb-4">Create Player</h3>

      {createPlayer.isError && (
        <Alert variant="error" className="mb-4">
          Failed to create player. Please try again.
        </Alert>
      )}

      {success && <Alert variant="success" className="mb-4">{success}</Alert>}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Username"
          value={formData.username}
          onChange={(e) => setFormData((p) => ({ ...p, username: e.target.value }))}
          placeholder="player_01"
        />

        <CountryPhoneField
          countryCode={formData.country_code}
          phoneNumber={formData.phone_number}
          onCountryCodeChange={(value) => setFormData((p) => ({ ...p, country_code: value }))}
          onPhoneNumberChange={(value) => setFormData((p) => ({ ...p, phone_number: value }))}
          helperText="You can select the country first or type the phone code first. The form will align both."
        />

        <Input
          label="Email"
          type="email"
          value={formData.email}
          onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))}
          required
          placeholder="player@example.com"
        />

        <Input
          label="Password"
          type="password"
          value={formData.password}
          onChange={(e) => setFormData((p) => ({ ...p, password: e.target.value }))}
          required
          placeholder="••••••••"
        />

        <Input
          label="Initial Balance"
          type="number"
          min="0"
          step="0.01"
          value={formData.amount}
          onChange={(e) => setFormData((p) => ({ ...p, amount: e.target.value }))}
          placeholder="0.00"
        />

        <AccountCurrencySelect
          value={selectedCurrency}
          onChange={(value) => setFormData((p) => ({ ...p, account_currency: value }))}
          currencies={supportedCurrencies}
          helperText="Select one of the currencies enabled for this master admin."
        />

        <Button type="submit" variant="primary" className="w-full" disabled={createPlayer.isPending}>
          {createPlayer.isPending ? "Creating..." : "Create Player"}
        </Button>
      </form>
    </Card>
  );
}
