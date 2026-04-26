# Multi-Source Aggregation Architecture

## Objective Overview
This document defines the target architecture for a multi-source live sports aggregation platform where multiple isolated Rust workers scrape external exchanges concurrently, publish raw updates into Redis, and an Elixir/Phoenix backend acts as the arbiter. The Elixir layer is responsible for canonical entity reconciliation, conflict resolution, suspension enforcement, and delivery of a single normalized live payload to the Next.js frontend.

The design goals are:
- keep scraper failures isolated
- prevent frontend flicker from conflicting upstream updates
- enforce strict market safety rules
- support gradual expansion from one provider to many without rewriting the frontend contract

---

## System Topology

### Ingestion Layer
- Each external source runs as an isolated Rust worker process or container.
- Each worker publishes raw updates into Redis Streams.
- Each stream is source-scoped and sport-scoped.
- Example stream names:
  - `odds:football:provider_a`
  - `odds:football:provider_b`
  - `score:football:provider_a`
  - `score:tennis:provider_c`

### Arbiter Layer
- Elixir consumes Redis Streams via supervised stream consumers.
- Elixir normalizes raw payloads into a common internal event envelope.
- Elixir resolves source-specific match IDs into one canonical match identity.
- Elixir applies consensus rules across providers.
- Elixir writes the consolidated state into the main datastore and broadcasts stable channel events to the frontend.

### Delivery Layer
- Phoenix Channels and REST endpoints expose only canonical match state.
- Next.js never reads provider-specific payloads directly.
- The frontend only consumes:
  - canonical match id
  - canonical score/state
  - canonical market state
  - normalized suspension status
  - provenance metadata if needed for audit/debug panels

---

## 1. ID Reconciliation (The Matchmaker)

## Canonical Match Identity
A single canonical match row must exist before multi-source arbitration becomes reliable. One source should be designated as the anchor source for match identity creation. In most systems this is the strongest structured feed, not necessarily the fastest odds feed.

Recommended canonical identity inputs:
- sport
- competition / league
- season
- start time
- home team canonical id
- away team canonical id
- optional stage / round metadata

The canonical match id should be internal and immutable.

## Why fuzzy matching alone is not sufficient
Pure fuzzy matching on team names is not reliable enough in production. It will fail on:
- abbreviations
- reserve / women / youth teams
- swapped home-away conventions
- transliteration differences
- duplicated fixtures in cups / two-leg ties
- bookmaker-specific naming noise

Fuzzy matching may be used as a candidate generator, but not as the final authority for ambiguous cases.

## Recommended reconciliation model
Use a two-layer model.

### Layer A: canonical mapping table
Create a persistent mapping table in Elixir/Postgres with one row per external source match mapping.

Recommended table shape:
- `canonical_match_id`
- `source_name`
- `source_match_id`
- `confidence`
- `mapping_status`
  - `auto_confirmed`
  - `needs_review`
  - `manual_confirmed`
  - `rejected`
- `matched_via`
  - `anchor_id`
  - `exact_metadata`
  - `fuzzy_candidate`
  - `manual_admin`
- `home_team_score`
- `away_team_score`
- `kickoff_delta_seconds`
- timestamps

This table becomes the long-lived source-of-truth for cross-provider reconciliation.

### Layer B: candidate generation and review pipeline
When a new source match arrives that is not yet mapped:
- first try exact structural matching:
  - same sport
  - same normalized league
  - kickoff within a strict tolerance window
  - both teams resolved through canonical team aliases
- if exact matching fails, run fuzzy candidate generation:
  - normalized team names
  - alias dictionary
  - transliteration map
  - token similarity
  - kickoff proximity
- if confidence is above a strict threshold and there is only one strong candidate, mark `auto_confirmed`
- if ambiguity remains, mark `needs_review`

## Team identity resolution
Do not reconcile matches before team identity normalization exists.

Recommended supporting tables:
- `canonical_teams`
- `team_aliases`
  - `source_name`
  - `source_team_name`
  - `canonical_team_id`
  - `confidence`
  - `manual_override`

This reduces future match reconciliation errors dramatically.

## Admin-driven reconciliation
Yes, an admin-driven mapping table is required.

Reason:
- some markets are too high-risk for automatic fuzzy acceptance
- once a bad mapping is accepted, scores and odds from unrelated events can contaminate the canonical live board

Recommended admin UI actions:
- approve suggested match mapping
- reject candidate
- force-map source match to canonical match
- split wrongly merged mapping
- lock mapping to prevent future auto-overwrite

## Final recommendation for reconciliation
Use:
- canonical mapping table as the authority
- fuzzy logic only as candidate generation
- admin review for ambiguous cases
- never use live team-name fuzzy matching alone as the runtime arbiter

---

## 2. The Elixir Consensus Engine

## Core principle
The Elixir arbiter should not pick a source globally. It should decide consensus independently per domain:
- score state
- clock / period state
- market suspension state
- market price state
- market settlement/closure state

Different providers can be authoritative for different parts of the same match state.

## Normalized event envelope
Every incoming source update should be converted into an internal envelope like:
- `canonical_match_id`
- `source_name`
- `source_match_id`
- `domain`
  - `score`
  - `clock`
  - `market`
  - `suspension`
  - `lifecycle`
- `source_event_time`
- `ingested_at`
- `source_sequence` if available
- `market_key`
- `selection_key`
- `state_hash`
- normalized payload

This allows domain-specific arbitration instead of monolithic last-write-wins behavior.

## Source-of-truth policy
Use a weighted consensus model.

Recommended static inputs per source:
- reliability score
- latency score
- market depth score
- clock accuracy score
- historical mismatch rate
- ban / degradation state

Recommended per-domain priority:
- `score` / `clock`
  - strongest structured live score feed wins
- `suspension`
  - strict union rule, described below
- `price`
  - best valid latest price from trusted active sources
- `market closure`
  - closure beats open state if confidence and freshness threshold is met

## Strict Suspension First rule
This must be immediate and global at the market level.

Rule:
- if any trusted source reports a market as `suspended`, Elixir marks that canonical market as `suspended` immediately
- Elixir should not wait for consensus from slower sources
- frontend lock must happen on first valid suspension signal

Reason:
- in live betting, open-while-actually-suspended is a financial risk
- false suspension is safer than false openness

Recommended suspension model:
- canonical market state stores:
  - `status: :active | :suspended | :closed`
  - `suspension_sources`
  - `suspension_started_at`
  - `suspension_reason`
- resume rule:
  - do not resume on a single source claiming active again
  - require either:
    - a quorum of trusted active confirmations, or
    - a minimum cool-down window plus strongest-source active confirmation

This prevents rapid suspend/resume flicker.

## Conflict resolution for price updates
When Provider A and Provider B disagree on price at nearly the same moment:
- discard any update older than the current canonical watermark for that market if it is outside the jitter tolerance window
- compare source freshness, source trust score, and source sequence if available
- prefer:
  1. higher sequence
  2. newer source event time
  3. lower ingest lag
  4. higher source reliability

Do not blindly last-write-wins on arrival time alone.

## Latency jitter handling
To prevent flicker from slow workers:
- maintain per-source watermarks for each match and market
- compute `ingest_lag_ms = ingested_at - source_event_time`
- reject or downgrade updates that are stale relative to the current canonical version beyond a tolerance window

Recommended jitter strategy:
- keep a short arbitration buffer, for example 150ms to 400ms, for price conflicts
- do not buffer suspensions; apply them immediately
- only buffer reopen/resume transitions slightly if needed

This yields:
- immediate safety locks
- stable price presentation
- less oscillation from out-of-order packets

## Canonical versioning
Every accepted canonical update should increment:
- `match_state_version` for score/clock changes
- `market_version` per market family
- `selection_version` if needed for high-frequency price diffs

The frontend should only react to canonical versions, not raw source updates.

## Outdated slower scraper behavior
If a slower scraper sends a valid but older price:
- do not overwrite the current canonical state
- record it for audit/health metrics
- optionally mark that source as degraded if repeated

This avoids UI flicker and rollback artifacts.

## Score conflict policy
For score conflicts:
- prefer the most trusted structured live feed
- require monotonic sanity checks
- reject impossible regressions without explicit correction markers

Examples of rejection:
- cricket wickets decreasing without correction event
- football score moving backwards without VAR/correction context
- innings/period moving backwards without restart/correction signal

## Auditability
The arbiter must persist a consensus audit trail.

Recommended persisted fields:
- canonical decision id
- losing source payloads
- winner source
- rejection reason
- jitter/drop classification
- suspension trigger source

This is required for debugging trading incidents.

---

## 3. Worker Node Isolation

## Isolation principle
Each Rust scraper must be independently deployable, restartable, and discardable.
One scraper crashing or getting banned must not affect:
- other scrapers
- Redis availability
- Elixir arbiter stability
- frontend delivery

## Deployment model
Recommended unit of isolation:
- one process or one container per source adapter
- optionally one process per source x sport if the source is large enough

Example:
- `scraper_provider_a_football`
- `scraper_provider_b_tennis`
- `scraper_provider_c_football`

This prevents one source schema failure from taking down the entire scrape fleet.

## Worker responsibilities
Each Rust worker should only do:
- source login / anti-bot session management
- HTML/API scraping
- source-specific parsing
- normalization into a raw source envelope
- publish to Redis Streams
- heartbeat and self-health reporting

Each worker should not do:
- cross-source reconciliation
- canonical ID matching
- final consensus
- frontend-specific formatting

That logic belongs in Elixir.

## Failure containment
Each worker must have:
- local retry logic with caps
- circuit breaker per source endpoint
- schema parse failure counters
- heartbeat publishing
- kill-safe restart behavior

If a source changes JSON schema or Cloudflare blocks the worker:
- the worker should emit health events into Redis
- mark itself degraded
- back off exponentially
- avoid poisoning Redis with malformed data

## Redis contract
Use separate Redis Streams or separate consumer groups per worker domain.

Recommended additional control streams:
- `health:scrapers`
- `alerts:scrapers`
- `deadletter:scrapers`

Malformed or unprocessable source payloads should go to dead-letter streams, not the main live stream.

## Elixir resilience against worker failure
Elixir should treat workers as optional contributors, not required dependencies.

Recommended behavior:
- if `scraper_A` dies, canonical state continues from `scraper_B` and `scraper_C`
- if all scrapers for a source domain die, the market can degrade into:
  - `stale`
  - `suspended`
  - `source_degraded`
  depending on safety policy

The arbiter must never block on one worker.

## Health model
Each worker should periodically publish:
- source name
- worker instance id
- last successful scrape time
- last publish time
- current ban/degraded status
- parse error count
- current median latency

Elixir should aggregate this into a provider health view and use it as an input to trust scoring.

---

## Recommended Arbiter State Model

Recommended canonical market state per match:
- `canonical_match_id`
- `market_key`
- `status`
  - `active`
  - `suspended`
  - `closed`
  - `stale`
- `selection_prices`
- `last_consensus_source`
- `last_consensus_at`
- `consensus_version`
- `suspension_sources`
- `source_snapshots`
  - latest accepted/rejected state per source

This model makes the frontend simple and keeps source complexity behind the arbiter.

---

## Frontend Contract Recommendation

Next.js should receive only canonical data like:
- `match_id`
- `status`
- `clock`
- `score`
- `market_groups`
- `selection_prices`
- `market_status`
- `is_suspended`
- `suspension_reason`
- optional `data_health`

Optional non-primary metadata for observability:
- `consensus_source_count`
- `last_update_ms`
- `degraded_sources`

The frontend should not attempt provider arbitration itself.

---

## Recommended Rollout Sequence

1. Establish canonical team and match mapping tables.
2. Stand up one Redis Stream consumer path in Elixir for raw source envelopes.
3. Normalize one secondary source against the existing anchor source.
4. Implement suspension-first consensus before multi-source price blending.
5. Add jitter suppression and version watermarks.
6. Expose canonical audit logs and health metrics.
7. Only then expand to additional scrapers and sports.

---

## Final Recommendations

- Use a persistent admin-supported mapping layer, not fuzzy matching alone.
- Apply consensus per domain, not per provider.
- Enforce `suspension first` immediately at the canonical market level.
- Treat reopen/resume more conservatively than suspend.
- Keep Rust workers isolated, disposable, and stateless beyond source session needs.
- Keep all cross-source arbitration and safety logic in Elixir.
- Keep the Next.js frontend provider-agnostic and canonical-only.

This architecture will produce a safer and more stable live betting surface than a naive last-write-wins multi-provider merge.
