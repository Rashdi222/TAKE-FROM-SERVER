"use client";

import { useMemo } from "react";
import { ChevronDown, Globe2, Phone } from "lucide-react";
import { COUNTRIES, inferCountryFromPhone, sanitizePhoneNumberInput, syncPhoneWithCountry } from "@/lib/geo/countries";

type CountryPhoneFieldProps = {
  label?: string;
  countryCode: string;
  phoneNumber: string;
  onCountryCodeChange: (value: string) => void;
  onPhoneNumberChange: (value: string) => void;
  helperText?: string;
  required?: boolean;
};

export function CountryPhoneField({
  label = "Country & Phone Number",
  countryCode,
  phoneNumber,
  onCountryCodeChange,
  onPhoneNumberChange,
  helperText,
  required,
}: CountryPhoneFieldProps) {
  const selectedCountry = useMemo(
    () => COUNTRIES.find((country) => country.code === countryCode) ?? null,
    [countryCode],
  );

  const handleCountryChange = (nextCountryCode: string) => {
    const nextPhone = syncPhoneWithCountry(phoneNumber, nextCountryCode, countryCode);
    onCountryCodeChange(nextCountryCode);
    onPhoneNumberChange(nextPhone);
  };

  const handlePhoneChange = (value: string) => {
    const sanitized = sanitizePhoneNumberInput(value);
    onPhoneNumberChange(sanitized);

    const inferredCountry = inferCountryFromPhone(sanitized);
    if (inferredCountry && inferredCountry.code !== countryCode) {
      onCountryCodeChange(inferredCountry.code);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <label className="flex items-center gap-2 text-sm font-medium tracking-[0.01em] text-[var(--c-text)]">
        <Globe2 className="h-4 w-4 text-[var(--c-accent)]" />
        {label}
      </label>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,248px)_1fr]">
        <div className="group relative">
          <div className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-[var(--c-accent)] transition-transform duration-200 group-focus-within:scale-110">
            <Globe2 className="h-4 w-4" />
          </div>
          <select
            value={countryCode}
            onChange={(e) => handleCountryChange(e.target.value)}
            required={required}
            className="w-full appearance-none rounded-[1rem] border border-[var(--c-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.015))] bg-[var(--c-surface-1)] py-3 pl-11 pr-11 text-[15px] text-[var(--c-text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_14px_36px_rgba(0,0,0,0.12)] transition-all duration-200 focus:outline-none focus:border-[var(--c-accent)] focus:ring-2 focus:ring-[rgba(99,32,232,0.22)] group-hover:border-[rgba(161,121,241,0.38)]"
          >
            <option value="">Select country</option>
            {COUNTRIES.map((country) => (
              <option key={country.code} value={country.code}>
                {country.name} ({country.dialCode})
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[var(--c-text-faint)] transition-transform duration-200 group-focus-within:translate-y-[-55%]">
            <ChevronDown className="h-4 w-4" />
          </div>
        </div>

        <div className="group relative">
          <div className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-[var(--c-accent)] transition-transform duration-200 group-focus-within:scale-110">
            <Phone className="h-4 w-4" />
          </div>
          <input
            type="tel"
            value={phoneNumber}
            onChange={(e) => handlePhoneChange(e.target.value)}
            required={required}
            placeholder={selectedCountry ? `${selectedCountry.dialCode}...` : "+923001234567"}
            className="w-full rounded-[1rem] border border-[var(--c-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.015))] bg-[var(--c-surface-1)] py-3 pl-11 pr-4 text-[15px] text-[var(--c-text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_14px_36px_rgba(0,0,0,0.12)] placeholder:text-[var(--c-text-faint)] transition-all duration-200 focus:outline-none focus:border-[var(--c-accent)] focus:ring-2 focus:ring-[rgba(99,32,232,0.22)] group-hover:border-[rgba(161,121,241,0.38)]"
          />
        </div>
      </div>

      <span className="rounded-[0.9rem] border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.025)] px-3 py-2 text-xs leading-5 text-[var(--c-text-faint)]">
        {helperText ?? "Choose a country or type an international phone code first. The other field will sync automatically when the prefix is clear."}
      </span>
    </div>
  );
}
