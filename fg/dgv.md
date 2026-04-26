# Next.js API Clients + Types — Execution Plan (Sixerbat)

## Objective
Create a production-ready API client layer in `next/` that:
- Covers **Super Admin**, **Master Admin**, and **User** API scopes from the Phoenix router.
- Provides **typed request/response payloads** (TypeScript) for all endpoints.
- Handles **auth tokens** (access/refresh) cleanly for Next.js (server + client usage).
- Keeps the frontend future-proof even where backend payloads are not fully standardized yet.

## Inputs (Source of Truth)
- Phoenix router: `back/lib/back_web/router.ex`
- Backend payloads: controller JSON responses + `FallbackController` error shape.

## Non-Goals (for this phase)
- Building UI pages/components (only the client/types layer).
- Auto-generating types from OpenAPI (we can add later if desired).

---

## Phase 0 — Repo Setup (Next.js) + Modern Deps + Global CSS
1. Create directories:
   - `next/src/lib/api/`
   - `next/src/lib/api/scopes/`
   - `next/src/lib/api/types/`
   - `next/src/lib/auth/`
2. Add `NEXT_PUBLIC_API_BASE_URL` to `next/.env.local` template (do not commit secrets).
3. Add modern dependencies (recommended baseline):
   - `ky` (HTTP)
   - `zod` (optional runtime validation)
   - `@tanstack/react-query` (caching/state for API data)
   - `clsx` + `tailwind-merge` (class composition)
4. Update `next/src/app/globals.css` to include Sixerbat theme tokens (dark base, indigo accent, status colors), plus accessibility defaults (focus-visible, reduced motion).

---

## Phase 1 — Base HTTP Client

### 1.1 Decide transport
Use `fetch` (built-in) with:
- Abort support
- Timeout wrapper
- JSON parsing with safe error handling
- Consistent typed return shape

### 1.2 Implement core utilities
Files to add:
- `next/src/lib/api/http.ts`
- `next/src/lib/api/errors.ts`
- `next/src/lib/api/response.ts`

Key behaviors:
- `request<T>(method, path, { query, body, headers, auth }) -> Promise<T>`
- Attach `Authorization: Bearer <access_token>` when `auth: true`
- Parse backend error shapes:
  - `{error: string, ...}`
  - `{errors: Record<string, string[]>}`
- Throw a typed `ApiError` with:
  - `status`
  - `code` (optional)
  - `message`
  - `fieldErrors` (optional)
  - `raw` (optional; truncated)

### 1.3 Base URL strategy
- Use `process.env.NEXT_PUBLIC_API_BASE_URL` for browser calls.
- For server-side calls, allow overriding base URL (optional).

---

## Phase 2 — Auth Tokens (Access + Refresh)

### 2.1 Define token model
Type file:
- `next/src/lib/api/types/auth.ts`

Handle:
- `access_token`
- `refresh_token` (if issued)
- user object (if backend returns it)

### 2.2 Storage strategy (practical Next.js)
Plan:
- Store `access_token` in memory (client runtime) + optionally in `localStorage` for reload persistence.
- Store `refresh_token` in `httpOnly` cookies ideally; if backend does not support, temporarily keep in `localStorage` and document risk.

### 2.3 Implement auth helpers
Files:
- `next/src/lib/auth/tokenStore.ts` (client-only store)
- `next/src/lib/auth/session.ts` (helpers to set/clear tokens)

### 2.4 Add refresh flow
- `auth.refresh()` calls `POST /api/auth/refresh`
- If 401 during an authed request:
  - attempt refresh once
  - retry original request once
  - on failure, clear session + throw

---

## Phase 3 — Shared Domain Types

Create a minimal type model matching backend JSON payloads exactly.

Files:
- `next/src/lib/api/types/common.ts`
- `next/src/lib/api/types/users.ts`
- `next/src/lib/api/types/matches.ts`
- `next/src/lib/api/types/odds.ts`
- `next/src/lib/api/types/bets.ts`
- `next/src/lib/api/types/payments.ts`
- `next/src/lib/api/types/reports.ts`
- `next/src/lib/api/types/providers.ts`
- `next/src/lib/api/types/sportsData.ts`
- `next/src/lib/api/types/apiManagement.ts`
- `next/src/lib/api/types/settings.ts`

Rules:
- Prefer `unknown` for fields not fully clear, then tighten later.
- Use string types for UUIDs: `type UUID = string`.
- Use `ISODateTimeString = string` for timestamps.
- Model list endpoints as `{data: T[]}` and detail endpoints as `{data: T}` where backend uses `data`.
- For endpoints that return `{message: ...}` or `{access_token: ...}` today, define exact types (do not “standardize” in client unless asked).

Optional (recommended):
- Add Zod schemas alongside types later to runtime-validate payloads.

---

## Phase 4 — Scope Clients (Super Admin / Master Admin / User)

### 4.1 Create scope wrappers
Files:
- `next/src/lib/api/scopes/public.ts`
- `next/src/lib/api/scopes/user.ts`
- `next/src/lib/api/scopes/masterAdmin.ts`
- `next/src/lib/api/scopes/superAdmin.ts`

Each scope module exports functions grouped by controller domain and uses the shared `request<T>()`.

### 4.2 Map endpoints from router (explicit list)

Public (no auth):
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `GET /api/matches`
- `GET /api/matches/:id`
- `GET /api/matches/:match_id/odds`

Authed (player):
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `GET /api/user/profile`
- `GET /api/user/balance`
- `GET /api/user/transactions`
- `POST /api/payments/deposit`
- `POST /api/payments/withdraw`
- `GET /api/payments/transactions`
- `POST /api/bets/`
- `GET /api/bets/`
- `GET /api/bets/:id`
- `DELETE /api/bets/:id`

Master Admin:
- `GET /api/master-admin/dashboard`
- `POST /api/master-admin/players`
- `GET /api/master-admin/players`
- `POST /api/master-admin/players/:id/topup`
- `POST /api/master-admin/players/:id/deduct`
- `GET /api/master-admin/players/:id/ledger`
- `GET /api/master-admin/players/:id/stats`
- `GET /api/master-admin/players/:id/bets-report`
- `GET /api/master-admin/players/:id/report-export`
- `GET /api/master-admin/transactions`
- `GET /api/reports/my`
- `GET /api/reports/ledger`

Super Admin:
- `GET /api/super-admin/dashboard`
- `GET /api/super-admin/master-admins`
- `POST /api/super-admin/master-admins`
- `GET /api/super-admin/master-admins/:id`
- `POST /api/super-admin/transfer`
- `POST /api/super-admin/manual-payment`
- `GET /api/super-admin/players`
- `DELETE /api/super-admin/users/:id`
- `POST /api/super-admin/users/:id/risk-controls`
- `POST /api/super-admin/users/:id/revoke-session`
- Match ops:
  - `POST /api/super-admin/matches`
  - `PUT /api/super-admin/matches/:id`
  - `POST /api/super-admin/matches/:id/start-live`
  - `POST /api/super-admin/matches/:id/close`
  - `POST /api/super-admin/matches/:id/settle`
  - `POST /api/super-admin/matches/:id/cancel`
- Odds ops:
  - `POST /api/super-admin/matches/:match_id/odds`
  - `GET /api/super-admin/matches/:match_id/odds`
  - `POST /api/super-admin/matches/:match_id/odds/generate`
  - `POST /api/super-admin/matches/:id/odds/publish`
  - `POST /api/super-admin/matches/:id/odds/unpublish`
  - `POST /api/super-admin/matches/:id/odds/regenerate`
  - `POST /api/super-admin/matches/:id/odds/rewrite`
  - `POST /api/super-admin/matches/:id/odds/orchestrate`
  - `PUT /api/super-admin/odds/:id`
  - `POST /api/super-admin/odds/:id/activate`
  - `POST /api/super-admin/odds/:id/deactivate`
- Admin bet monitoring:
  - `GET /api/super-admin/bets`
- Payment method management:
  - `GET /api/super-admin/payments/methods`
  - `POST /api/super-admin/payments/methods/configure`
  - `POST /api/super-admin/payments/methods/:id/activate`
  - `POST /api/super-admin/payments/methods/:id/deactivate`
  - `POST /api/super-admin/payments/withdrawals/:id/approve`
  - `GET /api/super-admin/payments/transactions`
- Reports:
  - `GET /api/super-admin/reports/stats`
  - `GET /api/super-admin/reports/daily`
  - `GET /api/super-admin/reports/weekly`
  - `GET /api/super-admin/reports/monthly`
  - `GET /api/super-admin/reports/master-admins`
- Providers and sports data:
  - `GET /api/super-admin/providers`
  - `POST /api/super-admin/providers`
  - `POST /api/super-admin/providers/:id/activate`
  - `POST /api/super-admin/providers/:id/enable`
  - `GET /api/super-admin/providers/health`
  - `POST /api/super-admin/providers/sync-now`
  - `GET /api/super-admin/providers/sync-logs`
  - `GET /api/super-admin/sports-data/events`
  - `GET /api/super-admin/sports-data/sync-logs`
  - `GET /api/super-admin/sports-data/rejections`
  - `POST /api/super-admin/sports-data/backfill`
  - `POST /api/super-admin/sports-data/replay-rejections`
- API management:
  - `GET /api/super-admin/api-management/providers`
  - `GET /api/super-admin/api-management/providers/:provider_key`
  - `PUT /api/super-admin/api-management/providers/:provider_key`
  - `POST /api/super-admin/api-management/providers/:provider_key/pause`
  - `POST /api/super-admin/api-management/providers/:provider_key/resume`
  - `POST /api/super-admin/api-management/providers/:provider_key/reset-usage`
  - `GET /api/super-admin/api-management/usage`
  - `GET /api/super-admin/api-management/events`
- Settings:
  - `GET /api/super-admin/settings/openrouter/models`
  - `POST /api/super-admin/settings/openrouter/model`
  - `POST /api/super-admin/settings/openrouter/key`

---

## Phase 5 — Developer Ergonomics (Call Signatures)

### 5.1 Typed function signatures
Example convention:
- `superAdmin.matches.create(input): Promise<{data: Match}>`
- `user.bets.create(input): Promise<{data: Bet}>`

### 5.2 Query parameter helpers
Add `buildQuery()` helper to keep filters typed and avoid stringly-typed URLs.

### 5.3 Consistent naming
- Use camelCase in TS methods.
- Preserve backend field names in payloads (do not rename keys).

---

## Phase 6 — Minimal Integration Points (No UI)

1. Add a small `next/src/lib/api/index.ts` that exports:
   - `publicApi`, `userApi`, `masterAdminApi`, `superAdminApi`
2. Provide example usage snippets in `next/README.md` (optional).

---

## Phase 7 — Verification Checklist (Manual)
- Confirm every router endpoint has a matching client function.
- Confirm every function returns the correct typed shape for that endpoint today.
- Confirm auth retry/refresh does not infinite-loop.
- Confirm errors from `FallbackController` surface as `ApiError` with `status` and `message`.

---

## Deliverables
- `next/src/lib/api/*` (HTTP client, errors, response typing)
- `next/src/lib/api/types/*` (domain types)
- `next/src/lib/api/scopes/*` (role-based clients)
- `dgv.md` (this plan)
