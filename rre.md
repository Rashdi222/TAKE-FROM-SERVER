# Football Command Center Repair Blueprint

## 1. Objective Overview

Restore the Football Command Center to a fully enriched, responsive state without disrupting the existing live odds loop.

The repair has three precise goals:
- restore authenticated API-Sports enrichment so `football_context` contains real `events`, `lineups`, and any supported `statistics`
- ensure competition-feed-driven football matches also trigger enrichment, not just the generic fetcher path
- eliminate the blank-market-board flash in the embedded sportsbook workspace by handling empty `initialOdds` intentionally

This is a surgical repair plan. It does not redesign the command center. It fixes the broken data path and the weak frontend hydration behavior while preserving the current split between:
- the fast live odds heartbeat
- the slower football enrichment lane

---

## 2. Phase 1: Fix Backend Enrichment Auth

### Target Files
- `back/lib/back/football/api_sports/enrichment.ex`
- related provider config helpers already used by the odds lane
- `back/lib/back/providers/dispatcher.ex`
- `back/lib/back/providers/api_sports.ex`

### Confirmed Failure
The enrichment lane is currently calling API-Sports with `provider.config` directly.

That config does not reliably contain:
- `"api_key"`
- normalized `"base_url"`

The odds lane works because it goes through the provider adapter config builder, which injects:
- `"api_key" => provider.api_key`
- `"base_url" => provider.base_url`

The enrichment lane does not do that, so calls like:
- `/fixtures/events`
- `/fixtures/lineups`
- `/fixtures/statistics`
- `/standings`

can go out without `x-apisports-key`, fail with `403 Forbidden`, and then get swallowed into empty arrays.

### The Fix
Modify the football enrichment path so it uses the same fully prepared adapter config shape as the working odds lane.

### Required Change
Inside `Back.Football.ApiSports.Enrichment.enrich_and_persist/1`:
- stop passing raw `provider.config` into `fetch_context/3`
- build the provider config through the same config-preparation path used by the dispatcher/odds flow
- pass the enriched config into `fetch_context/3`

### Implementation Direction
Possible acceptable implementation patterns:
1. reuse the existing provider adapter config builder directly if it is accessible cleanly from the enrichment module
2. extract that logic into a shared helper if it is currently trapped in a provider dispatcher concern
3. avoid duplicating config-shaping logic inline unless there is no better option

### Safety Constraints
- do not alter how live odds fetches are currently authenticated
- do not modify endpoint routing or provider selection behavior
- only fix the enrichment lane so it authenticates the same way as the odds lane

### Error Handling Adjustment
The current enrichment flow appears to degrade all fetch failures to empty arrays/maps.
That behavior should remain non-fatal for production resilience, but it should no longer hide authentication failures completely.

The repair should add structured logging for enrichment fetch errors, especially for:
- HTTP 401/403
- malformed provider responses
- coverage mismatch edge cases

The goal is:
- keep the UI resilient
- make backend failures diagnosable

### Expected Result
After this phase:
- supported football leagues should populate `football_context.events` and `football_context.lineups`
- unsupported coverage should still return safe empty structures
- enrichment should no longer silently fail because of missing API-Sports auth

---

## 3. Phase 2: Fix Backend Competition Feed Triggers

### Target File
- `back/lib/back/providers.ex`

### Focus Area
- `import_competition_feed/3`

### Confirmed Failure
The generic football match fetcher path triggers `FootballEnrichment.enrich_async/1`.
The competition-feed importer path does not.

This means football matches refreshed primarily through competition feeds can remain under-enriched indefinitely, even if the enrichment code itself is correct.

That creates a split state in production:
- generic fetch path matches can receive `football_context`
- competition-feed-managed matches can remain stuck with no `football_context`

### The Fix
Inject football enrichment into the competition-feed import lifecycle after match upsert and before/alongside downstream non-blocking automation.

### Required Change
In `import_competition_feed/3`:
- identify the upserted football matches
- enqueue `FootballEnrichment.enrich_async/1` for those matches
- keep this asynchronous so the feed importer does not block on enrichment HTTP calls

### Placement Rules
The enrichment trigger must be:
- after match persistence, so the match record exists and can be updated
- non-blocking, so feed ingestion throughput is preserved
- football-specific, so other sports are not accidentally forced through football enrichment logic

### Deduplication / Safety
The plan should consider duplicate enrichment scheduling.
If the same match may be refreshed repeatedly during a feed sweep, the repair should avoid creating uncontrolled redundant enrichment fanout.

Acceptable approaches:
- rely on existing cache TTLs if they already make repeat enrichment cheap
- or add a lightweight guard if duplication becomes materially noisy

The default recommendation is:
- keep the trigger simple first
- rely on the current enrichment cache behavior unless profiling proves a need for stronger deduplication

### Expected Result
After this phase:
- football matches refreshed via competition feeds will populate `football_context`
- the selected live football match in sportsbook workspace will no longer depend on having come through the generic fetcher path in order to show events/lineups/context

---

## 4. Phase 3: Fix Frontend Odds Hydration (The Blank Board)

### Target Files
- `next/src/components/user/sportsbook/PlayerSportsbookWorkspace.tsx`
- `next/src/components/public/MatchDetailPageClient.tsx`
- optionally the football market board/loading state component if a dedicated skeleton is introduced

### Confirmed Failure
In embedded sportsbook mode, the selected match detail surface is rendered with:
- `initialOdds={[]}`

That means the market board mounts empty and then waits for a secondary async odds fetch to hydrate.
If that request is slow or temporarily fails, the user sees a blank market section even though backend odds already exist.

### The Fix
Do not allow an empty odds array to visually masquerade as “no markets”.
The UI must distinguish between:
- `loading odds`
- `no published odds`
- `failed to load odds`

### Recommended Repair Path
Primary recommendation:
- add an explicit loading state in the embedded detail flow
- when `initialOdds` is intentionally empty and the secondary odds query is still pending, render a premium loading skeleton in the football market area instead of a blank board

This is the lowest-risk repair because it preserves the current fetch architecture while removing the broken visual state.

### Alternative Repair Path
A stronger but slightly broader repair would be:
- defer rendering the embedded match detail view until the secondary odds query resolves
- or prefetch odds before switching the selected match into the main panel

This can produce a cleaner first paint, but it changes panel behavior more broadly.
For the first repair pass, the recommended path is the skeleton/loading-state approach.

### Required UI State Model
The embedded football detail experience should explicitly support:
- `isLoadingOdds`
- `oddsLoadError`
- `hasOdds`

And render accordingly:
- loading skeleton while pending
- clean fallback message if load failed
- actual market board once odds arrive

### UX Constraint
Do not collapse the market area height during odds fetch.
A stable skeleton footprint is required so the command center does not jump or feel broken.

### Expected Result
After this phase:
- clicking a football match in the sportsbook workspace will no longer produce an empty market board flash
- the user will either see:
  - a loading skeleton
  - the hydrated odds board
  - or a clear fallback state
- but never an unexplained blank container

---

## Delivery Sequence

Recommended execution order:
1. Phase 1: backend auth fix
2. Phase 2: competition-feed enrichment trigger fix
3. Phase 3: frontend odds hydration/loading-state fix

Reasoning:
- fixing the frontend first would only hide the bigger backend problem
- restoring enrichment auth and trigger coverage first ensures the command center has real data to render
- then the frontend can present loading states correctly while async detail hydration completes

---

## Success Criteria

The repair is complete when all of the following are true:
- API-Sports enrichment requests for supported football fixtures send valid auth headers
- football matches imported through competition feeds receive async enrichment
- `football_context` is persisted for supported fixtures and broadcast through the existing Phoenix match channel
- leagues without `statistics` support still show graceful stats-unavailable messaging
- leagues with `events` support no longer show an empty timeline due to auth/config failure
- embedded sportsbook football detail panels no longer render an empty market area during odds hydration
- the live odds pipeline remains untouched and fully operational
