"use client";

type TokenState = {
  accessToken: string | null;
  refreshToken: string | null;
};

const ACCESS_KEY = "sixerbat_access_token";
const REFRESH_KEY = "sixerbat_refresh_token";

let state: TokenState = { accessToken: null, refreshToken: null };

function safeGet(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

export function hydrateTokensFromStorage() {
  state = {
    accessToken: safeGet(ACCESS_KEY),
    refreshToken: safeGet(REFRESH_KEY),
  };
}

// Auto-hydrate on first import in the browser so calls work after reload
// without requiring the app to explicitly call hydrate.
if (typeof window !== "undefined") {
  hydrateTokensFromStorage();
}

export function getAccessTokenClient() {
  return state.accessToken;
}

export function getRefreshTokenClient() {
  return state.refreshToken;
}

export function setTokensClient(tokens: Partial<TokenState>) {
  if (tokens.accessToken !== undefined) {
    state.accessToken = tokens.accessToken;
    safeSet(ACCESS_KEY, tokens.accessToken);
  }

  if (tokens.refreshToken !== undefined) {
    state.refreshToken = tokens.refreshToken;
    safeSet(REFRESH_KEY, tokens.refreshToken);
  }
}

export function clearTokensClient() {
  state = { accessToken: null, refreshToken: null };
  safeSet(ACCESS_KEY, null);
  safeSet(REFRESH_KEY, null);
}
