# Final Framework Go-To-Market

## Objective
This document defines the final operational blueprint required to move the platform from a functioning multi-source shadow deployment into a production-ready, operator-managed, multi-source live trading system. It covers the remaining three launch-critical surfaces:
- deterministic admin reconciliation tooling
- target-specific Rust parsing architecture
- safe retirement of the legacy single-provider path

The document is intentionally execution-oriented. It is not a product overview. It is the final implementation and rollout plan.

---

## 1. The Matchmaker Admin UI (Next.js)

### Objective
Build a secure internal admin tool that allows operators to deterministically map raw scraper match identities to the canonical match graph before those streams are allowed to influence live market consensus.

This UI is the operational control plane for `source_match_mappings`. It must support:
- reviewing unmapped scraper-discovered matches
- comparing them against authoritative canonical matches
- approving or rejecting mappings explicitly
- preventing unsafe fuzzy auto-linking in production

### Why this surface is required
The arbiter is only safe if every incoming source match is linked deterministically. The current backend foundation correctly refuses to merge live streams without a mapping, but operationally there must be a fast admin workflow to resolve those links.

Without this UI:
- new exchange matches will remain unmapped and ignored
- onboarding new scraper sources becomes too slow
- operators will be forced into ad hoc database edits, which is unacceptable in production

### User roles and access
This surface should be restricted to high-privilege internal roles only:
- `super_admin`
- optionally a dedicated `data_ops_admin` role later

It must not be exposed to standard master admins or any player-facing UI.

### UI entry point
Recommended route:
- `next/src/app/admin/multi-source/matchmaker/page.tsx`

Recommended navigation label:
- `Matchmaker`

Recommended page structure:
1. `Suggested Links` queue
2. `Recently Approved` queue
3. `Rejected / Needs Review` queue
4. search by:
   - source name
   - competition
   - kickoff window
   - source match id
   - canonical match id

### Suggested Links data model
The UI should display unmapped scraper matches from a dedicated suggestion API. Each suggestion row should include:
- `source_name`
- `source_match_id`
- `source competition`
- `source kickoff`
- `source home team`
- `source away team`
- `candidate canonical match id`
- `candidate competition`
- `candidate kickoff`
- `candidate home/away`
- `confidence`
- `matched_via`
- `kickoff_delta_seconds`
- `status`

This is not a free-form list. It is a structured reconciliation work queue.

### Backend API plan
Recommended endpoints:
- `GET /api/super-admin/multi-source/match-suggestions`
- `POST /api/super-admin/multi-source/match-suggestions/:source_name/:source_match_id/approve`
- `POST /api/super-admin/multi-source/match-suggestions/:source_name/:source_match_id/reject`
- `POST /api/super-admin/multi-source/match-suggestions/:source_name/:source_match_id/manual-link`

Recommended payloads:

#### Fetch suggestions
Query params:
- `source_name`
- `status`
- `competition`
- `date_from`
- `date_to`
- `page`
- `page_size`

Response shape:
- `data: [...]`
- `pagination: {...}`
- `summary: {...}`

#### Approve link
Request body:
- `canonical_match_id`
- optional `note`

Effect:
- write to `source_match_mappings`
- set:
  - `mapping_status = manual_confirmed`
  - `matched_via = manual_admin`
  - `confidence = 1.0`
- optionally backfill team alias approvals if those were also unresolved

#### Reject link
Request body:
- `reason`
- optional `note`

Effect:
- mark the suggestion as rejected in a dedicated suggestions table or review-log table
- do not write to `source_match_mappings`

### Suggested backend support table
Recommended addition during implementation:
- `source_match_mapping_suggestions`

Why:
- do not overload `source_match_mappings` with rejected/ambiguous suggestions
- keep approved mappings clean and authoritative
- preserve audit history for rejected and reviewed candidates

Recommended fields:
- `source_name`
- `source_match_id`
- `candidate_canonical_match_id`
- `confidence`
- `matched_via`
- `kickoff_delta_seconds`
- `mapping_status`
  - `suggested`
  - `manual_confirmed`
  - `rejected`
  - `needs_review`
- `source_snapshot`
- `candidate_snapshot`
- `reviewed_by_id`
- `reviewed_at`
- `review_note`

### UI actions
Per suggestion row, the operator should be able to click:
- `[Approve Link]`
- `[Reject]`
- `[Open Manual Search]`

#### Approve Link
Behavior:
- confirm modal shows both sides clearly
- on confirm, call approve endpoint
- optimistic row removal from queue
- toast: `Match link approved`

#### Reject
Behavior:
- require short reason
- call reject endpoint
- row moves out of `Suggested Links`
- toast: `Suggestion rejected`

#### Open Manual Search
Behavior:
- opens side panel or modal
- allows searching canonical matches by:
  - competition
  - date
  - home team
  - away team
- supports force-linking the raw source match to a different canonical match than the top suggestion

### Recommended UI layout
Each row should use a left-right comparison card:

Left side:
- raw source match details
- source match id
- source name
- observed kickoff

Right side:
- suggested canonical match details
- canonical match id
- anchor source information
- confidence and timing deltas

Bottom row:
- approve / reject / manual search buttons

This must be optimized for high-speed operator review, not generic CRUD.

### Security and audit requirements
Every admin action must be auditable:
- actor id
- source match id
- candidate canonical id
- action type
- reason / note
- timestamp

This must be persisted server-side, not only logged in browser telemetry.

### Rollout sequence
1. expose read-only suggestions queue
2. expose approve/reject endpoints
3. enable manual-link modal
4. add reviewed-history tab
5. add team-alias drilldown if unresolved team identity blocks a match link

---

## 2. Target-Specific Rust Parsers (`serde`)

### Objective
Move the scraper layer from the current generic raw-envelope transport into source-specific parsing modules that deserialize each exchange payload into a strict internal normalized event before publishing to Redis.

The current generic ingestion path is suitable for infrastructure proving. It is not sufficient for production-grade exchange integration because live target payloads are deeply nested, inconsistent, and schema-volatile.

### Design principle
The Rust scraper should not publish raw target JSON directly into Redis once a source is productionized.

Instead, each source should:
1. ingest target payload
2. deserialize it with a source-specific parser
3. normalize it into a strict internal `Envelope`
4. publish only that normalized envelope into Redis

This shifts chaos handling to the ingestion edge and reduces ambiguity inside Elixir.

### Proposed scraper module architecture
Recommended directory structure:
- `scraper/src/parsers/mod.rs`
- `scraper/src/parsers/common.rs`
- `scraper/src/parsers/provider_a.rs`
- `scraper/src/parsers/provider_b.rs`
- `scraper/src/parsers/provider_c.rs`

Recommended traits:
- `ExchangeParser`

Example trait responsibilities:
- `parse_frame(&self, raw: &str) -> Result<Vec<Envelope>>`
- `supports_message(&self, raw: &serde_json::Value) -> bool`
- `source_name(&self) -> &'static str`

This allows one source to emit multiple normalized envelopes from a single incoming websocket message when one payload contains many markets or selections.

### Strict internal envelope contract
The Rust side should normalize into a strict shape before Redis publish.

Recommended normalized fields:
- `source`
- `message_type`
- `observed_at_ms`
- `payload`

Recommended payload fields for odds:
- `source_match_id`
- `market_key`
- `selection_key`
- `market_status`
- `price`
- `source_event_time_ms`
- `selection_name`
- `bookmaker`
- `raw_status`
- `raw_market_id`
- optional `metadata`

Recommended payload fields for score/state:
- `source_match_id`
- `domain`
- `clock`
- `period`
- `score`
- `source_event_time_ms`

### Source-specific deserialization strategy
Each provider parser should define source-local structs using `serde` with targeted flexibility.

Recommended pattern:
- use exact structs for the stable outer layers
- use `Option<T>` aggressively for unstable subtrees
- use `#[serde(default)]` for arrays and optional maps
- use custom deserializers for:
  - decimal-like strings
  - inconsistent booleans
  - timestamp variants
  - string-or-number ids

Examples of source-local helper types:
- `StringOrNumberId`
- `BoolLike`
- `TimestampMillisOrIso`
- `PriceString`

### Parser safety rules
A production parser must never panic on malformed upstream JSON.

Required behavior:
- malformed sub-message should be rejected with structured error logging
- the websocket loop must continue
- invalid nested market rows should be skipped individually when possible
- only fatal transport failures should reset the connection

### Parsing pipeline inside the scraper
Recommended execution sequence:
1. websocket frame received
2. parser registry selects provider parser
3. parser returns `Vec<Envelope>`
4. each envelope is serialized and pushed to Redis
5. parser metrics recorded:
   - frames seen
   - messages parsed
   - messages dropped
   - schema errors

### Parser registry design
Recommended pattern in `main.rs` / `ws.rs`:
- load parser implementation based on `SCRAPER_NAME` or a dedicated `SCRAPER_PARSER`
- inject parser into websocket loop
- do not hardcode source-specific JSON logic inside `ws.rs`

That keeps transport separate from schema normalization.

### Source-specific schema versioning
Each production parser should support schema drift defensively.

Required safeguards:
- log unknown message classes
- tolerate additive fields silently
- gate destructive parser changes behind tests with fixture payloads

Recommended fixture layout:
- `scraper/fixtures/provider_a/*.json`
- `scraper/fixtures/provider_b/*.json`

Recommended tests:
- parser can extract source match id
- parser can extract market status
- parser can extract selection prices
- parser survives partial payloads
- parser rejects malformed critical ids safely

### Rollout sequence for parserization
1. add parser trait and registry
2. move current generic normalization behind parser interface
3. implement one fully typed provider parser end-to-end
4. add fixture tests
5. migrate remaining production sources one by one
6. disable raw generic fallback only after typed parsers are proven stable

---

## 3. The Final Cutover (Dropping Shadow Mode)

### Objective
Decommission the legacy single-provider polling and publishing path after the multi-source arbiter has proven stable under production traffic. The purpose is to reduce operational complexity, halve duplicate ingestion load, and make canonical consensus the only live-trading source of truth.

### Cutover rule
Do not delete the legacy path immediately after feature completion. Execute a staged cutover.

Recommended cutover phases:
1. `shadow mode`
2. `read-prefer-canonical`
3. `write-disable-legacy`
4. `delete-legacy`

### Phase A: Shadow mode validation
Current state is close to this mode:
- legacy single-provider odds still flow
- canonical multi-source odds overlay the UI when available
- operators can compare both systems without customer-visible breakage

Production readiness exit criteria for shadow mode:
- canonical prices match or outperform legacy on target sports
- no unexplained market-lock divergence
- no sustained canonical stale-state incidents
- source failover proven under load
- matchmaker operational for all live onboarded exchanges

### Phase B: Read prefer canonical
Frontend behavior after approval:
- command centers read canonical odds and canonical market status by default
- legacy odds remain available only for internal comparison or hidden debug routes

Backend behavior:
- keep legacy workers running temporarily
- stop routing player-critical UI decisions through legacy state

This is the confidence ramp before actual deletion.

### Phase C: Write-disable legacy
Disable the legacy producer path so it no longer publishes live player-facing odds.

Expected targets to disable, depending on sport:
- legacy polling workers that import odds directly into `matches` / `odds`
- legacy LangGraph or provider-only reprice loops that continue updating public boards in parallel
- legacy provider broadcast triggers for live player market updates

In this repository, the likely legacy targets to review and phase out after cutover are:
- legacy match fetch / provider polling workers in `back/lib/back/workers/`
- legacy sport-specific live consumers that directly mutate match live state for public boards
- direct provider board publish paths in `back/lib/back/state/market_manager.ex`
- legacy live pricing clients such as:
  - football provider-only board application paths
  - cricket legacy AI/live board publish paths that bypass arbiter consensus
- frontend fallback assumptions inside live boards that implicitly trust legacy provider odds first

Important rule:
- disable publishing first
- delete code second

### Phase D: Final deletion targets
After at least one stable release cycle with canonical-only reads and canonical-only writes, remove the legacy path completely.

#### Elixir code expected to be deleted or reduced
Categories to remove:
- legacy live odds polling workers whose sole purpose was direct provider publication
- direct single-provider live arbitration logic that predates multi-source
- duplicate suspension/resume broadcast logic no longer used for player-facing markets
- legacy provider-reference publication branches that bypass canonical consensus

Concrete repository areas to audit for final deletion:
- `back/lib/back/workers/`
  - legacy fetch workers used only for direct player-facing live odds import
- `back/lib/back/live/`
  - old sport-specific live repricers that publish directly rather than feeding canonical consensus
- `back/lib/back/state/market_manager.ex`
  - legacy publish branches that directly drive public odds boards
- `back/lib/back/providers/*.ex`
  - source-specific direct-publication paths no longer required after scraper migration

#### Database tables to review for deprecation
The exact set depends on which legacy writes still remain by cutover time, but the review list should include:
- legacy provider staging/reference tables used only for single-provider live odds publication
- obsolete provider-import audit tables that are no longer read by canonical pipelines
- any duplicated live cache tables superseded by canonical odds state tables

Important rule:
- do not drop `matches` or core `odds` tables until all player-facing consumers have moved off them or those tables have been repurposed as canonical delivery surfaces
- canonical state may still need to materialize into familiar delivery tables during the final migration window

#### Next.js cleanup targets
After canonical-only activation, remove:
- legacy store fallback branches that prefer provider odds over canonical odds
- legacy event handlers only needed for old direct provider state
- old warning copy specific to provider-only degradation paths
- hidden comparison/debug toggles after operations sign-off

### Operational cutover checklist
Before disabling the legacy path, require all of the following:
- matchmaker admin UI operational
- at least one fully typed parser per production source
- source failover verified in staging and production canary
- canonical health/degradation telemetry visible to admins
- alerting configured for:
  - zero active sources on a live match
  - elevated parser failure rate
  - elevated stale-snapshot rejection rate
  - arbitration lag over threshold

### Rollback plan
Rollback must be immediate and low-risk.

Required rollback controls:
- feature flag to disable canonical odds overlay in Next.js
- feature flag to stop canonical MatchChannel events from driving player UI decisions
- feature flag to re-enable legacy live publication workers
- infrastructure playbook to restart those workers quickly if disabled

Recommended rollback sequence if post-cutover failure occurs:
1. switch frontend to legacy-read mode
2. re-enable legacy publisher workers
3. leave scraper + arbiter ingestion running for diagnostics
4. freeze deletion work
5. capture divergence samples for incident review

Important principle:
- rollback should restore the previously trusted legacy player path without needing database restoration
- do not make the cutover one-way until at least one full stable operating cycle has passed

### Success criteria for final cutover
The legacy system can be fully retired only when:
- canonical multi-source odds are the sole player-facing live source
- operators no longer use legacy comparison tools for day-to-day monitoring
- no major incident requires rollback during the agreed stabilization window
- source-mapping and parser maintenance are fully operationalized

---

## Final Recommendation
The platform is technically close to production readiness, but it is not operationally complete until these three surfaces exist:
1. deterministic admin reconciliation tooling
2. production-grade target-specific Rust parsers
3. a staged cutover plan with reversible rollback controls

This blueprint should be executed in that order.
