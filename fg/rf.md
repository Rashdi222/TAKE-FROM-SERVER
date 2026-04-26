# AI IDE Prompt — Sixerbat Frontend 10-Phase (120-Step) Execution Plan

Role: You are a senior Next.js App Router engineer and UI architect. You build production UIs with TypeScript, Tailwind v4, React Query, and role-based routing. You prioritize correctness against backend contracts, clean state management, and a consistent design system.

Project: Sixerbat betting platform.

Repo locations:
- Backend (Phoenix): `/home/nain/sixerbat/back/`
- Frontend (Next.js): `/home/nain/sixerbat/next/`

Your task:
1. Read the files listed below for full context.
2. Produce a **10-phase frontend execution plan** with **exactly 120 implementation steps** (numbered 1–120).
3. Steps must be **UI implementation only** (pages/layouts/components/state), **NO tests**, NO migrations, NO backend edits.
4. Steps must map directly to existing backend features and the existing Next.js API clients.
5. Output format:
   - A short overview (max 10 lines)
   - Then 10 phases, each with:
     - Goal (1–2 lines)
     - Deliverables (bullets)
     - Steps (numbered, continuing global numbering to 120)

Non-goals:
- Do not propose backend changes.
- Do not propose “standardize responses” work; handle current payload shapes.
- Do not include testing tasks (unit/e2e/manual testing).

---

## Files You MUST Read (In This Order)

1. Theme + UI system:
- `/home/nain/sixerbat/theme.md`

2. Frontend engineer guide (endpoints and payload shapes):
- `/home/nain/sixerbat/fqw.md`

3. Next.js plan docs:
- `/home/nain/sixerbat/gv.md`
- `/home/nain/sixerbat/dgv.md`

4. Backend routes (source of truth):
- `/home/nain/sixerbat/back/lib/back_web/router.ex`

5. Next.js API client layer:
- `/home/nain/sixerbat/next/src/lib/api/index.ts`
- `/home/nain/sixerbat/next/src/lib/api/http.ts`
- `/home/nain/sixerbat/next/src/lib/api/errors.ts`
- `/home/nain/sixerbat/next/src/lib/api/response.ts`
- `/home/nain/sixerbat/next/src/lib/api/scopes/public.ts`
- `/home/nain/sixerbat/next/src/lib/api/scopes/user.ts`
- `/home/nain/sixerbat/next/src/lib/api/scopes/masterAdmin.ts`
- `/home/nain/sixerbat/next/src/lib/api/scopes/superAdmin.ts`

6. Next.js app shell:
- `/home/nain/sixerbat/next/src/app/layout.tsx`
- `/home/nain/sixerbat/next/src/app/globals.css`

---

## Platform Roles (Must Respect)

Public (no auth):
- Browse matches, view match details, view odds.

Player/User (auth role: `player`):
- Profile, balance, account transactions, deposits/withdrawals, bet placement, bets list/details/cancel.

Master Admin (auth role: `master_admin`):
- Dashboard, create players, list players, topup/deduct, player ledger/stats/bets report/export, transactions, reports.

Super Admin (auth role: `super_admin`):
- Everything: master admins, platform transfers/manual payment, user management/risk controls, match ops, odds workflow (generate/rewrite/orchestrate/publish), admin bet monitoring, payment methods/withdraw approvals, providers, sports-data observability, API management controls, AI/OpenRouter settings, platform reports.

---

## Hard Requirements For The Plan

### UI architecture
- Use Next.js App Router with route groups:
  - `(public)/...`
  - `(user)/...`
  - `(master)/...`
  - `(admin)/...`
- Provide role-based layout guards that call `userApi.auth.me()` and redirect on forbidden.
- Use React Query for all API reads/writes with correct invalidation keys.

### Design system
- Use the token system in `theme.md` and `globals.css`.
- Build reusable components:
  - Buttons (primary/secondary/destructive)
  - Cards, tables, tags, modals, toasts
  - Form fields with inline error display from `ApiError.fieldErrors`

### State + errors
- Treat backend shapes as-is (some endpoints return `{balance}` or `{message}`).
- Centralize error display and session clearing on auth failure.
- Always show “why” for blocked provider calls using API management event feed and provider control state.

### No testing steps
- Do not include “write tests”, “add e2e”, “manual QA”, “verify by clicking”, etc.

---

## Expected UI Surface Area (Must Cover)

Public:
- Landing, matches list with filters, match detail, odds list (read-only).

Auth:
- Login page (single for all roles), optional register (player only if used).
- Logout button.

User:
- Wallet (balance + deposit/withdraw + transactions)
- Bets (list, detail, cancel)

Master admin:
- Dashboard
- Players list + create
- Player detail: ledger, stats, bets report, report export
- Transactions list

Super admin:
- Dashboard
- Master admins: list/create/detail
- Players list + deactivate + risk controls + revoke session
- Matches: list/create/edit + lifecycle actions (start live, close, settle, cancel)
- Odds workspace per match: draft list, generate, rewrite, regenerate, orchestrate, publish/unpublish, activate/deactivate, update odds
- Bets monitoring
- Payments admin: methods config, withdrawals approvals, all transactions
- Reports: platform stats + daily/weekly/monthly + master admins overview
- Providers admin: list/upsert/activate/enable/health/sync-now + sync logs
- Sports data: events, sync logs, rejections, backfill, replay rejections
- API management: provider controls, pause/resume/reset usage, usage dashboard, event feed with pagination
- Settings: OpenRouter models, set model, set key

---

## Output Constraints
- Exactly 10 phases.
- Exactly 120 steps, numbered 1..120.
- Steps must be implementation tasks with concrete file targets (example: `next/src/app/(admin)/admin/dashboard/page.tsx`).
- Each step should be small enough to complete in 15–60 minutes for one engineer.

Now read the files and produce the plan.

