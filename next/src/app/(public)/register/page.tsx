"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { publicApi } from "@/lib/api";
import { setSession } from "@/lib/auth/session";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { AccountCurrencySelect } from "@/components/ui/AccountCurrencySelect";
import { CountryPhoneField } from "@/components/ui/CountryPhoneField";
import { ApiError } from "@/lib/api/errors";

export default function RegisterPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    username: "",
    country_code: "",
    phone_number: "",
    email: "",
    password: "",
    confirmPassword: "",
    account_currency: "PKR",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { data: currencyData } = useQuery({
    queryKey: ["public", "settings", "account-currencies"],
    queryFn: () => publicApi.settings.accountCurrencies(),
  });

  const currencies = useMemo(() => currencyData?.data ?? [], [currencyData]);
  const selectedCurrency =
    currencies.some((currency) => currency.code === formData.account_currency)
      ? formData.account_currency
      : (currencies[0]?.code ?? formData.account_currency);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);

    try {
      const response = await publicApi.auth.register({
        email: formData.email,
        username: formData.username.trim() || undefined,
        country_code: formData.country_code || undefined,
        phone_number: formData.phone_number.trim() || undefined,
        password: formData.password,
        account_currency: selectedCurrency as "PKR" | "BDT" | "INR" | "USD" | "USDT",
      });

      setSession({
        accessToken: response.access_token,
        refreshToken: response.refresh_token,
      });

      router.push("/profile");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.fieldErrors) {
          const firstField = Object.keys(err.fieldErrors)[0];
          setError(err.fieldErrors[firstField]?.[0] || err.message);
        } else {
          setError(err.message);
        }
      } else {
        setError("Registration failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-[92vh] overflow-hidden sb-auth-bg">
      <div className="pointer-events-none absolute inset-0">
        <div className="sb-glow absolute -left-24 top-[-140px] h-[360px] w-[360px] rounded-full" style={{ background: "radial-gradient(circle, rgba(58,139,255,0.28), rgba(13,11,21,0) 65%)" }} />
        <div className="sb-glow absolute -right-28 bottom-[-200px] h-[520px] w-[520px] rounded-full" style={{ background: "radial-gradient(circle, rgba(99,32,232,0.26), rgba(13,11,21,0) 70%)" }} />
      </div>

      <div className="relative mx-auto flex min-h-[92vh] max-w-6xl items-center justify-center px-4 py-10 sm:px-6 sm:py-16">
        <Card
          variant="surface-2"
          className="sb-panel-auth sb-animate-rise w-full max-w-xl border-[var(--c-border-strong)] p-5 shadow-[0_18px_64px_rgba(0,0,0,0.55)] backdrop-blur-[18px] sm:p-8 md:p-10"
        >
          <div className="mb-6 text-center sm:mb-7">
            <p className="text-xs uppercase tracking-[0.22em] text-[var(--c-text-faint)]">Onboard</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[var(--c-text)] sm:text-4xl">Create Account</h1>
            <p className="mt-2 text-sm leading-6 text-[var(--c-text-muted)]">
              Create your player account, choose your operating currency, and start betting from a self-service wallet.
            </p>
          </div>

        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
          {error && (
            <div className="p-3 rounded-[var(--r-sm)] bg-[var(--c-danger)] bg-opacity-20 border border-[var(--c-danger)] text-[var(--c-danger)] text-sm">
              {error}
            </div>
          )}

          <Input
            label="Username"
            type="text"
            name="username"
            value={formData.username}
            onChange={handleChange}
            placeholder="player_01"
          />

          <CountryPhoneField
            countryCode={formData.country_code}
            phoneNumber={formData.phone_number}
            onCountryCodeChange={(value) => setFormData((prev) => ({ ...prev, country_code: value }))}
            onPhoneNumberChange={(value) => setFormData((prev) => ({ ...prev, phone_number: value }))}
            helperText="Pick a country or type the international phone code first. The country and number will stay in sync."
          />
          
          <Input
            label="Email"
            type="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            required
            placeholder="you@example.com"
          />
          
          <Input
            label="Password"
            type="password"
            name="password"
            value={formData.password}
            onChange={handleChange}
            required
            placeholder="••••••••"
          />
          
          <Input
            label="Confirm Password"
            type="password"
            name="confirmPassword"
            value={formData.confirmPassword}
            onChange={handleChange}
            required
            placeholder="••••••••"
          />

          {currencies.length > 0 ? (
            <AccountCurrencySelect
              value={selectedCurrency}
              onChange={(value) => setFormData((prev) => ({ ...prev, account_currency: value }))}
              currencies={currencies}
              helperText="Choose the currency for this account. The account will operate in that currency only."
            />
          ) : null}
          
          <Button type="submit" variant="primary" className="w-full" disabled={loading}>
            {loading ? "Creating account..." : "Register"}
          </Button>
        </form>
        
        <p className="mt-4 text-center text-sm text-[var(--c-text-muted)]">
          Already have an account?{" "}
          <a href="/login" className="sb-link-hover text-[var(--c-accent)] transition-colors duration-200 hover:text-white">Login</a>
        </p>
        </Card>
      </div>
    </div>
  );
}
