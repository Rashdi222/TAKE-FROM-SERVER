export type OpenRouterModel = {
  id?: string;
  name?: string;
  canonical_slug?: string;
  description?: string | null;
  pricing?: Record<string, unknown> | null;
  context_length?: number | null;
  architecture?: Record<string, unknown> | null;
  [k: string]: unknown;
};

export type OpenRouterModelsResponse = { data: OpenRouterModel[]; cached_at?: string | null };

export type AccountCurrency = {
  code: "PKR" | "BDT" | "INR" | "USD" | "USDT";
  name: string;
  symbol: string;
  flag: string;
  kind: "fiat" | "crypto";
  enabled?: boolean;
};

export type AccountCurrenciesResponse = {
  data: AccountCurrency[];
};

export type LandingWhatsappSettings = {
  enabled: boolean;
  channel: "whatsapp";
  label?: string | null;
  phone_number?: string | null;
  message?: string | null;
};

export type LandingWhatsappSettingsResponse = {
  data: LandingWhatsappSettings;
};
