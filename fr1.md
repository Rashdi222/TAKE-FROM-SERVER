# Exchange-Grade Trading & Fancy Markets Blueprint

Status: Executed through the planned implementation phases. Reviewer hardening, runtime serialization, exposure shading, and fancy market generation are now wired. Remaining work belongs to monitoring/UI refinement rather than the original engine blueprint.

## Purpose

This document defines the next architecture upgrade for the live cricket trading engine so it can move from a structurally correct prototype into a reliable exchange-grade runtime.

This plan focuses on four urgent gaps:

1. the reviewer is not preventing catastrophic price anomalies
2. the live ball-by-ball runtime is not reliably emitting frontend-visible updates
3. the system does not yet price with liability and exposure awareness
4. fancy markets are not yet part of the live board

This document is a plan only. It does not execute implementation.

## Current Reality

The current cricket engine already has important foundations:

- Phoenix -> Python runtime bridge
- per-match memory
- LangGraph node structure
- reviewer node
- live publish and suspend lifecycle

But those foundations are not enough on their own.

The production issues show that:

- the reviewer is still too weak or too late in the pipeline
- the live ingestion loop is not yet guaranteeing clean per-ball repricing and frontend visibility
- no liquidity-aware shading exists yet
- the market set is too narrow for real South Asian cricket trading

The next upgrade must make catastrophic pricing mathematically impossible before it makes the engine more ambitious.

## Phase 1: The Reviewer Rescue

### Goal

Turn the reviewer from a soft checker into a hard trading gatekeeper.

The reviewer must become the final authority before any market can be published, resumed, or emitted to clients.

### Core Principle

The generator may propose.
The reviewer may approve, dampen, retry, or kill.
The generator must never directly control what gets published.

### What Is Wrong Today

The current boardroom has a reviewer node, but the observed production behavior shows one or more of these problems:

- invalid candidate prices are not being hard-killed early enough
- the reviewer may be checking only one dimension, such as jump percentage
- the reviewer does not apply absolute market ceilings/floors strongly enough
- the reviewer may be validating per selection but not per market coherence
- the reviewer does not yet enforce hard mathematical safety rails independent of model output

### New Reviewer Responsibilities

The reviewer must validate four layers before approval:

1. absolute odds bounds
2. relative movement bounds
3. market coherence bounds
4. risk-policy bounds

If any critical rule fails:

- do not publish
- do not resume
- do not emit a fake fallback price as if it were valid
- keep suspended or re-run with corrections

### Hard Mathematical Bounds

These bounds must exist outside the generator and outside the model.

They should be configurable in runtime policy, but the initial production defaults should be strict.

#### Absolute odds ceilings and floors

For core live cricket match markets:

- minimum decimal odds floor: `1.01`
- soft ceiling for standard live selections: `8.00`
- hard kill ceiling for standard live selections: `12.00`

For any candidate above the hard kill ceiling:

- automatic reviewer rejection
- no retry if the proposed value is obviously broken
- market remains suspended
- reason recorded as `reviewer_hard_bound_violation`

The exact soft and hard ceilings can vary by market family later, but the first version must be conservative.

#### Maximum jump percentages

Two comparisons are required:

1. current published price vs proposed price
2. previous approved probability vs proposed probability

Initial controls:

- soft jump threshold: `8%`
- retry threshold: `12%`
- hard reject threshold: `20%`

Behavior:

- `<= 8%`: normal review
- `> 8% and <= 12%`: reviewer may dampen or approve only if justified by strong event context
- `> 12% and <= 20%`: force retry with explicit correction feedback
- `> 20%`: hard reject or keep suspended unless the event type is a whitelist critical event

### Critical Event Exceptions

Not all large jumps are wrong.

Some event types are structurally allowed to move sharply:

- wicket
- boundary streak
- over completion near target edge
- innings break
- chase collapse or chase surge

But even for these events:

- the reviewer must still enforce absolute hard ceilings
- the reviewer must still check market coherence
- the reviewer must require an event justification tag

### Market Coherence Checks

The reviewer must check the full market, not just one selection.

For example:

- match winner selections must produce sane implied probability totals after margin
- over/under pairs must remain balanced
- in-play directional selections must not contradict current state

Examples of automatic rejection:

- both sides drifting in the same irrational direction
- implied probabilities summing to a broken total
- over and under lines inconsistent with the current innings state
- fancy line worse than a simpler parent market in a mathematically inconsistent way

### Generator Retry Contract

The retry loop must become explicit.

If the reviewer rejects but allows retry, it must return:

- rejection reason codes
- exact failed checks
- acceptable target correction envelope

Example feedback:

- proposed odds exceed soft ceiling
- movement exceeds allowed jump from previous approved state
- revise into probability band `0.53 - 0.58`

The generator must then re-run inside that envelope, not re-run blindly.

### Final Reviewer States

The reviewer should produce only these final states:

- `approve`
- `approve_with_dampening`
- `reject_and_retry`
- `reject_and_keep_suspended`

No other path should lead to publication.

### Dampening Layer

Before hard rejection, the reviewer should be able to dampen the candidate toward a safe anchor.

Anchors:

- previous approved board
- current provider baseline if present
- prior memory-adjusted probability

This dampening makes the board more stable and avoids avoidable suspensions.

### Observability

Every reviewer decision must be traceable with:

- trace id
- event type
- proposed price
- approved price
- failed checks
- dampening applied or not
- final decision

This must be visible in admin tooling later, but the immediate priority is getting it into persisted metadata first.

## Phase 2: The Continuous Ball-by-Ball Runtime Fix

### Goal

Guarantee that each meaningful ball event causes a real repricing run and that the new board reaches the frontend without stalling.

### Current Problem

The system claims to be event-driven, but production symptoms show that the runtime chain is not reliably completing:

- provider event or score changes arrive
- repricing sometimes does not trigger or complete
- frontend does not visibly update in a seamless ball-by-ball way
- there may be stale state skips, queue races, or socket payload failures

### End-to-End Chain That Must Be Reliable

The live pipeline must be treated as one critical path:

1. SportMonks live payload received
2. event normalized
3. match state updated
4. event stored
5. routing decision produced
6. graph run started
7. reviewer decision returned
8. markets persisted
9. match resumed or suspended
10. websocket event emitted
11. frontend store updates instantly

If any one of those steps is weak, the runtime feels stalled.

### Required Runtime Guarantees

#### 1. Event identity guarantee

Every live ball or event must carry a strict event identity:

- `match_id`
- `state_version`
- `event_seq`
- provider event id if available

This allows:

- deduplication
- stale update rejection
- deterministic debugging

#### 2. Mandatory repricing triggers

The routing layer must explicitly trigger repricing for:

- every legal ball
- wicket
- boundary
- over completion
- innings break
- chase target state change

Not every update needs a full market recalculation, but every meaningful event must at least enter the routing decision path.

The decision layer should classify events into:

- `full_reprice`
- `partial_reprice`
- `no_reprice`

But the classification must be explicit and observable.

#### 3. Single-match serialization

For a given `match_id`, graph runs must not race uncontrolled.

Each live match should have a serialized execution lane:

- either one job at a time
- or a queue that coalesces redundant state updates

This prevents:

- old ball results overwriting newer ball results
- double publications
- socket noise

#### 4. Coalescing policy

If multiple updates arrive very quickly, the system should not blindly run every stale state.

Instead:

- keep the newest state
- drop superseded queued states
- process the highest state version / event sequence next

This preserves latency while staying current.

#### 5. Timeout and recovery policy

Each graph run needs:

- strict timeout
- retry strategy for transient engine unavailability
- suspension-on-failure behavior

If the graph stalls:

- the market must stay safely suspended
- the next valid event must be able to recover the board

#### 6. Frontend emission guarantee

Phoenix must broadcast only JSON-safe, client-consumable payloads.

The current production issues already showed Decimal leaks in channel payloads.

The upgraded runtime should ensure:

- market persistence and broadcast occur as one clean post-review step
- broadcasts use a standardized JSON-safe serializer
- frontend stores receive only normalized values

#### 7. Latency budget

The live loop must define explicit timing targets.

Example operational budget:

- provider ingest + normalize: `< 100ms`
- Phoenix route + persist event: `< 100ms`
- graph run + review: `< 500ms`
- persist + broadcast: `< 150ms`
- frontend render update: `< 300ms`

The exact numbers may change later, but the runtime must have a target budget or it cannot be tuned professionally.

### Verification Plan

To prove the runtime later, every ball should be traceable across:

- provider ingest time
- event store time
- graph start time
- reviewer decision time
- publication time
- websocket broadcast time

This allows the team to identify where “ball-by-ball not updating” is actually failing.

## Phase 3: The Liquidity & Exposure Agent Integration

### Goal

Inject a real liability-aware layer into the trading boardroom before final approval.

The pricing engine must stop acting like a pure probability calculator and start acting like a bookmaker or exchange risk engine.

### What Is Missing Today

Current pricing logic mostly considers:

- state context
- event context
- prior board
- jump thresholds

It does not yet consider:

- actual book liability
- directional exposure
- max acceptable loss by market
- shading to slow lopsided action

That means the engine may publish mathematically plausible rates that are commercially dangerous.

### New Agent Or Layer

Add a dedicated liability/exposure stage between generation and final review.

Suggested role:

- `Exposure Manager`

Shared-state inputs:

- current open bets by market and selection
- potential payout by market and selection
- user concentration risk
- operator exposure policy
- prior approved odds

Outputs:

- exposure summary
- shading recommendations
- max allowed movement envelope
- market-specific risk flags

### First Version Scope

The first release does not need full exchange-matching sophistication.

It does need controlled directional shading.

That means:

- if one side is overexposed, shorten that side modestly
- lengthen the opposing side within safe bounds
- never break reviewer safety constraints while doing so

### Liability Inputs

The system will eventually need live aggregated risk metrics such as:

- total stakes on selection
- total potential payout on selection
- net liability by market
- liability delta since last approval

These values should be computed in Phoenix and passed into Python as part of the graph request.

Phoenix remains the source of transactional truth.
Python remains the pricing and review boardroom.

### Exposure Shading Rules

The initial shading model should be deterministic and bounded.

Example:

- low liability imbalance: no shading
- medium imbalance: small probability shift
- high imbalance: moderate shift plus tighter reviewer thresholds
- critical imbalance: keep market suspended or force a defensive line

The shading should happen before final reviewer approval, not after publication.

### Reviewer Integration

The reviewer must validate not only the raw generator output, but also the exposure-adjusted output.

The reviewer must reject if:

- exposure shading is too aggressive
- exposure shading breaks market coherence
- exposure shading creates a worse anomaly than the original proposal

### Long-Term Direction

Later phases can expand this into:

- user-segment weighting
- correlated-market exposure control
- session and fancy exposure aggregation
- event-driven risk tightening during volatile phases

But the first version should focus on safe directional shading.

## Phase 4: The Fancy Play Generator

### Goal

Add South Asian-style fancy markets to the live engine in a way that is stateful, safe, and separate from core match markets.

### What Fancy Markets Mean Here

The first target is session-style cricket fancy markets such as:

- runs in next 6 overs
- runs in next 10 overs
- runs in next 15 overs
- runs in next 20 overs

These should emit Yes/No style lines or Back/Lay style quotes depending on the product presentation layer.

### Why Hyper Context Matters

Fancy pricing cannot rely only on the latest ball.

It must consider:

- wicket history
- batting acceleration pattern
- death over phase
- run rate trend
- batting depth
- boundary rate
- recent dot ball pressure

That is exactly why the SQLite match memory exists.

### New Generator Layer

Add a separate fancy pricing stage after the core context stage.

Suggested role:

- `Fancy Generator`

This should be independent from the main match winner generator.
It can share memory and state, but it must not be forced into the same output shape.

### Fancy State Inputs

The fancy generator should consume:

- current innings
- current over
- current ball
- current runs
- wickets
- current run rate
- recent ball pattern
- boundary frequency
- wickets-in-cluster indicator
- prior session projection from memory

### Fancy Output Shape

Fancy markets should be emitted as a separate payload section:

- `fancy_markets`

Each fancy market should include:

- market key
- window label
- projected line
- yes price
- no price
- confidence
- validity window
- trace or reasoning metadata

This keeps fancy markets separate from core markets like:

- match winner
- over/under
- in-play specials

### Fancy Review Rules

Fancy markets must have their own reviewer checks, because fancy pricing is more volatile.

Additional controls should include:

- line movement cap by over phase
- no line emission if innings context is unstable
- auto-suspend fancy family on cluster wickets
- stronger dampening near innings transitions

### Fancy Publication Strategy

Fancy markets should be treated as a separate market family.

That means:

- they can be suspended independently
- they can be resumed independently
- they can later have different automation policies from core markets

### Recommended Delivery Order

Fancy should only be activated after:

1. reviewer hardening is done
2. runtime is visibly stable per ball
3. core market anomaly control is proven

Otherwise fancy markets will multiply instability.

## Execution Order Recommendation

The phases should be implemented in this order:

1. reviewer rescue
2. continuous ball-by-ball runtime repair
3. liability and exposure integration
4. fancy market generation

This order matters.

If anomaly control is not solved first, adding liability and fancy logic only increases risk.

## Success Criteria

This blueprint is successful only if all of the following become true:

- absurd live rates are mathematically impossible to publish
- every meaningful live ball results in a deterministic repricing decision
- frontend sees clean live board updates without silent stalls
- the board begins to account for liability and exposure
- fancy markets are emitted through a controlled and reviewable path

## Final Position

The engine should evolve from:

- stateful prototype with partial review

Into:

- exchange-grade live trading runtime with hard reviewer vetoes, stable ball-by-ball flow, exposure-aware shading, and separate fancy market generation

That upgrade must begin with hard safety rails, not with market expansion.
