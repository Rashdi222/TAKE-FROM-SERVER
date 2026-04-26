# Sixerbat Backend Gap Execution Plan (English)

## Purpose
This document lists what is still missing from backend features and defines a professional execution plan before implementation.

---

## Current Backend Status (Summary)
Already implemented:
- Auth, roles, balance, transactions, betting, settlement
- Match + odds CRUD
- AI odds generation endpoint
- Payments (deposit/withdraw flow + callback endpoint)
- Reports
- Provider system (single active provider, adapters, fetch worker, settings endpoints)

Not fully implemented:
- AI odds draft/publish/rewrite/version lifecycle
- Master Admin member lifecycle (username/phone, top-up, deduction, member withdrawal handling)
- Provider observability/operations (health, sync logs, manual sync control)
- Full admin-grade audit + risk controls

---

## Scope of Missing Work

### A) AI Odds Workflow (Not fully implemented)
Need:
1. Draft odds per match (not visible to user side until published)
2. Publish/unpublish odds per match
3. Regenerate odds with versioning
4. Admin comment-based rewrite flow
5. Approval history and who approved/published

### B) Master Admin User Management (Partially missing)
Need:
1. Member fields: `username`, `phone_number`
2. Master admin can create member with initial amount
3. Master admin can top-up member later
4. Master admin can deduct/withdraw member balance later
5. Master admin member ledger and per-member stats

### C) Provider Ops + Control Plane (Partially missing)
Need:
1. Provider health endpoint
2. Manual sync trigger endpoint
3. Last sync status + error logs
4. Retry/backoff status visibility
5. Optional fallback plan (if active provider fails)

### D) Platform Governance (Missing)
Need:
1. Admin action audit log (who changed what)
2. Risk controls: betting limits, lock flags, throttles
3. Force-disable users and session revoke tools
4. Better operational metrics endpoints

---

## Execution Plan (Backend Only)

## Phase 1: Data Model Upgrades
Tasks:
1. Add migration for member fields in users table:
   - `username` (unique, nullable for old users)
   - `phone_number` (nullable)
2. Add migration for odds publishing workflow:
   - `odds.visibility_status` (`draft | published | archived`)
   - `odds.version_no` (integer)
   - `odds.admin_note` (text)
   - `odds.published_by_id` (fk users)
   - `odds.published_at` (utc_datetime)
3. Add migration for provider sync log table:
   - `provider_sync_logs` (provider_id, sync_type, status, error, duration_ms, inserted_at)
4. Add migration for admin audit logs:
   - `admin_audit_logs` (actor_id, action, target_type, target_id, payload jsonb, inserted_at)

Deliverables:
- Migrations + schema updates complete

## Phase 2: Master Admin Member Lifecycle APIs
Tasks:
1. Extend create-member API payload to accept `username`, `phone_number`
2. Add endpoint: `POST /api/master-admin/players/:id/topup`
3. Add endpoint: `POST /api/master-admin/players/:id/deduct`
4. Add endpoint: `GET /api/master-admin/players/:id/ledger`
5. Add endpoint: `GET /api/master-admin/players/:id/stats`
6. Authorization: master admin can only operate on own players
7. Record all top-up/deduct actions in transactions + admin audit logs

Deliverables:
- Full member lifecycle control for master admins

## Phase 3: AI Odds Draft/Publish/Regen Workflow
Tasks:
1. Generate odds into `draft` by default
2. Add endpoint: `POST /api/super-admin/matches/:id/odds/publish`
3. Add endpoint: `POST /api/super-admin/matches/:id/odds/unpublish`
4. Add endpoint: `POST /api/super-admin/matches/:id/odds/regenerate`
5. Add endpoint: `POST /api/super-admin/matches/:id/odds/rewrite`
   - Payload: note/comment
   - Uses comment in prompt + increments version
6. User-side odds list should return only `published` odds

Deliverables:
- Controlled odds release pipeline with versioning

## Phase 4: Provider Operational Control
Tasks:
1. Add endpoint: `GET /api/super-admin/providers/health`
2. Add endpoint: `POST /api/super-admin/providers/sync-now`
3. Add endpoint: `GET /api/super-admin/providers/sync-logs`
4. Add status in response:
   - active provider
   - last success time
   - last error
   - average fetch duration
5. Worker writes sync results into `provider_sync_logs`

Deliverables:
- Observable and operable provider layer

## Phase 5: Governance + Risk Controls
Tasks:
1. Add per-user betting limits:
   - max stake per bet
   - daily max exposure
2. Add user lock flags for betting/payment actions
3. Add admin session revoke endpoint
4. Enforce controls in betting/payment contexts
5. Log all sensitive actions to `admin_audit_logs`

Deliverables:
- Strong platform control for super admin

## Phase 6: Tests + Hardening
Tasks:
1. Unit tests for new contexts
2. Controller tests for all new endpoints
3. Authorization tests (cross-tenant blocking)
4. Edge-case tests (insufficient balance, locked user, unpublished odds)
5. Final integration test pass

Deliverables:
- Reliable backend behavior with test coverage

---

## API TODO Checklist

### Super Admin TODO
- [ ] Publish/unpublish odds workflow
- [ ] Regenerate odds with version history
- [ ] Rewrite odds from admin note/comment
- [ ] Provider health endpoint
- [ ] Manual provider sync endpoint
- [ ] Provider sync logs endpoint
- [ ] Admin audit log viewer endpoint
- [ ] User lock/revoke session controls
- [ ] Betting risk limits management

### Master Admin TODO
- [ ] Create member with username + phone
- [ ] Top-up member balance endpoint
- [ ] Deduct/withdraw member balance endpoint
- [ ] Member ledger endpoint
- [ ] Member stats endpoint

### User Side TODO (Backend)
- [ ] Ensure only published odds are returned
- [ ] Include odds version metadata (read-only)
- [ ] Better error messages for restricted/locked actions

### System TODO
- [ ] Provider sync log table + write path
- [ ] Admin audit log table + write path
- [ ] Security checks + authorization hardening
- [ ] Full test suite for new modules

---

## Suggested Implementation Order (Practical)
1. Phase 1 (migrations)
2. Phase 2 (master admin user lifecycle)
3. Phase 3 (AI odds workflow)
4. Phase 4 (provider ops)
5. Phase 5 (governance/risk)
6. Phase 6 (tests + final verification)

---

## Important Rule for This Project
Per your instruction: do not run compile/migrations/tests until all backend tasks in the approved scope are implemented.
