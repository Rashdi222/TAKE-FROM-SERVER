# Sixerbat Frontend Implementation Guide (Next.js)

This guide tells the frontend team exactly how to build UI against the current Phoenix backend and the Next.js API client layer.

## Source Of Truth
- Backend routes: `back/lib/back_web/router.ex`
- API clients: `next/src/lib/api/index.ts` and `next/src/lib/api/scopes/*`
- Error payloads: `back/lib/back_web/controllers/fallback_controller.ex`

## What Is Already Implemented For Frontend

### 1) API Clients (Role Scopes)
All UI-relevant API routes are implemented as typed client functions:
- Public: `next/src/lib/api/scopes/public.ts` (`publicApi`)
- User/player: `next/src/lib/api/scopes/user.ts` (`userApi`)
- Master admin: `next/src/lib/api/scopes/masterAdmin.ts` (`masterAdminApi`)
- Super admin: `next/src/lib/api/scopes/superAdmin.ts` (`superAdminApi`)

Excluded on purpose (not frontend-driven):
- `POST /api/payments/easypaisa/callback` (IPN callback)
- `POST /webhooks/goalserve` (provider webhook)

### 2) HTTP + Auth Handling
- Base client: `next/src/lib/api/http.ts`
- Access token is automatically attached for `{auth: true}` calls.
- On `401`, the client attempts exactly 1 refresh via `POST /api/auth/refresh` and retries once.
- Token persistence uses `localStorage` and auto-hydrates in browser on import:
  - `next/src/lib/auth/tokenStore.ts`
  - `next/src/lib/auth/session.ts`

### 3) React Query Provider
React Query is wired at app root:
- `next/src/lib/query/QueryProvider.tsx`
- Used in `next/src/app/layout.tsx`

## Environment Setup
- Set `NEXT_PUBLIC_API_BASE_URL` in `next/.env.local` (example: `http://localhost:4000`).
- Backend must allow CORS for the Next dev server origin (already uses `CORSPlug`).

## API Response Shapes (Important)
Backend is mostly consistent but not fully standardized yet. Frontend must handle these shapes:

### Common success shapes
- Many endpoints return:
  - `{ "data": ... }`
  - `{ "data": [ ... ] }`

### Exceptions (do not assume `data`)
- `GET /api/user/balance` returns `{ "balance": number }`
- Auth endpoints:
  - `POST /api/auth/login` returns `{ user, access_token, refresh_token }`
  - `POST /api/auth/register` returns `{ user, access_token, refresh_token }`
  - `POST /api/auth/refresh` returns `{ access_token }`
  - `POST /api/auth/logout` returns `{ message: "logged out" }`
  - `GET /api/auth/me` returns `{ user }`

### Error shapes
Frontend must handle:
- `{ "error": "message" }`
- `{ "errors": { "field": ["msg"] } }` (Ecto validation)

Client normalizes errors into `ApiError`:
- file: `next/src/lib/api/errors.ts`
- fields: `status`, `message`, optional `fieldErrors`

## Role-Based UI Map (What Pages To Build)

### Public (no login)
Use `publicApi`:
- Matches listing + filters:
  - `publicApi.matches.list({ sport, status })` -> `GET /api/matches`
- Match details:
  - `publicApi.matches.get(matchId)` -> `GET /api/matches/:id`
- Odds for match (public published odds):
  - `publicApi.matches.odds(matchId)` -> `GET /api/matches/:match_id/odds`

Suggested pages:
- `/` Landing
- `/matches` Browse matches
- `/matches/[id]` Match details + odds (read-only)

### User / Player
Use `userApi`:
- Profile:
  - `userApi.profile.get()` -> `{data: {...}}`
- Balance:
  - `userApi.profile.balance()` -> `{balance: number}`
- Account transactions (ledger):
  - `userApi.profile.transactions()` -> `{data: Transaction[]}`
- Payments:
  - `userApi.payments.deposit(...)`
  - `userApi.payments.withdraw(...)`
  - `userApi.payments.transactions()`
- Bets:
  - `userApi.bets.create({match_id, odds_id, stake, in_play?})`
  - `userApi.bets.list({optional filters later})`
  - `userApi.bets.get(id)`
  - `userApi.bets.cancel(id)`

Suggested pages:
- `/user/profile`
- `/user/wallet` (balance + deposit/withdraw + payment tx list)
- `/user/bets` (active + history)

### Master Admin (manages their own players)
Use `masterAdminApi`:
- Dashboard:
  - `masterAdminApi.dashboard()`
- Player management:
  - create: `masterAdminApi.players.create(...)`
  - list: `masterAdminApi.players.list()`
  - topup: `masterAdminApi.players.topup(playerId, { amount, note? })`
  - deduct: `masterAdminApi.players.deduct(playerId, { amount, note? })`
  - ledger/stats/reports:
    - `ledger`, `stats`, `betsReport`, `reportExport`
- Transactions:
  - `masterAdminApi.transactions()`
- Reports:
  - `masterAdminApi.reports.my()`
  - `masterAdminApi.reports.ledger()`

Suggested pages:
- `/master/dashboard`
- `/master/players`
- `/master/players/[id]` (ledger, stats, bets report, export)
- `/master/transactions`

### Super Admin (controls platform)
Use `superAdminApi`:
- Dashboard + master admins:
  - list/create/get master admins
- Money operations:
  - transfer/manual-payment
- Users:
  - list players, deactivate, risk controls, revoke sessions
- Match ops:
  - create/update/start-live/close/settle/cancel
- Odds ops (AI + publish workflow):
  - create/list/generate/publish/unpublish/regenerate/rewrite/orchestrate/update/activate/deactivate
- Admin bet monitoring:
  - `superAdminApi.bets.adminIndex({status, match_id?})`
- Payment methods + withdrawals approvals + all transactions
- Reports (platform stats + daily/weekly/monthly + master-admin overview)
- Provider management + sports data observability
- API management controls (rate limits/pause/resume/events)
- OpenRouter settings (models/key)

Suggested pages:
- `/admin/dashboard`
- `/admin/matches` + `/admin/matches/[id]`
- `/admin/matches/[id]/odds` (draft/publish workflow + rewrite/regenerate)
- `/admin/bets`
- `/admin/payments` (methods + withdrawals + tx)
- `/admin/reports`
- `/admin/providers` + `/admin/providers/health`
- `/admin/api-management`
- `/admin/settings/ai`

## Auth UI Guidance (Login + Route Guard)

### Login flow
1. Call `publicApi.auth.login({email, password})`
2. Store tokens:
   - call `setSession({ accessToken, refreshToken })` from `next/src/lib/auth/session.ts`
3. Redirect based on `user.role`:
   - `super_admin` -> `/admin/dashboard`
   - `master_admin` -> `/master/dashboard`
   - `player` -> `/matches` or `/user/profile`

### Guarding pages
Do not hardcode roles in components only; enforce at routing/layout level:
- Create role layouts later (`/admin/*`, `/master/*`) that check `me()` and redirect if forbidden.
- Backend will also enforce access (403) via plugs.

## How To Use With React Query
Use `useQuery` for GET and `useMutation` for POST/PUT/DELETE.

Recommended pattern:
- Query keys:
  - `["matches", {sport, status}]`
  - `["match", matchId]`
  - `["odds", matchId]`
  - `["bets", {status}]`
  - `["admin", "api-management", "providers"]`
- Invalidate after mutations:
  - Creating odds -> invalidate `["odds", matchId]`
  - Publishing odds -> invalidate public match odds + admin odds list

## Operational Notes (Admin UIs)
- API management endpoints are designed for “polling dashboards”:
  - `superAdminApi.apiManagement.providers()` for list + usage snapshot
  - `superAdminApi.apiManagement.events({ provider_key, event_type, page, page_size })` for event feed with pagination meta
- Workers may skip calls when blocked/paused; the UI should show “paused/blocked” state using provider control fields (`paused_until`, `enabled`) and event feed reasons.

## Where To Find Types
- Exported from `next/src/lib/api/index.ts`
- Primary useful types:
  - `AuthTokenResponse`, `RefreshResponse`
  - `Match`
  - `Bet`
  - `ProviderControl`, `UsageSnapshot`, `ProviderEvent`

## Known Gaps (Not Blockers)
- Many request bodies are typed as `Record<string, unknown>` to avoid guessing fields. Tighten as the UI gets built and backend payloads are confirmed per endpoint.
- Response contracts are not fully standardized (some endpoints return `{balance}` or `{message}`), so UI must use the correct per-endpoint shape.

