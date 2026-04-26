import type { UUID } from "../response";

export type LoginRequest = { email: string; password: string };
export type RegisterRequest = {
  email: string;
  username?: string | null;
  phone_number?: string | null;
  country_code?: string | null;
  password: string;
  account_currency: "PKR" | "BDT" | "INR" | "USD" | "USDT";
  role?: "player" | "master_admin" | "super_admin";
};

export type AuthUser = {
  id: UUID;
  email: string;
  username?: string | null;
  phone_number?: string | null;
  country_code?: string | null;
  role: string;
  account_currency?: string;
  wallet_mode?: "self_service" | "managed_by_master_admin";
  balance?: number | string;
  is_active?: boolean;
};

// Backend login/register return {user, access_token, refresh_token}
export type AuthTokenResponse = {
  user: AuthUser;
  access_token: string;
  refresh_token: string;
};

export type RefreshRequest = { refresh_token: string };
// Backend refresh returns {access_token}
export type RefreshResponse = { access_token: string };

export type MeResponse = {
  user: {
    id: UUID;
    email: string;
    username?: string | null;
    phone_number?: string | null;
    country_code?: string | null;
    role: string;
    account_currency?: string;
    wallet_mode?: "self_service" | "managed_by_master_admin";
  };
};

export type UserProfile = {
  id: UUID;
  email: string;
  username?: string | null;
  phone_number?: string | null;
  country_code?: string | null;
  role: string;
  account_currency?: string;
  wallet_mode?: "self_service" | "managed_by_master_admin";
  balance?: number | string;
  is_active?: boolean;
  inserted_at?: string;
};

export type ResetPasswordValidateResponse = {
  user_id: UUID;
  expires_at: string;
  purpose: string;
};

export type ResetPasswordRequest = {
  token: string;
  password: string;
  password_confirmation: string;
};
