# Football Command Center Blueprint

## Objective
Build a premium, fast, readable Football Command Center on top of the existing API-Sports integration and live odds pipeline. The target is a high-density match surface that feels like a trading terminal: immediate match state clarity, rich live event intelligence, disciplined layout hierarchy, and zero disruption to live pricing.

This blueprint is intentionally non-breaking. The football odds path stays isolated. Richer match intelligence is added alongside it through a clean `football_context` layer.

## Current Audit Summary

### Backend today
The current football provider path is centered on:
- `back/lib/back/providers/api_sports.ex`
- `back/lib/back/providers/football_competition_discovery.ex`

What it already fetches and normalizes:
- fixtures via `/fixtures`
- live fixtures via `/fixtures?live=all`
- odds via `/odds/live` with fallback to `/odds`
- baseline metadata from the fixture payload:
  - teams
  - league
  - venue
  - elapsed/stoppage minute
  - goals/score
  - red cards
  - corners
  - shots on target
  - a simple `tempo_index`

What it does not yet normalize into a dedicated match-center map:
- event timeline
- lineups and formations
- coaches
- richer statistics beyond the few headline counters
- standings impact
- player-level live detail

### Frontend today
The current football view is centered on:
- `next/src/components/live-football/LiveFootballMatchDashboard.tsx`
- `next/src/components/live-football/FootballScoreboard.tsx`
- `next/src/components/live-football/FootballMarketBoard.tsx`
- `next/src/components/public/MatchDetailPageClient.tsx`
- `next/src/components/user/sportsbook/SportMatchCard.tsx`

What it already shows:
- scoreline
- minute
- status
- competition
- venue
- red cards
- corners
- shots on target
- tempo/pressure summary
- live markets and live bet slip

What is still missing:
- true pre-match hype surface
- formation / lineup visualizer
- event timeline for goals, cards, subs, VAR
- possession and team-stat bars
- live momentum / attack-pressure wave
- standings context
- operator-language cleanup across the football board
- panel intelligence feed comparable to the upgraded cricket flow

### Operator language and UX debt
The current football board still leaks internal or provider-shaped phrasing in places. Examples include:
- generic market labels derived by string manipulation instead of a football-specific dictionary
- suspension reason handling still grounded in internal desk states like:
  - `provider_import_failure`
  - `manual_admin_review`
- a live board that reads more like an operator workspace than a premium customer match center

## Layout Principle

### Full-page mode
A direct football match page must render as a dedicated command surface.
- No redundant nested sportsbook sidebars
- No duplicate shell inside the match page
- The page should behave like a focused match terminal, not a panel inside another panel

### Multi-panel mode
When the user is browsing the wider sportsbook workspace:
- Panel 1 remains the list/navigation surface
- Panel 2 becomes the live intelligence feed for the selected football event or row-level preview
- Panel 3 remains the main betting surface

For football, Panel 2 should evolve into a compact intelligence drawer showing items such as:
- mini-score
- minute/status
- red-card warning
- possession tilt
- latest event marker (goal, card, VAR, sub)
- referee / venue summary for pre-match

This keeps the wider platform glanceable while preserving the full command-center experience on the dedicated match route.

## API-Sports Research and Rich Data Discovery

### Official product and base contract
API-Football v3 is a GET-only REST API with base URL:
- `https://v3.football.api-sports.io/`

The provider exposes enough data to support a luxury football command center, but it should not all be pulled through one oversized live-fixtures request.

### High-value provider capabilities discovered
From the official API-Football materials, the most relevant rich football data points are:
- `/fixtures`
  - fixture core, live score, time, status, venue, teams, league, date, live filtering
- `/fixtures/events`
  - goals, cards, substitutions and match incidents
- `/fixtures/lineups`
  - starting XI, substitutes, formation, coach, player pitch grid
- `/fixtures/statistics`
  - possession, shots, corners, passes and match-level team stats
- `/fixtures/players`
  - individual player statistics and ratings, updated during live matches
- `/standings`
  - rank, points, goal difference, form string, table movement, zone description
- `/leagues`
  - coverage flags by season for events, lineups, fixture statistics, standings, odds and more

### Especially valuable UI-enabling details
The official materials explicitly call out these payload strengths:
- lineups include a `player.grid` position such as `"2:1"`, which can be mapped directly to pitch coordinates
- standings entries include:
  - `rank`
  - `points`
  - `goalsDiff`
  - `form`
  - `description`
  - `status` (`same`, `up`, `down`)
- `/fixtures/statistics` is appropriate for per-minute updates during live matches
- `/standings` updates hourly, so it should not be polled with the same cadence as live match state
- coverage should be checked per league-season via `/leagues` before assuming events, lineups, or standings are available

## Recommended Fetch Architecture

### Principle
Do not overload the broad `/fixtures?live=all` lane.

That lane should remain the lightweight live heartbeat for:
- score
- minute
- status
- core team/league info
- odds lookup correlation

Rich football context should be layered through targeted calls for the active match or cached competition context.

### Efficient provider strategy
Use a split fetch model:

1. **Heartbeat lane**
- Keep `/fixtures` and `/fixtures?live=all` as the main broad feed
- Poll at the current live cadence for match availability and core state
- This remains the main input for the odds pipeline and live board availability

2. **Match enrichment lane**
For a selected match or active live match, fetch and cache:
- `/fixtures/events?fixture=ID`
- `/fixtures/lineups?fixture=ID`
- `/fixtures/statistics?fixture=ID`
- optionally `/fixtures/players?fixture=ID` when player cards/ratings are explicitly needed

3. **Competition context lane**
For standings and table impact:
- `/standings?league=LEAGUE_ID&season=SEASON`
- refresh on a slower cadence because the official material states standings update hourly

### Why this is the correct architecture
- preserves the lightweight live fixtures poll
- avoids bloating every live refresh with nested lineup/statistics payloads for unrelated matches
- keeps rate-limit pressure disciplined
- protects the live odds loop from being blocked by expensive football context calls
- allows targeted caching per fixture and per competition

## Execution Phases

## Phase 1: Data Enrichment
Upgrade the Elixir backend so football match state carries a curated `football_context` map without changing the live odds contract.

### Backend targets
Primary integration seam:
- `back/lib/back/providers/api_sports.ex`

New modular structure should be introduced, analogous to the cricket enrichment pass, for example:
- `back/lib/back/football/api_sports/normalizers/events_normalizer.ex`
- `back/lib/back/football/api_sports/normalizers/lineup_normalizer.ex`
- `back/lib/back/football/api_sports/normalizers/statistics_normalizer.ex`
- `back/lib/back/football/api_sports/normalizers/standings_normalizer.ex`
- `back/lib/back/football/api_sports/normalizers.ex`

### `football_context` shape
The goal is not to dump provider raw JSON into the client. The goal is to broadcast a curated, safe football context object such as:
- `venue`
- `officials`
- `lineups`
- `formations`
- `coaches`
- `events`
- `statistics`
- `standings_snapshot`
- `pressure_summary`
- `event_highlights`

### Normalization responsibilities
- **EventsNormalizer**
  - goals
  - yellow/red cards
  - substitutions
  - VAR incidents
  - timeline-friendly labels and ordering

- **LineupNormalizer**
  - starting XI
  - bench
  - formation
  - coach
  - pitch-grid coordinates from `player.grid`

- **StatisticsNormalizer**
  - possession
  - shots on/off target
  - corners
  - passes and passing accuracy
  - fouls
  - attacks / dangerous attacks if available
  - compact comparison rows for the HUD

- **StandingsNormalizer**
  - current rank / points / goal difference
  - zone description
  - recent form
  - movement status
  - optionally both teams’ table positions for pre-match/live context

### Safety rules for Phase 1
- never block or slow the odds fetch lane waiting for enrichment payloads
- handle `null` and missing arrays everywhere
- coverage-check leagues before calling richer endpoints
- cache enrichment by fixture id and standings by league-season
- broadcast only curated context, not raw provider garbage

## Phase 2: Pre-Match Hype UI
Build a premium pre-match football surface that makes kickoff feel important before the market grid starts dominating attention.

### New component domain
Create a focused frontend directory such as:
- `next/src/components/football/prematch/`

Recommended modules:
- `FootballPrematchBoard.tsx`
- `FootballVenuePanel.tsx`
- `FootballRefereeCard.tsx`
- `FootballLineupPitch.tsx`
- `FootballFormationCard.tsx`
- `FootballTableImpactCard.tsx`

### Pre-match content priorities
- fixture hero with gradient-backed scoreboard shell
- venue and referee block
- home and away formations
- pitch visualization of the starting XI using `player.grid`
- coach names
- league round and competition context
- standings context:
  - current table positions
  - points gap
  - recent form pills

### Null-state handling
If lineups are not yet published:
- do not crash
- render a polished “Lineups not announced yet” skeleton state

If referee or venue details are absent:
- downgrade gracefully to compact placeholders instead of blank broken tiles

### Pre-match copy cleanup
Replace operator phrasing with user-facing copy.
Examples:
- not `No published odds right now`
- instead use:
  - `Markets are being prepared for kickoff`
  - `Check back closer to match time`

## Phase 3: Live Command Center
Replace the basic live football board with a high-density live HUD that tells the full match story in one screen.

### New component domain
Create a focused live directory such as:
- `next/src/components/football/live/`

Recommended modules:
- `FootballLiveHud.tsx`
- `FootballLiveScorebar.tsx`
- `FootballPossessionBar.tsx`
- `FootballStatStrip.tsx`
- `FootballEventTimeline.tsx`
- `FootballAttackWave.tsx`
- `FootballMomentumPulse.tsx`
- `FootballLiveCommentaryFeed.tsx`

### Live HUD content priorities
Top-level HUD should show:
- scoreline
- minute and stoppage
- competition / venue
- possession split
- shots on target
- corners
- red cards
- current pressure / tempo

Event intelligence should show:
- goal timeline
- yellow/red cards
- substitutions
- VAR events
- latest incident chip

Pressure visualization should show:
- momentum / attack pressure wave
- CSS/SVG only
- derived from recent events + statistics cadence

### Player and tactical richness
If the provider data is present, live football can be materially improved with:
- current formation visualization
- substitutions reflected in the on-pitch grid
- coach block
- top player ratings from `/fixtures/players` for expanded match-center mode

### Panel 2 football intelligence feed
The middle sportsbook panel should evolve into a mini live terminal for football rows.

For live matches, row-level or drawer-level intelligence can show:
- compact scoreline and minute
- red-card badge
- possession trend chip
- latest event pill (`Goal`, `VAR`, `Red Card`, `Sub`)
- subtle CSS pulse for live matches

This feed must stay lightweight and must not become a second full page.

## Phase 4: Optimization and Polish
This phase turns the football command center from “feature-rich” into “production-grade.”

### Operator language purge
Introduce a dedicated market and status dictionary, for example:
- `next/src/lib/football/footballMarketDictionary.ts`
- `next/src/lib/football/footballIncidentDictionary.ts`

Map raw/internal text to clean user-facing language.
Examples:
- `provider_import_failure` -> `Live pricing is temporarily unavailable`
- `manual_admin_review` -> `Markets are under review`
- raw provider market strings should resolve to clean football labels

### React isolation rules
The odds board is volatile. The match HUD should not repaint every time a quote ticks.

Rules:
- isolate the score HUD with `React.memo`
- keep market rows memoized
- use selector-level stability in the live store
- avoid recomputing large event arrays on every odds update
- separate score/event selectors from odds selectors

### CSS-only animation rules
Use CSS for all polish:
- transforms
- opacity transitions
- background-color flashes
- subtle pulse states
- glassmorphism and gradient depth

Do not add JS-heavy animation loops.

### Responsive rules
Mobile and desktop must both feel intentional.
- full-page mode should use the full width efficiently
- scoreboard and stat strips should stack or scroll safely on smaller screens
- Panel 2 mini-intelligence should remain dense but readable
- no nested framing or duplicate shells

## Constraints and Safety Rules

### Zero disruption to live odds
- the football odds path must remain intact
- no enrichment call should gate quote updates
- no market publish or suspension behavior should be coupled to UI-only data enrichment

### Zero nested framing
- full-page match mode must not duplicate sportsbook panels
- sportsbook workspace can use panels, but dedicated match pages must remain clean

### Graceful null handling
- events may be empty
- lineups may not be published yet
- statistics may lag in smaller leagues
- standings may be unavailable if coverage is false

Every UI surface must handle missing data elegantly.

### Coverage-first discipline
Before calling lineups, standings, or statistics for a league-season:
- inspect `/leagues` coverage flags
- avoid wasteful calls where the provider itself indicates missing support

## Delivery Order
1. Phase 1: backend `football_context` enrichment and caching
2. Phase 2: pre-match football hype surface
3. Phase 3: live football command center and panel intelligence feed
4. Phase 4: operator-language purge, memo isolation, and CSS-only polish

## Sources
- API-Football tutorial and endpoint guide: https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide
- API-Football official documentation reference: https://www.api-football.com/documentation-v3
