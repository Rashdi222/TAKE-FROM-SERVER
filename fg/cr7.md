# Cricket Engine Upgrade Architecture Blueprint - `cr7`

## 1. Purpose

This document is the architecture blueprint for upgrading the current live cricket pricing engine from a partially state-aware prototype into a true production-grade, stateful, multi-agent LangGraph system.

This document does **not** implement code.
It defines the execution plan to fix these four audited flaws:

1. API key and model configuration disconnect
2. no true per-match memory / checkpointer
3. fake multi-agent graph instead of a real validator/reviewer loop
4. unreliable lifecycle boot when matches transition into live state

The goal is to make the cricket engine:
- configuration-correct
- match-memory-aware
- truly multi-agent
- operationally reliable from live activation onward

---

## 2. Current Audit Summary

### 2.1 What the current system already does

The current system already has useful foundations:
- Phoenix ingests match/live state
- Phoenix can suspend markets and request repricing
- Phoenix can call the Python engine
- Python returns a structured odds payload
- Phoenix can publish platform odds and resume the market
- there is already a LangGraph-shaped pipeline in Python

That means this is not a greenfield design.
We are upgrading an existing runtime, not inventing one from zero.

### 2.2 What is architecturally wrong right now

#### A. Config disconnect
The Python cricket engine currently reads local environment variables such as:
- `GOOGLE_API_KEY`
- `GOOGLE_GENAI_MODEL`

Meanwhile, the Super Admin dashboard writes model/key settings into the Elixir settings store using:
- `openrouter_api_key`
- `openrouter_active_model`

These are two different sources of truth.
That is unacceptable for production operations.

#### B. No true long-lived match memory
The Python cricket graph currently prices from the current request payload plus current odds baseline.
It does not have a durable match-level memory model that can answer questions like:
- Was a wicket taken 8 balls ago?
- Did momentum collapse over the last 2 overs?
- Has the chasing side missed three overs of acceleration?
- Are we in a post-break repricing state?

That means the engine is context-aware only in a shallow request-level sense.

#### C. Not a true multi-agent system yet
The current Python graph is effectively a linear pricing pipeline:
1. context analyzer
2. odds generator
3. risk margin manager

That is still one assembly line.
It is not a boardroom where a reviewer can reject bad output and force a recalculation.

#### D. Lifecycle fragility
Current live pricing can work when manually forced, but the transition into live state is still too fragile.
There are cases where:
- the AI engine is not actually running
- the first live pricing request does not happen reliably
- the match remains suspended without published rates

That means the lifecycle is not fully operationally safe.

---

## 2.3 Cricket Isolation Boundary

This upgrade plan is explicitly **cricket-only**.

It must not be implemented as a generic cross-sport live engine refactor.
The following isolation rules apply:
- cricket LangGraph logic must remain separate from football logic
- cricket event semantics must not be forced onto football/tennis/racing flows
- cricket memory/checkpointer state must be keyed and stored in a cricket-specific runtime path
- cricket reviewer rules must be defined around cricket-specific volatility and market behavior
- cricket lifecycle boot/resume rules must not silently mutate other sports' live pipelines

If shared utilities are introduced, they must remain at the infrastructure layer only, for example:
- HTTP client helpers
- tracing helpers
- generic health-check helpers
- generic task supervision helpers

But the following must remain sport-specific:
- live state interpretation
- event routing
- suspension reasons
- repricing logic
- reviewer veto logic
- market family emission

This keeps cricket upgrades from contaminating football or other sports that have different state models and trading rules.

---

# Phase 1: The Config Bridge

## 3. Objective

Make Phoenix the single source of truth for all live cricket AI configuration.
The Python service must stop depending on local model/key assumptions as the primary runtime source.

This includes:
- API key
- provider selection
- active model
- optional fallback model
- house margin profile
- risk profile flags
- timeout profile

## 4. Correct design principle

The Super Admin settings page must remain the control plane.
Phoenix owns the platform configuration.
Python is a stateless or semi-stateful compute service, not a separate configuration authority.

That means:
- Phoenix resolves the settings
- Phoenix decides what model/key/policy should be used
- Python receives those values as part of the pricing request or via a signed internal config contract

## 5. Recommended design: Phoenix-pushed runtime config per request

### 5.1 Primary approach
For every cricket repricing call, Phoenix should send Python a `runtime_config` object inside the pricing payload.

This `runtime_config` should include:
- `provider`: `openrouter`
- `api_key_ref`: not raw database storage, but a resolved secure runtime token or actual secret if internal-only trusted environment is acceptable
- `model`: resolved active model from Super Admin settings
- `fallback_model`: optional
- `house_margin_profile`
- `risk_profile`
- `max_price_jump_threshold`
- `request_timeout_ms`
- `llm_enabled`

### 5.2 Why Phoenix-push is better than Python-pull
Python-pull would mean the Python service has to:
- call Phoenix or query the DB
- authenticate
- cache config
- handle stale config invalidation

That creates a second distributed control path.
It adds failure modes.

Phoenix-push is simpler and safer because:
- Phoenix already owns the settings
- Phoenix already creates the pricing request
- config is snapshotted with the request
- request logs and engine logs can be correlated exactly with the config used at that moment

## 6. Secure secret handling design

### 6.1 Security decision
The Python service is an internal trusted service in the same operator environment.
So there are two acceptable designs:

#### Option A. Pass raw resolved API key in request payload
Use only if:
- service is strictly local/private
- traffic never leaves trusted internal network
- Phoenix and Python are same-host or private-only

Pros:
- simplest
- no config fetch latency

Cons:
- key exists in request payloads and possibly logs if mishandled

#### Option B. Pass a short-lived signed config token or config bundle id
Phoenix stores a short-lived runtime bundle and passes Python a token/reference.
Python resolves it through a protected internal endpoint.

Pros:
- stronger secret hygiene

Cons:
- more moving parts
- more failure paths

### 6.2 Recommended choice for this project
Start with **Option A**, but with strict log redaction.
Reason:
- faster to stabilize
- simpler operationally
- easier to debug

Then later harden to Option B if needed.

## 7. Config resolution logic in Phoenix

Phoenix should resolve the cricket engine configuration in one place only.
Add one dedicated internal config resolver for live cricket pricing.

Responsibilities of that resolver:
- read `openrouter_api_key`
- read `openrouter_active_model`
- read any cricket-specific override settings if later added
- validate values are present
- produce a normalized config bundle for Python

It must also define behavior when settings are missing.

### 7.1 Failure behavior when config is missing
If required config is missing:
- Phoenix must **not** call Python in “LLM mode”
- Phoenix must either:
  - call Python with `llm_enabled=false` and allow deterministic fallback
  - or keep the market suspended with explicit reason `ai_config_unavailable`

This decision should be a platform policy toggle.

Recommended initial policy:
- allow deterministic fallback if AI config is missing
- but mark the run source clearly as `deterministic-fallback`

## 8. Required observability for the config bridge

Every live reprice request should persist or log:
- `match_id`
- `state_version`
- `engine_trace_id`
- `config_provider`
- `model_name`
- `llm_enabled`
- `fallback_used`

That makes post-incident analysis possible.

---

# Phase 2: The LangGraph Checkpointer (Hyper Context)

## 9. Objective

Give the cricket engine persistent, match-bound memory so every pricing decision can use deep historical context instead of only the latest ball snapshot.

## 10. Definition of Hyper Context

Hyper Context means the engine should know not only the current scoreboard but also:
- recent wicket cadence
- recent over pattern
- boundary drought or acceleration
- partnership build or collapse
- innings phase shift
- previous suspension/reprice events
- prior engine conclusions if still relevant

This memory must be tied to `match_id`.

## 11. Checkpointer design options

### Option A. In-memory only
Pros:
- simple
- low latency

Cons:
- lost on process restart
- not replayable
- not production-safe

### Option B. SQLite checkpointer
Pros:
- easy local persistence
- simple to adopt with LangGraph tools

Cons:
- weaker fit for multi-worker or host restarts in larger deployment

### Option C. PostgreSQL-backed persistence
Pros:
- already part of platform
- consistent with Phoenix state records
- replayable and durable
- production-friendly

Cons:
- slightly more implementation effort

## 12. Recommended choice

Use **PostgreSQL-backed persistent match memory**.

Reason:
- Phoenix already uses Postgres
- live betting is a financial system
- replayability and durability matter more than convenience
- match memory must survive restarts

## 13. Memory model design

Memory should be stored at two levels:

### 13.1 Event log level
Use existing event/state persistence in Phoenix as the canonical event history:
- `match_live_events`
- live fields on `matches`
- optional future `match_state_snapshots`

Phoenix remains the source of truth for raw event history.

### 13.2 AI memory level
Python should maintain checkpointer state keyed by:
- `thread_id = match_id`

That state should contain:
- recent overs pattern
- wicket pressure state
- acceleration/collapse state
- contextual priors
- recent repricing decisions
- recent reviewer flags
- recent suspension reasons

The AI memory is not the canonical truth ledger.
It is an optimized reasoning memory derived from the canonical Phoenix state.

## 14. How memory should be populated

### 14.1 On every reprice
Phoenix sends:
- latest event
- latest match state
- recent history window

Python updates the checkpointer memory for that `match_id`.

### 14.2 On cold start / recovery
If Python has no prior memory for a match:
- Phoenix should send a `history_window` block
- for example recent 12 balls, recent suspension events, current innings summary

That lets Python rebuild context quickly.

## 15. What should be in the `history_window`

Recommended payload section from Phoenix:
- `recent_balls`: last 12 to 18 balls
- `recent_event_types`
- `recent_runs_pattern`
- `recent_wickets`
- `partnership_runs`
- `innings_phase`
- `last_suspension_reason`
- `last_reprice_at`
- `last_published_odds`

This is the minimum context required for a real in-play engine.

## 16. Memory reset rules

The memory for a `match_id` should be cleared or frozen when:
- match ends
- match is settled
- match is cancelled
- super over begins and the platform chooses a fresh state branch

The reset policy must be explicit, not accidental.

## 17. Operational requirements for the checkpointer

The checkpointer must support:
- per-match isolation
- replay safety
- process restart recovery
- debug inspectability

It must also expose trace metadata so the operator can answer:
- what context did the model see?
- what prior state influenced this output?

---

# Phase 3: The True Multi-Agent Boardroom (Full Optimization)

## 18. Objective

Replace the linear “assembly line” graph with a real boardroom model where multiple specialized roles share state and the reviewer can veto weak output.

## 19. Shared State Boardroom principle

All agents operate over one shared graph state.
No agent works blindly.
No agent is allowed to assume hidden context.

Shared graph state should contain:
- current match state
- recent event history
- memory snapshot
- current provider/reference odds if any
- previous platform odds
- reviewer flags
- suspension state
- confidence scores
- audit notes

## 20. Required agent roles

### 20.1 The Context Manager

Responsibilities:
- ingest the latest ball/event from Phoenix
- merge it with checkpointer memory
- compute the updated shared context package
- classify innings phase and pressure state
- expose recent patterns to downstream agents

Inputs:
- latest event
- canonical match state
- history window
- checkpointer state

Outputs:
- normalized shared context
- derived indicators such as:
  - wickets in hand pressure
  - chase pressure
  - acceleration trend
  - recent over volatility

This is the brain’s memory-and-context steward.

### 20.2 The In-Play Generator

Responsibilities:
- calculate the raw mathematical/probability proposal
- focus entirely on pricing logic
- produce candidate prices before margin/risk enforcement

It should use:
- shared context from Context Manager
- current board state
- optional provider reference odds if future hybrid cricket mode is ever introduced

Outputs:
- raw market proposals
- confidence estimate
- rationale summary

Important rule:
- the Generator proposes
- it does not get final authority

### 20.3 The Reviewer / Risk Manager

Responsibilities:
- audit Generator output
- reject implausible moves
- enforce house margin
- enforce volatility thresholds
- veto dangerous or incoherent updates
- optionally send the graph back for a second generation pass

This is the actual difference between a prototype and a production betting engine.

Reviewer checks must include:
- price jump threshold checks
- implied probability sanity
- consistency across related markets
- suspension requirements after critical events
- whether confidence is too low for resume
- whether output conflicts with recent context

The Reviewer must be able to return one of three decisions:
1. `approve`
2. `reject_and_retry`
3. `reject_and_keep_suspended`

This is the missing boardroom role today.

### 20.4 The Rate Emitter

Responsibilities:
- convert approved output into exact Phoenix response schema
- normalize decimals/labels/market keys
- include trace and reviewer metadata

This agent does not think.
It formats and emits.

Required payload content:
- `match_id`
- `state_version`
- `engine_trace_id`
- `model`
- `markets`
- reviewer outcome metadata
- confidence metadata
- validity window

## 21. Graph flow design

Recommended graph structure:

1. `Context Manager`
2. `In-Play Generator`
3. `Reviewer / Risk Manager`
4. conditional branch:
   - if approved -> `Rate Emitter`
   - if reject_and_retry -> loop back to `In-Play Generator` with reviewer notes
   - if reject_and_keep_suspended -> end with rejected state
5. `Rate Emitter`
6. end

This is the real boardroom loop.

## 22. Loop policy

The graph must not loop endlessly.
Set explicit retry cap:
- max 1 or 2 retries per event

If still rejected after retry cap:
- return a failure decision to Phoenix
- keep market suspended
- mark run as `manual_admin_review` if required

## 23. Reviewer veto rules

At minimum, reviewer must reject or escalate when:
- implied probability jump exceeds allowed threshold
- two-way market sums are incoherent
- market family outputs contradict each other
- confidence is below minimum threshold for reopening
- event is critical and full confidence has not recovered

This makes the reviewer a true governance layer, not a cosmetic node.

## 24. Shared state content required for true optimization

The boardroom shared state should include:
- `match_id`
- `state_version`
- `latest_event`
- `recent_ball_history`
- `innings_context`
- `momentum_state`
- `wicket_pressure`
- `recent_boundaries`
- `current_board_prices`
- `previous_engine_output`
- `reviewer_notes`
- `retry_count`

Without this, the graph is still shallow.

---

# Phase 4: The Lifecycle Fix

## 25. Objective

Make live cricket repricing boot reliably the exact second a match goes live or the first actionable ball/event arrives.

## 26. Current lifecycle weakness

Today there are too many fragile points:
- Python service may not be running
- initial live activation may not produce a board
- first reprice can be missed
- suspension may remain even if state is live

That is an orchestration issue, not just a model issue.

## 27. Required lifecycle model

There are three distinct triggers that must be handled correctly:

### Trigger A. Match transitions `upcoming -> live`
Phoenix must:
- mark match live
- suspend market immediately for safe boot
- build initial state payload
- request initial full-board reprice
- only resume after approved rates are persisted

This is the official live activation path.

### Trigger B. First meaningful ball/event arrives
If for any reason the match is live but no board exists yet:
- first event should force the same safe initialization path
- this is the recovery boot path

### Trigger C. Ongoing live events
Once initialized:
- every significant ball/event should flow through the normal state-aware reprice path

## 28. Phoenix lifecycle responsibilities

### 28.1 On live activation
The Phoenix side should do these steps atomically in sequence:
1. transition match status to `live`
2. set `in_play_enabled=true`
3. mark board suspended with activation reason
4. create or synthesize the activation event record
5. call Python with full state and history window
6. if approved response received:
   - persist odds
   - clear suspension
   - broadcast resume
7. if failure:
   - keep suspended
   - set explicit reason

### 28.2 On first ball after live activation
If no published platform odds exist yet:
- treat it as a bootstrap event
- do not assume the board already exists

This prevents “live but no odds” state drift.

## 29. Heartbeat and engine readiness integration

The lifecycle must also incorporate service readiness.

### 29.1 AI engine readiness
Before using Python for a live initialization path:
- Phoenix should have a lightweight readiness check or cached health state
- if engine is down:
  - keep market suspended
  - set explicit reason like `ai_engine_unavailable`

### 29.2 Provider heartbeat
If provider heartbeat is stale:
- do not auto-resume just because status says live
- require fresh state and fresh repricing first

## 30. Startup contract

The operational startup contract should be:
- `./s.sh` starts Python, Phoenix, and Next.js together for local dev
- production startup should also define ordering/health dependencies
- Phoenix should not silently assume Python is available

## 31. Resume policy

A live cricket market should only resume when all of these are true:
- match state version matches request/response
- reviewer approved output
- odds persisted successfully
- provider heartbeat not stale
- no active critical suspension reason remains

This ensures live activation is not only fast, but safe.

---

## 32. Recommended Execution Order

This is the correct implementation sequence after this blueprint is approved.

### Step 1. Config Bridge
- make Phoenix the single source of truth for live cricket model/key settings
- stop treating Python env vars as the primary runtime control plane

### Step 2. Persistent Match Memory
- add the cricket checkpointer design bound to `match_id`
- define history-window contract from Phoenix to Python

### Step 3. Replace linear graph with true boardroom graph
- Context Manager
- In-Play Generator
- Reviewer / Risk Manager
- Rate Emitter
- retry loop

### Step 4. Harden live activation lifecycle
- guaranteed safe boot when match becomes live
- guaranteed first-board publication or explicit safe suspension

### Step 5. Add observability
- trace id
- config snapshot
- reviewer outcomes
- reason for keep-suspended decisions

---

## 33. Final Architectural Summary

After this upgrade, the cricket engine should behave as follows:

- Super Admin dashboard is the single source of truth for model/key selection
- Phoenix resolves and passes live runtime config to Python
- Python keeps per-match memory tied to `match_id`
- the graph becomes a real boardroom, not just a linear pipeline
- the Reviewer can veto unsafe prices and force retry or keep-suspended outcomes
- live activation becomes deterministic and safe
- the system becomes truly state-aware across the match timeline, not only the latest ball snapshot

That is the correct path from the current prototype-level live cricket engine to a production-grade cricket orchestrator.
