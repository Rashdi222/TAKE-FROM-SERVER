# Sixerbat Backend Execution Plan: Missing Sports, Intelligent Orchestrator, and Per-Odds Max Amount Controls

## Objective
Implement all missing backend capabilities so Super Admin can:
1. Manage and publish matches for additional sports.
2. Use a sport-specific intelligent AI orchestrator for odds generation.
3. Set max amount limits during odds generation (including in-play and over/under) so bet placement is capped by admin-defined limits.

## Scope
- Backend only (Phoenix + Ecto).
- No frontend implementation in this phase.
- API-first delivery with clear contracts for frontend integration later.

## Missing Areas To Cover
- Additional sports support: football, horse racing, dog racing.
- Sport-specific odds templates and validation rules.
- Smarter orchestration logic by sport and market type.
- Per-odds max amount controls configurable by Super Admin at generation/rewrite time.
- Enforcement of these limits during bet placement.

## Phase 1: Data Model Extensions

### 1.1 Extend sports support in matches
- Update `Match` enum to include: `:football`, `:horse_racing`, `:dog_racing`.
- Verify all match create/update flows accept these values.

### 1.2 Add per-odds stake cap fields
- Add migration to `odds` table:
  - `max_stake_amount` (decimal, nullable initially, then default strategy)
  - `max_payout_amount` (decimal, nullable; optional guardrail)
  - `limit_scope` (enum/string; e.g., `global`, `market`, `selection`) for future flexibility.
- Add indexes if filtering/reporting by these fields is needed.

### 1.3 Optional market config table (recommended)
- Create `sport_market_configs` table for reusable defaults per sport/market:
  - sport, bet_type, default_min_odds, default_max_odds
  - default_max_stake_amount, default_max_payout_amount
  - is_enabled
- This avoids hardcoding all rules in code.

## Phase 2: Domain & Validation Updates

### 2.1 Match/Odds schema updates
- Update Ecto schemas for new fields.
- Add validations:
  - `max_stake_amount > 0` when present.
  - `max_payout_amount > 0` when present.
  - `odds_value` within market/sport-specific bounds.

### 2.2 Sport-specific odds rule engine
- Introduce dedicated rules module (example):
  - `Back.AI.OddsRules` with per-sport market definitions.
- Define allowed bet types per sport:
  - cricket: `match_winner`, `over_under`, `in_play`
  - tennis: `match_winner`, `over_under`, `in_play`
  - football: `match_winner`, `over_under`, `in_play` (+ optional BTTS later)
  - horse_racing: winner/place style outcomes (no generic cricket thresholds)
  - dog_racing: winner/place style outcomes
- Validate generated odds against these sport-specific rules before insert.

## Phase 3: Intelligent AI Orchestrator Upgrade

### 3.1 Orchestrator capability expansion
- Extend current orchestrator to be sport-aware and market-aware.
- Follow-up questioning should dynamically change by sport:
  - football: ask total goals lines, draw risk profile
  - horse/dog racing: ask number of runners, favorite spread, market depth
- Add confidence/quality checks:
  - reject malformed market outputs
  - enforce implied probability sanity bounds per market

### 3.2 Multi-step workflow state model
- Keep context-token flow but add explicit state fields:
  - selected sport profile
  - selected market set
  - risk profile/hardness
  - admin instructions
  - per-market max stake overrides
- Add stop conditions:
  - missing critical fields
  - max iteration reached with deterministic fallback defaults

### 3.3 Model strategy (intelligence layer)
- Add model routing policy:
  - planning/questions model (fast/cheap)
  - pricing/generation model (stronger quality)
  - optional validation model for self-critique
- Allow Super Admin override of model while preserving policy defaults.

## Phase 4: Super Admin APIs for Limits During Generation

### 4.1 Request contract enhancements
- Update generate/regenerate/rewrite/orchestrate endpoints to accept:
  - `default_max_stake_amount`
  - `default_max_payout_amount`
  - `market_limits` array for per-market/per-selection overrides

Example shape:
- `market_limits: [{bet_type, outcome?, max_stake_amount, max_payout_amount}]`

### 4.2 Persistence behavior
- On generated odds insert:
  - assign limits from explicit market override first
  - fallback to request default limits
  - fallback to sport-market default config
- Store limits directly with each odds row so enforcement is deterministic.

### 4.3 Admin usability outputs
- API responses must return applied limits for each generated odds item.
- Include “source of limit” metadata (`override`, `request_default`, `market_default`).

## Phase 5: Bet Placement Enforcement

### 5.1 Hard enforcement in betting flow
- In `place_bet` and `place_in_play_bet`:
  - fetch selected odds
  - if `stake > odds.max_stake_amount` => reject with `:stake_limit_exceeded`
  - if computed payout exceeds `max_payout_amount` => reject with `:payout_limit_exceeded`

### 5.2 Layered limit order
Apply checks in strict order:
1. user-level lock and user max stake
2. odds-level max stake
3. odds-level max payout
4. daily exposure

### 5.3 Error handling
- Add fallback mapping for any new errors:
  - `:payout_limit_exceeded`
  - `:market_not_enabled`
  - `:sport_market_not_supported`

## Phase 6: Provider & Match Ingestion for New Sports

### 6.1 Provider mapping
- Extend provider normalization to map football/horse/dog events into unified `matches` schema.
- Add sport-specific normalization helpers for participants/outcomes.

### 6.2 Activation constraints
- Keep one active provider policy (if required by business rule).
- Ensure new sports obey same provider activation and sync visibility controls.

## Phase 7: Reporting & Audit Enhancements

### 7.1 Reporting
- Extend master-admin player reports to include:
  - sport breakdown
  - market breakdown
  - rejected bets by limit reason

### 7.2 Audit
- Log all limit-changing actions:
  - who changed limits
  - previous vs new values
  - endpoint/action and target odds IDs

## Phase 8: Testing & Verification (when coding completes)

### 8.1 Unit tests
- rules engine by sport/market
- orchestrator question loop + plan output
- limit merge precedence logic

### 8.2 Integration tests
- generate/rewrite/orchestrate with limits
- place bet success/failure across all limit combinations
- football/horse/dog match + odds lifecycle

### 8.3 Regression tests
- existing cricket/tennis behavior remains intact
- published-only visibility and draft workflow unchanged

## Suggested Implementation Order (Execution Priority)
1. Schema + migrations for sports/odds limits.
2. Rules engine and validation integration.
3. Orchestrator intelligence upgrade (sport-aware + model policy).
4. Endpoint contract upgrades for limit input.
5. Bet enforcement logic.
6. Provider normalization for new sports.
7. Reporting/audit extensions.
8. Full tests and final stabilization.

## Definition of Done
- Super Admin can create/publish matches for cricket, tennis, football, horse racing, and dog racing.
- Orchestrator asks sport-specific follow-up questions and produces validated generation plan.
- Super Admin can set max amount limits while generating/regenerating/rewrite flows.
- Every generated odds entry has effective limits persisted.
- Bet placement enforces odds-level limits reliably.
- APIs, audit logs, and reports reflect all new controls.
