# Next.js API Clients + Types + Modern Frontend Setup — Execution Plan (Sixerbat)

This is the consolidated plan that includes:
- Modern Next.js dependencies to support a typed API layer
- Global theme CSS (`globals.css`) foundation
- Typed API clients for Super Admin / Master Admin / User scopes

Source of truth for endpoints: `back/lib/back_web/router.ex`.

---

## Phase 0 — Dependencies + Baseline Setup

### 0.1 Add modern dependencies (Next.js app)
Update `next/package.json`:
- HTTP client: `ky`
- Runtime validation (optional but recommended): `zod`
- Data fetching/caching: `@tanstack/react-query` (+ devtools in dev)
- Utility: `clsx`, `tailwind-merge`

Notes:
- Do not introduce axios unless needed; `fetch` + `ky` is enough.
- Keep deps minimal; add more only when UI needs them.

### 0.2 Global CSS theme setup
Update `next/src/app/globals.css`:
- Define Sixerbat theme tokens (dark base + indigo accent + status colors).
- Keep Tailwind v4 `@import "tailwindcss";`.
- Add base body background (radial glows) and accessibility defaults (focus ring, reduced-motion).

### 0.3 Environment variables
Add `.env.local` (not committed) keys:
- `NEXT_PUBLIC_API_BASE_URL=http://localhost:4000` (example)

---

## Phase 1 — Base HTTP Client (Typed)

Create `next/src/lib/api/`:
- `http.ts`: `request<T>()` wrapper (method, path, query, body, headers, auth)
- `errors.ts`: `ApiError` model + helpers
- `response.ts`: helper types for `{data}` and error shapes

Behavior:
- Always parse JSON; throw `ApiError` with status + message.
- Attach `Authorization: Bearer <token>` when needed.
- One refresh+retry attempt on 401 (configurable).

---

## Phase 2 — Auth Session Handling

Create `next/src/lib/auth/`:
- `tokenStore.ts`: client token memory/localStorage
- `session.ts`: `setSession()`, `clearSession()`, `getAccessToken()`

Map backend endpoints:
- `POST /api/auth/login`
- `POST /api/auth/register`
- `POST /api/auth/refresh`
- `GET /api/auth/me`
- `POST /api/auth/logout`

---

## Phase 3 — Types (TS) Matching Backend Payloads

Create `next/src/lib/api/types/*`:
- `auth.ts`, `users.ts`, `matches.ts`, `odds.ts`, `bets.ts`, `payments.ts`, `reports.ts`, `providers.ts`, `sportsData.ts`, `apiManagement.ts`, `settings.ts`

Rules:
- Mirror backend JSON keys (no renaming).
- Use `type UUID = string`, `type ISODateTimeString = string`.
- For endpoints that do not wrap in `data` (auth/settings), type them exactly as-is.

---

## Phase 4 — Scope Clients (Role-Based)

Create `next/src/lib/api/scopes/`:
- `public.ts`
- `user.ts`
- `masterAdmin.ts`
- `superAdmin.ts`

Each scope exports grouped functions per domain (matches, odds, bets, payments, reports, providers, sports data, api management, settings).

All functions call the shared `request<T>()`.

---

## Phase 5 — Coverage + Manual Verification
- Confirm every route in `back/lib/back_web/router.ex` has a client function.
- Confirm query params supported (filters, pagination).
- Confirm error parsing matches `FallbackController` `{error}` and `{errors}`.
- Confirm refresh retry cannot loop.

---

## Deliverables
- Modern deps added in `next/package.json`
- Theme baseline in `next/src/app/globals.css`
- API client layer in `next/src/lib/api/*`
- Role-based clients in `next/src/lib/api/scopes/*`
- Types in `next/src/lib/api/types/*`
- This plan file `gv.md`

