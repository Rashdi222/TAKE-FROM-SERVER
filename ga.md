# Tennis Handoff

## Scope
- This file is the short continuity note for the tennis work done in this repo.
- Use it as the first read when resuming tennis work in a new session.

## Architecture Decision
- Tennis does **not** use Python, LangGraph, or AI generation.
- Tennis is **provider passthrough + Elixir margin control**.
- Data flow:
  - `API Tennis -> Back.Tennis ingestion -> normalization -> margin -> persisted platform match/odds -> Phoenix websocket -> Next.js`

## Major Tennis Work Completed

### 1. Global Providers
- Central provider management was added.
- `api_tennis` is configured centrally in `providers`.
- Tennis provider credentials are fetched through `Back.Providers`, not `System.get_env/1` in the domain logic.

### 2. Isolated Elixir Domain
- Tennis lives under:
  - `back/lib/back/tennis/`
- Core modules added:
  - `Back.Tennis`
  - `Back.Tennis.ApiClient`
  - `Back.Tennis.MatchState`
  - `Back.Tennis.LiveOdds`
  - `Back.Tennis.Fixture`
  - `Back.Tennis.Normalizer`
  - `Back.Tennis.MarginControl`
  - `Back.Tennis.Workers.LiveSyncWorker`
  - `Back.Tennis.StateCache`
  - `Back.Tennis.TrackedMatches`
  - `Back.Tennis.FixtureCache`
  - simulation modules for local scenario injection

### 3. Tennis Admin
- Tennis admin command center exists at:
  - `/admin/tennis`
- Current tabs:
  - `Upcoming Fixtures`
  - `Live Now`
  - `Managed Matches`
  - `Live Ops Cards`
  - `Live Margin Desk`
- Intent:
  - `Upcoming Fixtures`: schedule discovery
  - `Live Now`: provider live matches
  - `Managed Matches`: operator-managed subset
  - `Live Ops Cards`: at-a-glance live monitoring
  - `Live Margin Desk`: margin and simulation controls

### 4. Tennis Normalization
- Tennis score normalization is handled in Elixir.
- The normalized model supports:
  - sets
  - current game score
  - current point score
  - serve
  - deuce
  - advantage
  - tiebreak
  - break/set/match point flags

### 5. Realtime
- Tennis has its own Phoenix channel:
  - `BackWeb.TennisChannel`
- Topics are tennis-specific:
  - `tennis:lobby`
  - `tennis:match:{event_key}`
- Tennis frontend uses isolated socket hooks:
  - `useTennisSocket`
  - `useTennisMatchSocket`

### 6. Public Tennis UI
- Dedicated public tennis routes exist:
  - `/tennis`
  - `/tennis/match/[id]`
- Important correction:
  - `/sportsbook/tennis` was originally using the generic sportsbook workspace.
  - It has now been routed to the tennis-native public board instead.

### 7. Margin Control
- Tennis odds are mutated only in Elixir.
- `Back.Tennis.MarginControl` converts decimal odds into implied probability, applies margin, then converts back.
- Public users should only see `published_odds`, not raw provider odds.

### 8. Simulation
- Tennis mock scenarios exist under:
  - `back/priv/scenarios/tennis/`
- These scenarios are intended to run through the same normalizer + margin path as live data.

## Critical Fixes Already Made

### Live worker stability
- Fixed a tennis worker crash caused by missing `task_ref` in worker state.

### Provider schema drift
- Fixed provider migration mismatch causing missing `socket_url` column issues.

### API Tennis payload compatibility
- Updated the tennis API client to accept the real API Tennis live payload shape.
- Real payload can arrive as keyed maps with embedded `live_odds`.

### Publish path mismatch
- Fixed `TennisChannel.broadcast_state_updated/1` so it accepts merged tennis maps used after tracking/publish metadata merges.

### Tracking/UI confusion
- Tennis command center was repeatedly reworked because the original manual publish model conflicted with the desired automatic live flow.
- Current intended public rule:
  - upcoming fixtures are visible automatically
  - live matches with valid provider odds are visible automatically
  - tracking is for operator management, not basic public visibility

### Persistence bridge
- Tennis is now bridged into the core betting tables.
- `Back.Tennis` persists provider-backed tennis fixtures/live state into:
  - `matches`
- Tennis live published odds are pushed into real platform:
  - `odds`
- This is required so tennis can use the same contract as the rest of the sportsbook.

### Invalid odds filtering
- A blocking defect existed where some provider odds had empty `odds_value`.
- That crashed the core platform odds publisher.
- This was fixed by filtering invalid tennis provider rows before calling the core odds publish path.

## Verified State
- Local verification showed:
  - tennis `match_id` rows are being created
  - tennis published `odds` rows are being created
- One successful verification ended with:
  - `tennis_matches=402`
  - `tennis_published_odds=328`

## Current User-Facing Intent

### Upcoming
- Upcoming tennis fixtures should appear automatically on:
  - `/tennis`
  - `/sportsbook/tennis`

### Live
- Live tennis matches should appear automatically when:
  - API Tennis reports the match as live
  - usable provider odds are available
  - margin produces valid `published_odds`

### Odds visibility
- Live cards should show visible prices at a glance.
- Dense tennis board work was added to:
  - `next/src/components/tennis/public/TennisLobbyPageClient.tsx`
  - `next/src/components/tennis/public/TennisMarketBoard.tsx`

## Important Operational Note
- A full restart is often required after these tennis changes because:
  - new supervisors/processes were added
  - caching and persistence bridges were added
  - route behavior changed
- Usual restart command used during this work:
```bash
./s.sh
```

## Known Reality / Remaining Gaps
- Tennis has been heavily improved, but it is still the newest stack and may need one more cleanup pass.
- Areas most likely to need more hardening:
  - exact public tennis board UX polish
  - confirming all live odds are surfaced clearly in the user view
  - tightening any remaining cache/bootstrap inconsistencies after restart
  - verifying tennis-specific betting flow end to end from visible odds click to placed bet

## Best Resume Prompt For Tomorrow
- "Read `ga.md` and continue tennis from the latest persisted public/live board state."

## Short Resume Summary
- Tennis is now intended to be:
  - provider-driven
  - Elixir-normalized
  - Elixir-margin-controlled
  - persisted into core sportsbook tables
  - realtime over Phoenix
  - visible on public tennis routes and sportsbook tennis routes
