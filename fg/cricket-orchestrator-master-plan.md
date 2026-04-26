# Cricket Odds Orchestrator Master Plan

## Current Audit Summary

### What exists today
- Phoenix already has match ingestion, polling, match channels, odds CRUD, publish/unpublish, and atomic bet placement via `Ecto.Multi`.
- AI odds generation already exists in Elixir via OpenRouter in `back/lib/back/ai/odds_generator.ex`.
- AI orchestration already exists in Elixir in `back/lib/back/ai/odds_orchestrator.ex`, but it is admin-questionnaire-driven, not live-state-driven.
- Cricket automation already exists in `back/lib/back/ai/cricket_odds_automation.ex`, but it is feed-window-driven and only checks coarse match state (`upcoming` / `live`) plus a shallow state hash.
- Sportmonks live updates already reach Phoenix through provider polling in `back/lib/back/workers/match_fetcher.ex`.
- Match websocket broadcasting already exists through `BackWeb.MatchChannel` and `BackWeb.UserChannel`.
- Atomic wallet and bet placement already exist in `back/lib/back/betting.ex`.

### What is missing for real state-aware live cricket pricing
- No canonical `MatchState` model for cricket innings context.
- No ball-by-ball event routing layer.
- No persistent event stream / live state timeline for each match.
- No suspension engine around major state transitions such as wicket, innings break, rain break, super over, etc.
- No external Python/LangGraph engine. Current AI pricing runs directly from Elixir prompts.
- No under-500ms event-to-price contract.
- No fine-grained Phoenix broadcast model for market-by-market updates.
- No frontend rate-cell animation model tied to delta updates.

---

## PHASE 1: Codebase Audit & Data Flow Architecture

### 1. Review the current odds generation logic and identify what is missing to make it state-aware

#### Current generation path
- `OddsController.generate/2` calls `Back.AI.OddsGenerator.generate_odds/3`.
- `OddsGenerator` builds a prompt from:
  - match sport
  - team names
  - phase (`upcoming` or `live`)
  - allowed bet types
  - static strategy notes
  - market config bounds
- `DraftGenerator` persists AI output as platform draft odds.
- `OddsOrchestrator` only asks the admin follow-up questions such as hardness, bet types, limits, and note. It does not compute live cricket state.

#### Current live support
- `MatchFetcher` polls provider live data and updates `matches.score`, `matches.status`, `matches.raw_data`.
- `MatchChannel` broadcasts `status_changed`, `score_updated`, and generic `odds_updated` events.
- `CricketOddsAutomation` only decides whether to run based on:
  - feed config
  - match `status`
  - `in_play_enabled`
  - a shallow state hash built from score/raw_data
- The current cricket in-play settlement only snapshots `total_runs` for a very narrow market family.

#### Missing state-aware pieces
- A normalized cricket event model for every ball.
- A canonical per-match state object that can be updated deterministically after each ball.
- A routing layer that decides which event types require:
  - immediate repricing
  - market suspension
  - no action
- A distinct pricing engine contract between Phoenix and Python.
- Latency budget and retry policy.
- Live market lifecycle rules for stale odds invalidation and reactivation.

### 2. Design the data flow diagram

```text
Sportmonks Ball-by-Ball Feed
        |
        v
Phoenix Live Event Ingestor
- provider adapter
- event normalization
- event dedupe / sequencing
- match state persistence
        |
        v
Phoenix State Router
- classify event severity
- suspend affected markets if needed
- build MatchState payload
- enqueue pricing request
        |
        v
Python LangGraph Engine
- Event Router node
- Momentum & Risk node
- Rate Emitter node
- returns structured odds delta JSON
        |
        v
Phoenix Odds Application Layer
- validate response
- persist draft/live odds version
- mark suspended/open states
- atomic publish/live board update rules
        |
        v
Phoenix Channels
- broadcast scoreboard deltas
- broadcast market state deltas
- broadcast odds row deltas
        |
        v
Next.js Match Page
- sticky live scoreboard
- market tabs
- flashing rate fields
- bet slip state
- suspend / reject feedback
```

### 3. Define the database schema in Ecto for `matches`, `bets`, and `user_wallets`

#### Existing schema reality
- `matches` already exists with:
  - `sport`, `team1`, `team2`, `start_time`, `status`, `winner`, `in_play_enabled`, `external_id`, `provider`, `score`, `raw_data`, `competition_feed_id`
- `bets` already exists with:
  - `user_id`, `match_id`, `odds_id`, `stake`, `potential_win`, `status`, `is_in_play`
- There is no separate `user_wallets` table today.
- Wallet balance currently lives on `users.balance` with ledger rows in `transactions`.

#### Recommended target schema

##### `matches`
Keep the current table, but extend it with state-aware live columns:
- `live_state_version` integer
- `live_event_seq` bigint
- `current_innings` integer
- `current_over` decimal or string
- `current_ball_in_over` integer
- `batting_team` string
- `bowling_team` string
- `runs_total` integer
- `wickets_total` integer
- `target_runs` integer nullable
- `required_run_rate` decimal nullable
- `current_run_rate` decimal nullable
- `momentum_index` decimal nullable
- `market_state` map
- `last_ball_event_type` string
- `last_ball_event_payload` map
- `last_live_event_at` utc_datetime
- `suspended_at` utc_datetime nullable
- `suspension_reason` string nullable

Do not remove `score` or `raw_data`. Keep them as provider payload storage and compatibility fallback.

##### `bets`
Keep the current table, but extend it with execution context fields:
- `match_state_version` integer
- `odds_version_no` integer
- `market_key` string
- `selection_key` string
- `quoted_odds_value` decimal
- `accepted_at` utc_datetime
- `rejected_reason` string nullable
- `client_snapshot` map nullable

This makes settlement, disputes, and stale-price detection tractable.

##### `user_wallets`
Two valid designs:

Option A: stay with current design
- keep `users.balance`
- treat `transactions` as wallet ledger
- add locking discipline using row-level locks in bet placement

Option B: introduce `user_wallets`
- `id`
- `user_id`
- `currency`
- `available_balance`
- `locked_balance`
- `exposure_balance`
- `version`
- timestamps

For your current stack, the lowest-risk plan is:
- keep `users.balance` for now
- add stronger wallet locking with `FOR UPDATE`
- optionally migrate to `user_wallets` later if exchange-style exposure grows

Additional tables required for the orchestrator:
- `match_live_events`
- `match_state_snapshots`
- `market_suspensions`
- `odds_engine_requests`
- `odds_engine_responses`
- `live_odds_versions`

---

## PHASE 2: The Python LangGraph Engine (The Brain)

### 1. Define the `MatchState` schema

Recommended Python `MatchState` contract:

```python
class MatchState(TypedDict):
    match_id: str
    provider: str
    sport: str
    event_seq: int
    state_version: int
    event_time: str
    event_type: str
    inning: int
    over: float
    ball_in_over: int
    striker: str | None
    non_striker: str | None
    bowler: str | None
    batting_team: str | None
    bowling_team: str | None
    runs_total: int
    wickets_total: int
    target_runs: int | None
    runs_required: int | None
    balls_remaining: int | None
    current_run_rate: float | None
    required_run_rate: float | None
    opening_rate: float | None
    current_batter_strength: float | None
    momentum_index: float | None
    partnership_runs: int | None
    last_6_balls_pattern: list[str]
    recent_boundaries: int
    recent_dots: int
    recent_wickets: int
    pressure_index: float | None
    market_state: dict
    raw_event: dict
    admin_overrides: dict | None
```

#### Why this is needed
- `runs` / `wickets` / `overs` alone are not enough for live cricket pricing.
- `current_batter_strength`, `momentum_index`, and `opening_rate` are exactly the fields that let the model avoid stateless hallucination and price according to game context.

### 2. Design the multi-agent graph nodes

#### Node 1: Event Router
Purpose:
- classify the incoming ball or live event
- determine event severity
- decide whether to suspend immediately
- normalize event tags

Inputs:
- raw Sportmonks event payload
- previous `MatchState`

Outputs:
- updated event classification
- event severity label: `minor`, `moderate`, `critical`
- event family: `dot`, `single`, `boundary`, `wicket`, `wide`, `no_ball`, `review`, `innings_break`, `rain_break`, `match_end`
- routing flags:
  - `requires_suspend`
  - `requires_full_reprice`
  - `requires_partial_reprice`

Rules:
- dot ball: usually partial reprice
- boundary: full reprice on active short-horizon markets
- wicket: suspend affected markets, then full reprice
- innings break: suspend all innings-dependent markets
- rain / interruption: suspend all markets immediately

#### Node 2: Momentum & Risk Calculator
Purpose:
- turn raw event + prior state into pricing context
- adjust probabilities before emission

Responsibilities:
- compute updated `momentum_index`
- compute `pressure_index`
- adjust for wickets in hand
- adjust for striker quality / set batter factor
- adjust for run-rate acceleration / collapse
- account for innings phase:
  - powerplay
  - middle overs
  - death overs

Outputs:
- calibrated probability context
- risk flags
- suspension continuation flag if uncertainty is too high

#### Node 3: Rate Emitter
Purpose:
- produce exact odds outputs in machine-consumable JSON
- never return prose

Outputs:
- market-wise rows:
  - `market_key`
  - `selection_key`
  - `price`
  - `is_suspended`
  - `reason`
  - `state_version`
  - `confidence_score`
  - `valid_for_ms`

The emitter should not directly publish. It should return a proposed market delta for Phoenix to validate and persist.

### 3. Plan the Python service structure

Recommended service shape:
- Python FastAPI service, not a CLI daemon
- LangGraph graph loaded once at process boot
- synchronous HTTP endpoint for low-latency request/response
- optional background queue for heavy recalculation

Recommended endpoints:
- `POST /health`
- `POST /price/cricket/event`
- `POST /price/cricket/rebuild-state`
- `POST /price/cricket/manual-reprice`

Request contract:
- `match_id`
- `event_seq`
- `state_version`
- `match_state`
- `active_markets`
- `operator_policy`
- `request_mode` (`delta`, `full_reprice`, `manual_override`)

Response contract:
- `match_id`
- `event_seq`
- `state_version`
- `latency_ms`
- `markets`
- `suspend_markets`
- `resume_markets`
- `engine_trace_id`

Performance plan for under 500ms
- keep Gemini Flash or equivalent fast model only for reasoning steps that need it
- use deterministic Python calculations for obvious transitions
- use model inference only for nuanced repricing, not every trivial dot ball if rules can handle it
- pre-load prompts/templates
- keep connection pooling warm
- add request timeout budget:
  - Phoenix -> Python hard timeout: 400ms to 450ms
  - fallback behavior if engine exceeds deadline: keep market suspended or keep last safe line depending on event severity

---

## PHASE 3: Phoenix Backend Implementation (The Engine)

### 1. Plan the Sportmonks WebSocket listener in Elixir

Important current reality:
- current code uses polling through `MatchFetcher` and provider adapters
- there is no real Sportmonks cricket websocket client yet

Implementation plan
- add a dedicated ingestor process, for example:
  - `Back.Live.CricketSportmonksConsumer`
- supervise it under your app supervision tree
- responsibilities:
  - connect to Sportmonks live feed or polling fallback if websocket is unavailable
  - parse ball-by-ball events
  - dedupe by `event_seq` / provider event id
  - persist `match_live_events`
  - update `matches` live columns and `match_state_snapshots`
  - push event into orchestrator router

If Sportmonks does not provide a websocket on your plan:
- implement a high-frequency polling adaptor for ball timeline endpoints
- still expose the same internal event bus contract so Phoenix stays provider-agnostic

### 2. Write the logic for the HTTP/gRPC call to the Python LangGraph engine for every significant match event

Recommended Phoenix service module:
- `Back.AI.CricketOrchestratorClient`

Flow:
1. ingest provider event
2. normalize into internal event struct
3. compute or load current `MatchState`
4. run state router
5. if event needs repricing:
   - suspend relevant markets immediately if required
   - call Python engine with event + state
6. validate response
7. persist new live odds version
8. broadcast deltas

Transport recommendation:
- start with HTTP JSON via `Req`
- do not begin with gRPC unless you already have service infra for it
- HTTP is simpler to debug and enough for sub-500ms on the same network

### 3. Plan the `Ecto.Multi` transaction block for when a user places a bet

Current state:
- bet placement already uses `Ecto.Multi`
- it deducts user balance, inserts bet, inserts transaction

What must be strengthened:
- lock the user balance row with `FOR UPDATE`
- verify match state version is still valid for the quoted odds
- verify market is not suspended
- verify odds row is still active and still published
- verify live state has not advanced past the quoted version if in-play

Recommended atomic flow:
1. lock user row
2. lock match row
3. lock odds row
4. verify:
   - user active
   - match status valid
   - market not suspended
   - odds visible and active
   - quoted version matches
   - stake within market/user limits
5. deduct balance
6. insert bet with quoted metadata
7. insert ledger transaction
8. commit
9. broadcast user balance update

This should remain in Phoenix, not Python.

### 4. Plan the Phoenix Channel broadcast to push the new odds instantly

Current channels already exist:
- `match:*`
- `user:*`

Recommended live broadcast event types
- `score_updated`
- `match_state_updated`
- `market_suspended`
- `market_resumed`
- `odds_delta`
- `odds_version_published`
- `bet_rejected_state_changed`

Do not broadcast the entire board on every ball.
Broadcast deltas:
- changed market ids
- changed price rows
- changed suspension flags
- latest `state_version`

That keeps Next.js fast and reduces unnecessary rerenders.

---

## PHASE 4: Next.js Frontend (The User Match Page)

### 1. Plan the UI layout for the Live Match Dashboard

Recommended layout:

```text
[ Sticky Scoreboard Bar ]
- teams
- score
- overs
- wickets
- run rates
- live indicator
- suspension banner when needed

[ Market Tab Rail ]
- Popular
- Match Winner
- Runs / Totals
- Session / Over Markets
- Specials
- In-Play

[ Main Board ]
- left / main column: grouped live markets
- right / bottom sheet: bet slip

[ Context Rail / Insight Strip ]
- momentum
- wickets in hand
- recent over pattern
- last ball event
```

Desktop:
- sticky top scoreboard
- market board left
- bet slip right

Mobile:
- sticky compact scoreboard
- horizontally scrollable market tabs
- rate grid below
- bet slip as bottom sheet

### 2. Design the React components for the rate fields

Recommended component tree:
- `LiveMatchHeader`
- `LiveScoreboard`
- `MarketTabRail`
- `MarketGroup`
- `RateField`
- `RateGrid`
- `BetSlip`
- `SuspensionOverlay`
- `LivePulseBanner`

`RateField` props:
- `marketKey`
- `selectionKey`
- `price`
- `previousPrice`
- `suspended`
- `lastChangedAt`
- `stateVersion`
- `onSelect`

### 3. Specify the logic for visual indicators without full page rerender

Requirement:
- flash green when odds decrease
- flash red when odds increase
- no full page rerender

Implementation plan:
- subscribe to Phoenix channel in a dedicated match socket hook
- store rate rows in a normalized client store by id
- when `odds_delta` arrives:
  - update only affected rows
  - compare `newPrice` vs `oldPrice`
  - set a transient `deltaDirection`
  - clear after CSS transition timeout

Use:
- React Query or Zustand for canonical client store
- memoized `RateField`
- CSS transitions only
- no JS-heavy animation library

### 4. Plan the Bet Slip component state management

Recommended state fields:
- `selectedOddsId`
- `matchId`
- `marketKey`
- `selectionKey`
- `displayPrice`
- `quotedPrice`
- `stake`
- `potentialReturn`
- `acceptPriceChanges` boolean
- `submissionState`
- `rejectionReason`
- `stateVersion`

Flow:
1. user taps a rate field
2. bet slip opens with quoted odds and state version
3. if market suspends before submit, slip locks immediately
4. on submit, backend validates quote freshness
5. if backend rejects due to state drift, show clear message and refresh quoted price

---

## PHASE 5: Edge Cases & Risk Management

### 1. Plan the logic for Market Suspension

Suspension triggers should include:
- wicket
- review / third umpire uncertainty
- innings break
- super over start
- rain delay / interruption
- provider disconnect
- engine timeout
- state mismatch between provider event and local state

Operational behavior:
- suspend affected markets immediately in Phoenix before calling Python when severity is critical
- show disabled rate fields in the UI
- reject incoming bet requests on suspended markets
- only resume when:
  - LangGraph engine returns valid new lines, and
  - Phoenix persists and publishes the replacement live version

### 2. Define how to handle WebSocket disconnections from Sportmonks

Required behavior:
- if provider disconnects, never leave old live odds bettable

Plan:
- maintain heartbeat timestamp per live match
- if heartbeat exceeds threshold:
  - suspend all live markets for that match
  - broadcast provider-stale state to clients
- retry provider connection with exponential backoff
- if provider recovers:
  - rebuild state from latest available timeline
  - request full reprice from Python
  - then resume markets

Additional risk controls
- circuit breaker for Python engine failures
- maximum price jump thresholds requiring manual review
- audit trail for every live reprice
- replayable event log for post-mortem debugging
- explicit admin override for suspend/resume/manual publish

---

## Recommended Execution Order

1. Introduce state tables and state versioning in Phoenix.
2. Build the internal cricket event normalization layer from Sportmonks payloads.
3. Add market suspension primitives in Phoenix.
4. Build Python FastAPI + LangGraph service with a dummy deterministic engine first.
5. Wire Phoenix -> Python request/response contract.
6. Replace current coarse cricket automation with event-driven repricing.
7. Add delta broadcasts and frontend live-store handling.
8. Upgrade the live match page UI and bet slip.
9. Harden disconnect handling, timeout rules, and stale quote rejection.
10. Only after that, consider deeper market expansion beyond the first in-play families.

## Final Recommendation

Do not replace the existing Elixir AI generation flow immediately.
Use it as a fallback while you introduce the Python LangGraph engine.

Practical migration path:
- keep current `OddsGenerator` and `OddsOrchestrator` for pre-match and manual generation
- add a new dedicated cricket live path for state-aware repricing
- move only live cricket into the new LangGraph engine first
- keep settlement, wallet, and publishing authority in Phoenix

That gives you a safe incremental rollout instead of a full-stack rewrite.
