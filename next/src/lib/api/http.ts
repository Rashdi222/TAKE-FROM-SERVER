import ky, { type KyInstance, type Options } from "ky";
import { ApiError, type ApiFieldErrors } from "./errors";
import { getAccessToken, getRefreshToken, setSession, clearSession } from "../auth/session";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type RequestOptions = {
  auth?: boolean;
  query?: QueryParams;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

export type QueryParams = Record<string, string | number | boolean | null | undefined>;

function getBaseUrl() {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (base) return base.replace(/\/+$/, "");

  if (typeof window !== "undefined") {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:4000`;
  }

  return "http://127.0.0.1:4000";
}

function buildSearchParams(query: RequestOptions["query"]) {
  const params = new URLSearchParams();
  if (!query) return params;

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    params.set(key, String(value));
  }

  return params;
}

function parseMaybeJson(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractErrorPayload(payload: unknown): { message: string; fieldErrors?: ApiFieldErrors } {
  if (typeof payload === "string") {
    const trimmed = payload.trim();

    if (!trimmed) {
      return { message: "request failed" };
    }

    if (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html")) {
      return { message: "server request failed" };
    }

    return { message: trimmed };
  }

  if (payload && typeof payload === "object") {
    const anyPayload = payload as Record<string, unknown>;

    if (typeof anyPayload.error === "string") {
      return { message: anyPayload.error };
    }

    if (typeof anyPayload.message === "string") {
      return { message: anyPayload.message };
    }

    if (anyPayload.errors && typeof anyPayload.errors === "object") {
      return { message: "validation error", fieldErrors: anyPayload.errors as ApiFieldErrors };
    }
  }

  return { message: "request failed" };
}

function createClient(): KyInstance {
  const baseUrl = getBaseUrl();

  return ky.create({
    prefixUrl: baseUrl ? baseUrl.replace(/^\//, "") : undefined,
    timeout: 30_000,
    hooks: {
      beforeRequest: [
        (request) => {
          // No-op; auth header is injected per-call.
          return request;
        },
      ],
    },
  });
}

const client = createClient();

async function doRequest<T>(method: HttpMethod, path: string, opts: RequestOptions): Promise<T> {
  const search = buildSearchParams(opts.query);
  const normalizedPath = path.replace(/^\/+/, "");
  const url = search.toString() ? `${normalizedPath}?${search.toString()}` : normalizedPath;

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(opts.headers ?? {}),
  };

  if (opts.auth) {
    const token = getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const kyOpts: Options = {
    method,
    headers,
    signal: opts.signal,
  };

  if (opts.body !== undefined) {
    if (typeof FormData !== "undefined" && opts.body instanceof FormData) {
      delete headers["Content-Type"];
      kyOpts.body = opts.body;
    } else {
      kyOpts.json = opts.body;
    }
  }

  try {
    return (await client(url, kyOpts).json()) as T;
  } catch (err: unknown) {
    // ky throws HTTPError (response available) or TimeoutError etc. We normalize.
    const anyErr = err as { response?: Response };

    if (anyErr?.response instanceof Response) {
      const res = anyErr.response;
      const text = await res.text().catch(() => "");
      const payload = parseMaybeJson(text);
      const { message, fieldErrors } = extractErrorPayload(payload);
      throw new ApiError(message, { status: res.status, fieldErrors, raw: payload });
    }

    throw new ApiError("network error", { status: 0, raw: err });
  }
}

async function refreshOnce(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  // Backend expects POST /api/auth/refresh with refresh token. If backend differs, adjust here.
  try {
    const result = await doRequest<{ access_token: string }>(
      "POST",
      "/api/auth/refresh",
      { auth: false, body: { refresh_token: refreshToken } }
    );
    setSession({ accessToken: result.access_token, refreshToken });
    return true;
  } catch {
    clearSession();
    return false;
  }
}

export async function request<T>(method: HttpMethod, path: string, opts: RequestOptions = {}): Promise<T> {
  try {
    return await doRequest<T>(method, path, opts);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401 && opts.auth) {
      const ok = await refreshOnce();
      if (ok) return await doRequest<T>(method, path, opts);
    }
    throw err;
  }
}
