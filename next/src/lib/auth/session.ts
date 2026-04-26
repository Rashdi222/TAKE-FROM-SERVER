import { clearTokensClient, getAccessTokenClient, getRefreshTokenClient, setTokensClient } from "./tokenStore";

export function getAccessToken() {
  if (typeof window === "undefined") return null;
  return getAccessTokenClient();
}

export function getRefreshToken() {
  if (typeof window === "undefined") return null;
  return getRefreshTokenClient();
}

export function setSession(opts: { accessToken: string; refreshToken?: string | null }) {
  if (typeof window === "undefined") return;
  setTokensClient({ accessToken: opts.accessToken, refreshToken: opts.refreshToken ?? null });
}

export function clearSession() {
  if (typeof window === "undefined") return;
  clearTokensClient();
}

