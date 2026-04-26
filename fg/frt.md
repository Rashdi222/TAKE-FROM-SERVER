# Sixerbat — Sports Data, Cached Match Import, and Dual Odds Management Plan

## 1. Objective

Build a super-admin friendly operating model for:

- importing league/tournament fixtures into the platform database
- serving upcoming matches from cache/database instead of hitting providers on every user request
- switching to targeted live sync when a match is close to start or already live
- supporting both external provider odds and internal AI/admin-generated platform odds
- making the entire workflow easy to operate across cricket, football, tennis, horse racing, and dog racing

This plan is based on the current backend/frontend audit and is written to maximize reuse of existing code before adding new structures.

---

## 2. What Already Exists and Should Be Reused

### Backend

- `providers` table and provider management context already exist
- provider adapters already exist, including `Back.Providers.Sportmonks`
- generic provider dispatcher already exists
- `MatchFetcher` worker already exists for active-provider sync
- normalized sports-data event storage and operational pages already exist
- `matches`, `odds`, `bets`, `transactions`, `users` tables already exist
- AI odds generation flow already exists:
  - generate
  - regenerate
  - rewrite with note
  - orchestrate
  - publish
  - unpublish
- odds versioning and draft/published lifecycle already exist
- provider sync logging and admin audit logging already exist

### Frontend

- super-admin provider control page already exists
- super-admin sports data observability pages already exist
- super-admin match list and match detail flow already exist
- per-match odds workspace already exists

### Conclusion

The platform is not missing foundations.
The main issue is that current operations are arranged by technical module, not by business workflow.

This plan will reuse the current provider, match, odds, logging, and admin systems and add a league/season oriented control layer on top.

---

## 3. Core Product Model

The system should be understood as 5 layers:

### Layer A — Data Sources

External providers supply:

- leagues / competitions
- seasons
- fixtures / matches
- live score/status updates
- in some cases provider odds

### Layer B — Platform Match Cache

The platform stores provider-fed fixtures inside its own database.

Users should read matches from Sixerbat DB only.
Users should not depend on direct provider fetches.

### Layer C — Odds Sources

Each match can support two odds sources:

- `provider_odds`
- `platform_odds`

Platform odds remain the main Sixerbat betting product.
Provider odds are optional reference/imported odds.

### Layer D — Admin Publishing

Super admin decides which odds are exposed:

- external provider odds may be imported for comparison/reference
- internal AI odds are generated, reviewed, rewritten, regenerated, then published
- users only see approved published odds

### Layer E — User Betting

Users see:

- cached upcoming/live matches from DB
- only published user-facing odds
- stake/payout/risk limits defined by platform rules

---

## 4. Plain Definitions

### Fixture

A fixture is one scheduled sporting event/match.

Examples:

- `IPL: Mumbai vs Chennai on 2026-04-10`
- `PSL: Lahore vs Karachi on 2026-03-29`
- `ATP: Player A vs Player B`
- `Horse race at a selected venue`

Before start time it is a fixture.
At start it can become live.
After finish it becomes closed/finished/settled.

### Season

A season is the competition cycle that contains many fixtures.

Examples:

- `IPL 2026`
- `PSL 2026`
- `Premier League 2025/26`

### Competition Scope by Sport

Not every sport should be controlled in the same way:

- cricket: league + season
- football: league + season
- tennis: tournament/date-window oriented
- horse racing: region/meeting/date-window oriented
- dog racing: track/region/date-window oriented

---

## 5. Desired Operational Flow

### Cricket Example — PSL / IPL

1. Super admin configures a feed profile for `PSL`
2. Super admin chooses provider and season
3. System imports PSL fixtures into `matches`
4. Users see PSL upcoming matches from cached DB data
5. Near match start, system increases live update polling
6. Super admin opens a match and generates platform odds
7. Super admin reviews / rewrites / republishes if needed
8. Users only see published platform odds

### Same Pattern for Football

League + season based.

### Same Pattern for Tennis / Horse / Dog

The same operating model remains, but the competition selector becomes:

- tournament
- region
- track
- date range

---

## 6. Management Model for Super Admin

The current system is functional but not easy enough.

It should be reorganized into these business-facing modules:

### 6.1 Feed Sources

Purpose:
define which provider is available for which sport and whether provider odds are supported.

Super admin controls:

- provider name
- supported sport
- credentials
- enable/disable
- active/inactive
- supports fixtures
- supports live
- supports provider odds

### 6.2 Competition Import

Purpose:
import competitions into platform cache.

Super admin controls:

- choose sport
- choose provider
- choose league / season / tournament / region / track
- import all fixtures once
- refresh upcoming only
- refresh live only

Examples:

- `Import IPL 2026`
- `Import PSL 2026`
- `Refresh ATP next 2 days`
- `Refresh horse region: UAE`

### 6.3 Sync Rules

Purpose:
control caching and live update behavior.

Super admin controls:

- fetch how many days ahead
- live sync enabled or disabled
- polling start window before match
- polling interval while live
- polling stop window after match
- fallback resync interval

### 6.4 Match Desk

Purpose:
operate imported matches.

Super admin sees:

- imported match list
- competition
- provider
- cached status
- live status
- imported time
- last sync time
- open odds workspace

### 6.5 Odds Desk

Purpose:
manage the actual betting product.

Per match super admin can:

- inspect provider reference odds if available
- inspect current platform draft odds
- generate platform odds
- rewrite with comment
- regenerate
- orchestrate
- publish / unpublish

### 6.6 Risk Templates

Purpose:
avoid repeated manual odds limit entry.

Super admin controls by sport/market:

- default max stake
- default max payout
- market enable/disable
- default AI generation behavior

### 6.7 Provider Health and Logs

Purpose:
operations and troubleshooting.

Super admin sees:

- last successful sync
- last failed sync
- provider-specific errors
- sync volumes
- event rejections

---

## 7. Dual Odds Strategy

The platform should support both provider odds and internal odds without confusion.

### 7.1 Why Keep Both

`provider odds` can help with:

- market benchmarking
- quick fallback/reference line
- comparison before publishing platform odds
- audit trail of market movement

`platform odds` remain essential for:

- margin control
- liquidity protection
- editorial/admin control
- AI rewrite/regeneration workflow
- publish lifecycle

### 7.2 Recommended Product Rule

Users should primarily bet on `platform odds`, not raw provider odds.

Provider odds should initially be treated as:

- reference data
- optional import source
- optional side-by-side comparison for super admin

Only after governance is strong should provider odds become directly publishable.

### 7.3 Required Odds Source States

Each odds row or odds batch should conceptually support:

- `source_type = platform_ai`
- `source_type = platform_manual`
- `source_type = provider_import`

Current system already has AI/manual lifecycle.
This plan adds provider-import as a separate source category.

---

## 8. Current Gaps Identified in Audit

### Gap 1 — League/season import is not productized

Current provider sync is provider-level.
There is no clear tournament-level import flow like:

- fetch IPL season
- fetch PSL season

### Gap 2 — Live sync is not competition-aware

Current `MatchFetcher` uses one active provider and generic polling.
It is not yet driven by imported competition-specific windows.

### Gap 3 — Provider odds are not integrated as a first-class source

Current odds workspace is strong for platform odds, but not yet designed to:

- fetch provider odds
- compare provider vs platform odds
- selectively import provider odds as draft/reference

### Gap 4 — Admin workflow is spread across too many pages

Current flow is technically valid but not operationally easy.

### Gap 5 — Sport-specific import patterns are missing

Cricket/football work by league+season.
Tennis/horse/dog need tournament/meeting/region/track patterns.

---

## 9. Execution Plan

### Phase 1 — Competition Feed Registry

Create a business-level feed registry above raw providers.

Goal:
allow super admin to manage competitions, not just providers.

Add concept:

- `competition feed profile`

Each profile contains:

- label: `IPL 2026`, `PSL 2026`, `Premier League 2025/26`
- sport
- provider
- provider competition identifier(s)
- season identifier
- import mode
- live sync rules
- whether provider odds import is enabled
- whether platform AI odds generation is enabled

Reuse:

- existing providers table
- existing provider adapters

Likely addition:

- new table for competition feed profiles

Proposed name:

- `competition_feeds`

Why a new table is justified:

- this is business configuration, not provider credentials
- the current provider config alone is too generic for league/season operations

### Phase 2 — Competition Import Endpoints

Add endpoints for super admin:

- list configured competition feeds
- create/update competition feed
- import all fixtures for a feed
- refresh upcoming fixtures
- refresh live fixtures
- pause/resume feed

Use existing match upsert/storage path.

Do not replace current provider sync.
Keep current provider sync as low-level technical control and add competition import as the business control layer.

### Phase 3 — Provider Adapter Expansion

Extend provider adapters to support:

- fetching by competition / league / season
- fetching by date range
- fetching live subset only
- fetching provider odds where supported

SportMonks specific extension:

- fetch cricket fixtures by season
- fetch cricket livescores
- optional fetch cricket odds / in-play odds if available in subscription plan

### Phase 4 — Match Cache Policy

Upcoming matches:

- imported in bulk into DB
- served from DB to users

Live matches:

- polling starts only near start time or when match status becomes live
- polling interval increases while live
- polling slows/stops after finish

Replace or extend current generic `MatchFetcher` to be competition-aware.

Recommended windows:

- pre-live activation: 15 to 30 minutes before start
- live polling: every 15 to 60 seconds depending on sport/provider limits
- post-finish cooldown sync: 5 to 15 minutes

### Phase 5 — Provider Odds Import Path

Add optional provider odds ingestion flow:

- fetch provider odds for supported matches
- normalize into internal reference format
- store as `provider_import` draft/reference odds

Important:

- do not auto-publish provider odds
- surface them in admin workspace for comparison first

### Phase 6 — Odds Workspace Upgrade

Upgrade the current admin odds workspace to show:

- provider reference odds, if available
- platform draft odds
- diff between provider vs platform
- one-click actions:
  - import provider odds as draft
  - generate platform odds from AI
  - rewrite / regenerate
  - publish platform odds

Current workspace already supports:

- generate
- regenerate
- rewrite
- orchestrate
- publish
- unpublish

This phase mainly adds:

- provider odds reference/import block
- clearer end-to-end review flow

### Phase 7 — Sport-Specific Market Templates

Introduce or strengthen template-driven odds generation per sport.

Examples:

- cricket:
  - match winner
  - over/under
  - innings/session style markets if desired
- football:
  - 1x2
  - double chance
  - over/under
  - BTTS
- tennis:
  - match winner
  - set betting
- horse:
  - win / place
- dog:
  - win / place

Templates define:

- allowed markets
- default max stake
- default max payout
- AI generation defaults

### Phase 8 — Super Admin UX Simplification

Add or reorganize admin pages into these simple sections:

- `Feeds`
- `Competitions`
- `Sync Rules`
- `Imported Matches`
- `Odds Desk`
- `Provider Health`

Existing pages can be reused but should be linked in a simpler operational sequence.

### Phase 9 — Observability and Safety

For every competition feed, expose:

- last import time
- last successful sync
- last live sync
- imported fixture count
- live fixture count
- failed fixtures
- failed odds imports
- last provider odds fetch

Also log:

- provider odds imported count
- platform odds generated count
- publish/unpublish events per match

### Phase 10 — User Experience Rules

Users should see:

- cached upcoming matches from DB
- live matches from DB updated by backend sync
- only published platform odds by default

Optional later feature:

- show `market consensus` or `provider comparison` label internally for admins only

Do not expose raw provider odds to users until platform governance is proven.

---

## 10. Required Schema Changes

### Must Reuse Existing Tables

Reuse:

- `providers`
- `matches`
- `odds`
- `bets`
- `transactions`
- `provider_sync_logs`
- `admin_audit_logs`

### New Tables Recommended

#### `competition_feeds`

Purpose:
store business-level tournament/competition management.

Fields should include:

- id
- name
- sport
- provider_id
- competition_key
- league_id / tournament_id / track_id
- season_id
- region
- import_mode
- enabled
- live_sync_enabled
- import_provider_odds
- generate_platform_odds
- upcoming_window_days
- live_start_offset_minutes
- live_poll_interval_seconds
- live_stop_offset_minutes
- config jsonb
- inserted_at
- updated_at

#### Optional `match_provider_odds_snapshots`

Purpose:
store imported provider odds snapshots separately from platform odds if deeper audit/history is needed.

This is optional.
If not created, provider odds can initially be inserted into `odds` with a `source_type/provider_import` model via existing structure plus minimal schema extension.

### Existing Table Expansion Likely Needed

#### `odds`

Add fields if not already present:

- `source_type`
- `source_provider`
- `reference_external_id`

Why:

- clearly distinguish platform AI/manual odds from imported provider odds

#### `matches`

Check if current fields are enough for:

- competition/league linkage
- provider season/fixture metadata

If not, add:

- `competition_feed_id`
- `provider_competition_id`
- `provider_season_id`

---

## 11. How Management Should Feel for Super Admin

The final desired experience should be:

### Step 1

Configure provider credentials once.

### Step 2

Create feed profiles such as:

- `IPL 2026 via SportMonks`
- `PSL 2026 via SportMonks`
- `Premier League 2025/26 via API-Sports`
- `ATP daily import via API Tennis`
- `Horse UAE via Goalserve`
- `Dog UK tracks via BetsAPI`

### Step 3

Click one import button for a feed.

### Step 4

See imported fixtures inside match desk.

### Step 5

Open one match and manage odds in the existing workspace.

### Step 6

Publish only approved platform odds to users.

This is the management simplification target.

---

## 12. Recommended Delivery Order

### First Build

- competition feed registry
- league/season import for cricket (`IPL`, `PSL`)
- cached fixture serving
- competition-aware live sync

### Second Build

- provider odds import as admin reference
- odds workspace comparison view

### Third Build

- football competition feed support
- tennis / horse / dog sport-specific feed patterns

### Fourth Build

- advanced dashboards / sync analytics / feed health insights

---

## 13. Final Direction

The correct operating model is:

`provider supplies sports data -> Sixerbat caches fixtures -> live sync updates match state -> AI/admin creates platform odds -> super admin publishes -> users bet on approved platform odds`

And when provider odds are supported:

`provider odds become a comparison/reference layer, not the default user-facing product`

This keeps:

- management clear
- provider usage efficient
- platform liquidity safer
- admin control strong
- workflow scalable across multiple sports
