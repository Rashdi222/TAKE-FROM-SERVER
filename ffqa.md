# Full Framework Quality Assurance

## Objective
This document audits the live match architecture across backend pricing/state, frontend live stores, sportsbook panel routing, and live-command-center UX. The goal is to harden the platform against live-sport chaos without breaking the current dual-lane model:

- Fast lane: live odds, live scores, live point/state deltas
- Slow lane: enriched context such as events, statistics, lineups, standings, venue, H2H

This is provider-agnostic in principle, but grounded in the current implementation for:
- Football: API-Sports
- Tennis: API Tennis / tennis live websocket path
- Cricket: SportsMonks

---

## Audit Findings

### 1. What Is Currently Working

#### Live odds/state transport
- Match-level realtime transport exists through [back/lib/back_web/channels/match_channel.ex](/home/nain/sixerbat/back/lib/back_web/channels/match_channel.ex).
- The channel already broadcasts:
  - `match_state_updated`
  - `odds_updated`
  - `market_suspended`
  - `market_resumed`
- The frontend has a dedicated store abstraction in [next/src/lib/live/matchLiveStore.ts](/home/nain/sixerbat/next/src/lib/live/matchLiveStore.ts).
- The store already separates:
  - `match`
  - `oddsById`
  - `marketGroups`
  - `marketSuspended`
  - `suspendedMarkets`
  - connection state

#### Render isolation is materially in place
- `useLiveMatchStoreSelector` caches selector results before returning them via `useSyncExternalStore`, which is the correct anti-loop boundary for this architecture.
- This materially reduces unnecessary re-renders when odds move but the match object itself has not changed.
- Heavy command-center HUDs are already split from the market boards:
  - football live HUD vs football board
  - cricket live HUD vs board
  - tennis live HUD is already narrowed by props in the page layer

#### Embedded sportsbook workspace already reuses the real match surface
- The sportsbook embedded view uses [next/src/components/public/MatchDetailPageClient.tsx](/home/nain/sixerbat/next/src/components/public/MatchDetailPageClient.tsx), not a second fake renderer.
- This is structurally good because the dedicated page and the embedded workspace are not drifting into two independent implementations.

#### Football enrichment is async and cached
- [back/lib/back/football/api_sports/enrichment.ex](/home/nain/sixerbat/back/lib/back/football/api_sports/enrichment.ex) already uses a split-fetch model for:
  - events
  - lineups
  - statistics
  - standings
- TTLs are already differentiated:
  - events/statistics: 15s
  - lineups: 15 min
  - standings: 1 hour
- The enrichment lane degrades to `[]` rather than raising when requests fail.

#### Embedded odds hydration no longer paints as a blank board
- The embedded match detail flow already distinguishes between:
  - loading/hydration pending
  - actual empty markets
  - fetch failure
- This is already surfaced in [next/src/components/live-football/LiveFootballMatchDashboard.tsx](/home/nain/sixerbat/next/src/components/live-football/LiveFootballMatchDashboard.tsx).

---

### 2. What Is Fragile

#### Temporary market suspension handling is only partially modeled
- Backend suspension broadcasting exists, but the provider adapters do not uniformly convert provider market flags into explicit market suspension state.
- Example:
  - API-Sports live odds are now filtered for `blocked`, `stopped`, `finished`, `suspended` states at adapter level.
  - But there is not yet a full provider-agnostic suspension normalization contract that maps provider market status into:
    - selection hidden
    - market paused
    - market closed
    - market retired
- This means some providers or future endpoints can still degrade into silent disappearance rather than explicit, explainable UI state.

#### Market closures are handled more by omission than intentional UX
- If provider rows disappear or are filtered out, the board simply rebuilds without those rows.
- That prevents bad bets, but the UX can feel abrupt.
- There is no platform-wide distinction yet between:
  - temporarily paused market
  - permanently closed market
  - market removed because provider is stale

#### Embedded sportsbook routing is selection-driven, not action-driven
- [next/src/components/user/sportsbook/SportMatchCard.tsx](/home/nain/sixerbat/next/src/components/user/sportsbook/SportMatchCard.tsx) currently uses the whole card as the only interaction.
- There is no distinct live-only CTA such as:
  - `View Live HUD`
  - `Advanced`
  - pulsing live insight action
- Result:
  - the routing model is functional but implicit
  - users do not get a clear “open advanced command center” action
  - panel behavior is not explicit enough for a premium sportsbook experience

#### Workspace mode does not preserve enough navigation intent
- [next/src/components/user/sportsbook/PlayerSportsbookWorkspace.tsx](/home/nain/sixerbat/next/src/components/user/sportsbook/PlayerSportsbookWorkspace.tsx) manages `selectedMatchId` only in local component state.
- That means:
  - no URL-backed embedded selection state
  - no deep-link to a selected live board inside the workspace
  - browser navigation/back behavior is weaker than it should be for a complex multi-panel app

#### Football enrichment still treats unsupported rich-data coverage as a soft empty state
- The current enrichment lane logs and returns `[]` on errors.
- This is correct for uptime, but not enough for operator and UX clarity.
- Missing distinction today:
  - `provider auth failed`
  - `rate limited`
  - `coverage not supported`
  - `provider temporarily empty`
- The frontend sees mostly the same end result: empty arrays.

#### WebSocket resiliency is improved but still basic
- The frontend match socket reconnects and now avoids the noisy premature-close warning.
- But there is no explicit reconnect strategy metadata shown to the UI beyond generic connection status.
- There is also no sport-specific fallback cadence controller in the browser; fallback freshness depends on page-level polling intervals and backend refresh cadence.

#### Tennis websocket and football/cricket channel models are inconsistent
- Tennis has a separate websocket hook path.
- Football/cricket use the shared Phoenix match channel helper.
- This is workable, but it increases long-term drift risk in reconnect, heartbeat, and teardown behavior.

---

### 3. Edge-Case Stress Assessment

#### Missing auth / 403 / rate limit / 429
Current state:
- Football enrichment already swallows failures to `[]` and logs warnings.
- That prevents crashes.
- This is correct as a survival behavior.

Fragility:
- It does not preserve typed failure reason in persisted match context.
- Frontend cannot distinguish:
  - unsupported coverage
  - temporary outage
  - auth misconfig
  - rate limit

Required hardening:
- Every slow-lane enrichment result should persist a lightweight status envelope in match `raw_data` or context metadata, for example:
  - `status: ok | unavailable | unsupported | rate_limited | auth_failed`
  - `updated_at`
  - `source`
- UI should render a differentiated empty state from that metadata instead of generic `unavailable` text everywhere.

#### Partial payloads / omitted arrays
Current state:
- The codebase is mostly resilient here.
- Football enrichment uses `[]` defaults.
- Live stores merge only when object payloads are present.
- Prematch/live components for football/cricket/tennis already use guarded extraction and optional chaining patterns.

Fragility:
- The resilience is component-by-component, not enforced by a typed normalized context contract.
- Risk grows as more command-center components are added.

Required hardening:
- Establish normalized context contracts where every sport returns stable keys even when empty, for example:
  - `events: []`
  - `statistics: {}`
  - `lineups: []`
  - `standings: []`
  - `meta.status`
- UI should target those normalized shapes only.

#### Socket drops
Current state:
- Phoenix match socket reconnects after close.
- Tennis socket reconnects separately.
- Embedded/public match pages also keep REST query refresh intervals for live boards.

Fragility:
- Reconnect strategy is generic and fixed.
- No explicit escalation path for repeated failures.
- No unified “socket degraded, polling active” UX.

Required hardening:
- Add a reconnect stage model:
  - `connecting`
  - `joined`
  - `degraded`
  - `reconnecting`
  - `offline`
- Expose this in the store and show a small connection badge in live HUDs and side-panel rows.
- Keep live REST fallback tight enough by sport:
  - football: 3s to 5s during websocket degradation
  - tennis: 3s during websocket degradation
  - cricket: existing fast lane remains acceptable if websocket/live transport drops

---

## High-Frequency Odds & Suspension Audit

### Current behavior

#### Temporary suspensions
Backend:
- Suspensions are already broadcast through `market_suspended` and `market_resumed` events from [match_channel.ex](/home/nain/sixerbat/back/lib/back_web/channels/match_channel.ex).
- `MarketManager` already updates `market_state` and `suspended_markets` and broadcasts those changes.

Frontend:
- `matchLiveStore` already tracks:
  - `marketSuspended`
  - `suspensionReason`
  - `suspendedMarkets`
- Football rate buttons already disable based on:
  - board suspended
  - market suspended
  - row inactive
- Betslip execution already blocks placement when the market is suspended.

Conclusion:
- Temporary suspension lockout is functionally present.
- It is not yet consistently provider-normalized or consistently explained in UX across all sports.

#### Market closures
Current behavior:
- Closed/stopped selections mostly disappear because inactive or filtered rows are not grouped into visible market groups.
- This prevents invalid interaction.

Fragility:
- There is no standard closure UX.
- A market can simply vanish rather than transition to a user-facing “Closed” state.

#### Re-render protection
Current behavior:
- `useLiveMatchStoreSelector` caching is the core protection layer.
- Market boards and HUDs are already separated in component structure.
- This is strong enough to avoid obvious “entire page rerenders on every odds tick” regressions.

Fragility:
- Not every heavy component is memoized or URL/state isolated in the same disciplined way.
- The architecture is good, but it depends on ongoing discipline rather than a hard rulebook.

---

## UX Execution Plan

### Goal
Introduce an explicit live-only action from sportsbook side panels that opens advanced command-center information without breaking context.

### Requirement interpretation
For any `LIVE` match row in the sportsbook side panel:
- show a distinct secondary action such as:
  - `View Live HUD`
  - `Advanced`
  - pulse-accent live icon + label
- keep normal row click behavior for standard selection
- make the advanced action explicit and separate from generic selection

### Current state
- Current card interaction is only `onSelect(match)` on the entire card.
- No route/query state represents “advanced panel open”.
- Embedded workspace already renders the full detail surface inline once a match is selected.

### Implementation plan

#### Step 1: Split row interactions
Target:
- [next/src/components/user/sportsbook/SportMatchCard.tsx](/home/nain/sixerbat/next/src/components/user/sportsbook/SportMatchCard.tsx)

Plan:
- Keep full-card click for normal row selection.
- Add a separate live-only action button inside the row when `match.status === "live"`.
- The live-only action must stop event propagation so it does not behave identically to row selection.

#### Step 2: Add explicit workspace route state
Target:
- [next/src/components/user/sportsbook/PlayerSportsbookWorkspace.tsx](/home/nain/sixerbat/next/src/components/user/sportsbook/PlayerSportsbookWorkspace.tsx)

Plan:
- Persist selected match and advanced mode in URL query params, for example:
  - `?match=<id>`
  - `?view=advanced`
- This gives:
  - stable browser back behavior
  - sharable live-board link state
  - cleaner panel restoration after refresh

#### Step 3: Define advanced-open behavior by context
Two valid flows should exist:

Embedded sportsbook mode:
- clicking `View Live HUD` should open the advanced embedded command center in Panel 3 immediately
- no full page reload
- preserve left-panel and overall sportsbook shell context

Dedicated page mode:
- provide a clean route into the dedicated command center page for users who want full-screen focus
- use client navigation only
- no hard reload

#### Step 4: Preserve context on return
- When navigating from workspace to full-page command center, preserve the previous sportsbook route and match id so the user can return to the same board state.
- This should be URL-backed, not local-state-only.

#### Step 5: Expose live insight in Panel 2
- Keep the mini-score / signal chips in side-panel rows.
- Add the explicit CTA below or beside the live signal chip.
- Example behaviors:
  - football: show `Goal`, `Red Card`, then `View Live HUD`
  - tennis: show `Break Point`, `Set Point`, then `View Live HUD`
  - cricket: show live mini-score + `View Live HUD`

### UX rule
- Never force a disruptive full-page reload from this action.
- Use client navigation or workspace panel state only.
- The user must always understand whether they are:
  - selecting a board
  - opening advanced live intelligence
  - leaving the sportsbook shell for the dedicated page

---

## Resiliency Execution Plan

### 1. Enforce provider-agnostic market state normalization
Create one normalized internal market availability model across providers:
- `open`
- `paused`
- `closed`
- `retired`
- `unknown`

Map provider flags into that contract at adapter level.
Do not leave this interpretation to frontend heuristics.

### 2. Persist lightweight lane health metadata
For each enriched context lane, store minimal health metadata in normalized context:
- `events_status`
- `statistics_status`
- `lineups_status`
- `standings_status`
- `updated_at`
- `last_error_code`

This lets the UI tell the difference between:
- unsupported by provider coverage
- temporarily unavailable
- auth/rate-limit issue

### 3. Lock out paused markets instantly and visibly
Current backend lockout exists, but UX needs to be standardized:
- paused market buttons should disable instantly
- betslips should show user-facing paused text
- the side panel row should optionally glow/pulse for critical pause reasons such as:
  - goal under review
  - red card
  - provider reconnect

### 4. Add closed-market visual treatment
Instead of silent disappearance only:
- allow the current visible market group to degrade into a `Closed` state briefly when appropriate
- then archive/remove it on the next clean publish cycle
- this gives the user continuity rather than sudden absence

### 5. Unify socket degradation handling
- Shared status vocabulary across football, cricket, tennis
- Shared connection badge treatment in live HUDs
- Shared reconnect backoff rules
- Shared fallback polling policy during websocket degradation

### 6. Guard command centers against partial context everywhere
All sport-specific selectors should operate against normalized stable context contracts, not raw provider payloads.
That removes component-level optional-data drift over time.

### 7. Protect board replacement behavior
When a provider publish produces no supported rows:
- never archive the current board first
- reject the new publish and keep the existing board intact
- this principle already matters for live provider reference publishing and should be enforced platform-wide

---

## Concrete Risk Register

### Working and acceptable today
- Phoenix channel match updates are in place
- Live stores are structurally sound
- Suspension state exists in store and is used by football live board/slip
- Embedded workspace reuses the real match surface
- Enrichment lane already degrades safely to empty structures instead of crashing

### Fragile and should be fixed next
- No explicit advanced live CTA in sportsbook side-panel rows
- Workspace selection state is not URL-backed
- Provider market closure/paused semantics are not normalized platform-wide
- Slow-lane empty states do not distinguish coverage vs outage vs auth/rate-limit
- Socket degradation UX is too generic
- Tennis websocket path and football/cricket live channel path are not unified enough

---

## Recommended Execution Order

1. Add explicit `View Live HUD` action to live sportsbook rows.
2. Move selected match and advanced-view state into URL query params.
3. Standardize provider market availability normalization across adapters.
4. Persist slow-lane health metadata into normalized sport contexts.
5. Add unified paused/closed market UI treatment.
6. Unify live socket degradation semantics and badges across sports.
7. Normalize sport contexts so command-center components consume stable contracts only.

---

## Definition of Done
The platform should be considered hardened when all of the following are true:
- A live row exposes a distinct advanced action.
- Embedded advanced view opens without full reload.
- Dedicated command center navigation preserves context and return path.
- Paused markets lock instantly and visibly.
- Closed markets degrade gracefully.
- Slow-lane failures do not crash and do not look identical to unsupported coverage.
- Heavy HUD components remain insulated from odds-tick repaint churn.
- Socket degradation is visible, recoverable, and paired with tight REST fallback.
