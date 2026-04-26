# Tennis Master Blueprint

## Discovery Summary

Source audited:
- `https://api-tennis.com/documentation`

What the official API Tennis documentation exposes:
- `get_events`
  - returns event type taxonomy such as ATP Singles, WTA Singles, Challenger, ITF, Doubles
- `get_tournaments`
  - returns supported tournaments
- `get_fixtures`
  - returns scheduled and completed fixtures
  - key filters: `date_start`, `date_stop`, `event_type_key`, `tournament_key`, `tournament_season`, `match_key`, `player_key`, `timezone`
  - payload includes:
    - `event_key`
    - `event_date`
    - `event_time`
    - `event_first_player`
    - `first_player_key`
    - `event_second_player`
    - `second_player_key`
    - `event_final_result`
    - `event_game_result`
    - `event_serve`
    - `event_winner`
    - `event_status`
    - `event_type_type`
    - `tournament_name`
    - `tournament_key`
    - `tournament_round`
    - `tournament_season`
    - `event_live`
    - `event_qualification`
    - player logos
    - `pointbypoint`
    - `scores`
- `get_livescore`
  - returns live matches with the same core shape plus active point-by-point state
  - live payload includes:
    - `event_game_result`
    - `event_serve`
    - `event_status` like `Set 1`
    - `pointbypoint` per game
    - `scores` per set
- `get_H2H`
  - returns head-to-head and recent form using `first_player_key` and `second_player_key`
- `get_players`
  - player profiles
- `get_odds`
  - pre-match odds by `match_key`
  - market structure is nested by market name then outcome then bookmaker price
- `get_live_odds`
  - live odds by `match_key` or broader filters
  - sample fields shown include:
    - `odd_name`
    - `suspended`
    - `type`
    - `value`
    - `handicap`
    - `upd`

Important payload observations:
- Tennis scoring is available in two layers:
  - `scores`: set-by-set totals like `6-4`, `7-6`
  - `pointbypoint`: game-level point progression like `15-0`, `30-15`, `40-40`, advantage, plus flags for break point / set point / match point
- `event_serve` gives current server indicator
- `event_game_result` appears to carry current game score, while `event_final_result` carries set result once complete
- The provider contract is suitable for:
  - fixtures
  - live state
  - point-by-point tracking
  - reference odds / live odds

Architectural constraint for this project:
- Tennis must not reuse Cricket or Football runtime logic, UI components, or state models
- Existing generic `sports_providers/api_tennis.ex`, websocket, and fetch worker should be treated as temporary discovery assets, not the final tennis architecture

## Phase 1: Global Providers Management (Super Admin)

### Goal
Create one centralized provider-control surface for all external providers so API keys, enablement, health, rate limits, and webhook/socket status are not scattered across sport-specific pages.

### New frontend surface
- Route: `next/src/app/admin/providers/page.tsx`
- This becomes the single control plane for:
  - SportMonks
  - API Sports
  - API Tennis
  - future providers

### New UI sections
- `ProviderRegistryTable`
  - provider name
  - sport coverage
  - enabled / disabled
  - active / inactive
  - auth mode
  - last successful sync
  - last failure
  - rate-limit status
- `ProviderCredentialsDrawer`
  - API key
  - base URL
  - websocket URL if applicable
  - auth header/query mode
  - webhook secret if ever added
- `ProviderHealthPanel`
  - status
  - latency
  - failure streak
  - pause / resume controls
- `ProviderUsagePanel`
  - request counts
  - per-provider throttles
  - circuit/open status

### Backend plan
- Keep provider credentials in the existing provider/config system, but standardize fields:
  - `name`
  - `base_url`
  - `socket_url`
  - `api_key`
  - `auth_mode`
  - `headers_template`
  - `query_template`
  - `is_enabled`
  - `is_active`
  - `sport_scope`
- Add explicit provider profile for API Tennis:
  - `name: "api_tennis"`
  - `base_url: "https://api.api-tennis.com/tennis/"`
  - `socket_url: "wss://wss.api-tennis.com/live"`
  - `auth_mode: "query"`
  - `api_key_param: "APIkey"`

### Security requirements
- API keys never rendered back in full
- masked previews only
- all writes audit-logged
- no tennis page should directly own provider credentials

### Exit criteria
- Provider setup for API Tennis is fully managed from `/admin/providers`
- Tennis pages consume provider identity indirectly, never hardcoded

## Phase 2: Elixir Domain Isolation & API Tennis Ingestion

### Goal
Build a fully isolated tennis domain under `back/lib/back/tennis/` and stop relying on generic shared sports ingestion paths for production tennis.

### New backend namespace
- `back/lib/back/tennis/`
  - `provider_client.ex`
  - `fixtures.ex`
  - `live_feed.ex`
  - `state_normalizer.ex`
  - `match_state.ex`
  - `odds_reference.ex`
  - `workers/fixture_fetcher.ex`
  - `workers/live_fetcher.ex`
  - `workers/live_match_worker.ex`
  - `router.ex`
  - `publisher.ex`
  - `simulation.ex`

### Hard separation rule
- Tennis code may depend on:
  - `Repo`
  - `Match`
  - `Odds`
  - common provider credential storage
  - common channel transport
- Tennis code may not depend on:
  - cricket runtime nodes
  - football state interpreters
  - cricket/football market managers
  - cricket/football UI payload adapters

### Provider ingestion design
- `Back.Tennis.ProviderClient`
  - owns every API Tennis REST call:
    - fixtures
    - livescore
    - players
    - H2H
    - odds
    - live odds
- `Back.Tennis.LiveFeed`
  - owns websocket/session handling for API Tennis live stream if enabled
  - if socket degrades, falls back to polling livescore REST

### Worker plan
- `Back.Tennis.Workers.FixtureFetcher`
  - imports scheduled matches by date window and tournament filters
- `Back.Tennis.Workers.LiveFetcher`
  - polls live state
- `Back.Tennis.Workers.LiveMatchWorker`
  - one worker per match
  - serializes state updates for that match only
  - responsible for:
    - event identity
    - score change ordering
    - repricing triggers
    - suspension on broken feed

### Provider response mapping
- API Tennis fields map into tennis-native state:
  - `event_key` -> `provider_event_id`
  - `event_first_player` / `event_second_player` -> competitors
  - `event_serve` -> current server
  - `scores` -> set ledger
  - `pointbypoint` -> point/game history
  - `event_game_result` -> current game score
  - `event_status` -> status string
  - `event_live` -> live boolean

### Publishing rule
- Reference odds from `get_odds` and `get_live_odds` remain tennis-owned
- No football provider-reference board logic should be reused
- If provider live odds are used, tennis gets its own publisher:
  - `Back.Tennis.Publisher.publish_provider_board/3`

### Exit criteria
- Tennis live ingestion runs in its own namespace
- No Cricket or Football runtime module is required for a tennis match to go live

## Phase 3: Super Admin Tennis Management Desk

### Goal
Add a dedicated Tennis desk in the admin shell with clear operator workflows for fixture discovery, live fetching, and publishing.

### Sidebar integration
- Add new left-nav item:
  - `Tennis`
- Route:
  - `/admin/tennis`

### Required subtabs
- `Fixture Fetching`
- `Live Match Fetching`
- `Publishing / Control`

### Tab 1: Fixture Fetching
- `TennisTournamentCatalogPanel`
  - API Tennis event types
  - tournaments
  - season / round info where available
- `TennisFeedPanel`
  - create feed
  - select event type
  - select tournament
  - date window
  - import fixtures
- `TennisFixtureResultsTable`
  - imported count
  - skipped count
  - failed rows
  - provider raw IDs

### Tab 2: Live Match Fetching
- `TennisLiveQueuePanel`
  - all live tennis matches currently tracked
  - socket status
  - last provider heartbeat
  - point update lag
- `TennisLiveMatchCard`
  - player names
  - set score
  - current game score
  - current server
  - current status
  - deuce / breakpoint / set-point markers
- Controls:
  - force refresh
  - suspend market family
  - reopen market family
  - inspect raw provider payload

### Tab 3: Publishing / Control
- `TennisPublishingDesk`
  - draft odds
  - published odds
  - provider reference odds
  - live micro-market status
- controls:
  - publish
  - unpublish
  - force reprice
  - switch provider-reference mode on/off
  - manual override

### UX direction
- faster than football
- denser than cricket admin cards
- dark, data-first, with set/game/point hierarchy obvious at a glance

### Exit criteria
- Admin can discover, ingest, monitor, suspend, and publish tennis from one desk

## Phase 4: Tennis Data & State Models

### Goal
Define a rigid tennis-native state contract for backend, websocket, and provider-odds runtime.

### Match-level state
- `match_id`
- `provider`
- `provider_event_id`
- `sport = "tennis"`
- `status`
- `surface` if available
- `event_type_key`
- `tournament_key`
- `tournament_name`
- `round_name`
- `qualification`
- `best_of`
- `player1`
- `player2`
- `current_server`
- `winner`

### Score state
- `sets`
  - array of:
    - `set_no`
    - `player1_games`
    - `player2_games`
    - `tiebreak_player1`
    - `tiebreak_player2`
    - `completed`
- `current_game`
  - `player1_points`
  - `player2_points`
  - canonical values:
    - `0`
    - `15`
    - `30`
    - `40`
    - `AD`
- `current_point_flags`
  - `break_point_for`
  - `set_point_for`
  - `match_point_for`
  - `deuce`
  - `advantage_for`

### Event stream model
- `event_seq`
- `state_version`
- `source`
- `provider_timestamp`
- `server_changed`
- `point_won_by`
- `game_won_by`
- `set_won_by`
- `tiebreak_started`
- `medical_timeout`
- `retirement`
- `walkover`
- `rain_delay`

### Normalization rules
- API Tennis strings must be normalized into canonical tennis values
- never expose raw `"15 - 0"` strings as the only internal source of truth
- parse point score into structured fields
- retain raw provider payload separately for debugging

### Database direction
- keep the shared `matches` table initially to avoid migration blast radius
- add tennis-specific JSONB/state substructures rather than mixing with cricket/football columns
- introduce tennis state schema/module wrappers:
  - `Back.Tennis.MatchState`
  - `Back.Tennis.ScoreState`
  - `Back.Tennis.PointTimeline`

### Exit criteria
- Tennis state is explicit, typed, and not borrowed from other sports

## Phase 5: Bespoke User-Side Luxury UI (Next.js)

### Goal
Create the best user-facing tennis experience in the app, fully distinct from cricket and football.

### Hard UI separation
- New component tree only for tennis
- No reuse of cricket or football market board layout
- New directory:
  - `next/src/components/live-tennis/`

### Core user interface modules
- `LiveTennisMatchDashboard.tsx`
- `TennisScoreRibbon.tsx`
- `TennisCourtMomentumView.tsx`
- `TennisMicroMarketsTable.tsx`
- `TennisPointTimeline.tsx`
- `TennisServeIndicator.tsx`
- `TennisBetSlip.tsx`

### Visual direction
- luxury dark theme
- court-inspired geometry
- thin neon service indicator
- clear set/game/point hierarchy
- micro-markets visible without scrolling through oversized cards

### Key user-side features
- scoreboard header:
  - player names and photos/logos if available
  - server indicator
  - completed sets
  - current game points
  - tiebreak marker
- live court momentum visualizer:
  - game-by-game and point pressure trend
  - break-point tension marker
  - serve-hold/break rhythm
- micro-market table:
  - Match Winner
  - Set Winner
  - Next Game Winner
  - Next Point Winner
  - Total Games
  - Correct Set Score
- stable freeze states:
  - rows stay mounted when suspended or repricing
  - no blink/reflow

### Luxury UX rules
- tight row height
- mono pricing column
- tennis-specific copy:
  - `Deuce`
  - `Advantage`
  - `Break Point`
  - `Set Point`
  - `Match Point`
- selected bet slip should feel fast and premium, not generic

### Exit criteria
- User tennis board is visually distinct and meaningfully better than generic match pages

## Phase 6: Odds Passthrough & House Margin Control (Elixir)

### Goal
Use API Tennis Business Plan in-play odds directly, then mutate them inside Elixir with configurable house margin controls before persistence and broadcast.

### Core principle
- API Tennis is the sole odds source for Tennis
- Tennis odds are not generated by Python or AI
- Elixir ingests provider odds, applies the house margin layer, then publishes platform odds

### Data flow
1. `Back.Tennis.ProviderClient` fetches:
   - `get_odds` for pre-match reference
   - `get_live_odds` for in-play markets
2. `Back.Tennis.OddsReference` normalizes the provider market tree into tennis platform market rows
3. `Back.Tennis.MarginControl` applies configurable payout shaving
4. `Back.Tennis.Publisher` persists mutated platform odds
5. `MatchChannel` broadcasts the post-margin platform board to user/admin clients

### Required Elixir modules
- `back/lib/back/tennis/odds_reference.ex`
- `back/lib/back/tennis/margin_control.ex`
- `back/lib/back/tennis/publisher.ex`
- `back/lib/back/tennis/live_odds_worker.ex`
- `back/lib/back/tennis/live_market_worker.ex`

### Margin control logic
- Treat API Tennis odds as the market baseline or global average
- Before saving/broadcasting, Elixir applies a configurable house tax such as:
  - global margin percentage by sport
  - market-family margin percentage
  - match-specific override
- Margin must support:
  - flat shave
  - market-specific shave
  - suspend-if-below-min-payout

### Mutation policy
- For decimal odds:
  - convert provider quote to internal decimal
  - reduce payout side by configured margin band
  - round using tennis-specific rules so rows remain stable and readable
- Margin controls should be configurable for:
  - Match Winner
  - Set Winner
  - Next Game Winner
  - Next Point Winner
  - Correct Set Score
  - Total Games

### Safety rules
- Provider odds are never broadcast raw if margin mode is enabled
- Margin mutation must preserve market coherence
- Suspended provider rows stay suspended
- If a market cannot be normalized cleanly, it is dropped and audit-logged rather than guessed

### Admin controls
- tennis publishing desk must expose:
  - provider baseline odds
  - platform margin %
  - final platform odds
  - per-market enable/disable
  - per-match emergency suspend

### Telemetry
- each published row should carry provider metadata:
  - provider price
  - applied margin %
  - final platform price
  - provider update timestamp
- admin UI should show:
  - baseline vs final
  - market source
  - last provider tick

### Exit criteria
- Tennis odds are published entirely through Elixir
- API Tennis in-play odds are transformed into profitable platform odds via margin control
- no tennis odds depend on Python generation

## Phase 7: End-to-End Simulation & Sandboxing

### Goal
Create a safe tennis sandbox so live-state transitions can be tested without waiting for a real match.

### Backend scenario suite
- directory:
  - `back/priv/tennis_scenarios/`
- starter scenarios:
  - `deuce_breakpoint.json`
  - `tiebreak_pressure.json`
  - `retirement_suspension.json`
  - `momentum_reversal.json`

### Elixir simulation suite
- `back/lib/back/tennis/simulation.ex`
- `tests/simulate_tennis_live.exs`

### Required test flows
- fixture import -> live activation -> websocket/state publish
- point-by-point update -> provider live odds refresh -> margin mutation -> publish
- game win -> next-game market refresh
- set completion -> set winner / match winner refresh
- suspension cases:
  - medical timeout
  - rain delay
  - retirement / walkover

### UI sandbox controls
- add `Simulation` tab inside `/admin/tennis`
- choose target match shell
- inject:
  - deuce scenario
  - break point
  - tiebreak
  - retirement
- rows freeze instead of vanishing while the engine reprices

### Acceptance tests
- mock API Tennis payload must be byte-for-byte close to production shape
- same websocket / publish contract as live
- no special-case frontend code just for simulation

### Exit criteria
- Tennis can be tested end to end without live provider dependence

## Implementation Order

1. Global provider management
2. Tennis domain isolation in Elixir
3. Admin tennis desk
4. Tennis state model normalization
5. User luxury UI
6. Elixir odds passthrough and margin control
7. Simulation and hardening

## Non-Negotiable Rules

- Tennis must not borrow cricket state fields
- Tennis must not borrow football provider-reference publishing logic
- Tennis UI must not share cricket market board components
- all provider access must go through the centralized provider management setup
- NO PYTHON OR AI GENERATION FOR TENNIS.
- Tennis odds are strictly sourced from the API provider and mutated via Elixir margin controls. Do not build AI agents for Tennis.

## Current Repo Notes

Existing repo assets already present:
- [api_tennis.ex](/home/nain/sixerbat/back/lib/back/sports_providers/api_tennis.ex)
- [api_tennis_socket.ex](/home/nain/sixerbat/back/lib/back/sports_providers/api_tennis_socket.ex)
- [tennis_fetch_worker.ex](/home/nain/sixerbat/back/lib/back/workers/tennis_fetch_worker.ex)

These should be treated as discovery scaffolding, not the final tennis architecture.

Recommended migration stance:
- preserve them temporarily for reference
- do not extend the shared `sports_providers` path as the long-term tennis runtime
- build the isolated `Back.Tennis` stack and then retire or wrap the shared modules
