# Tennis Command Center Blueprint

## Objective
Build a premium, lightning-fast Tennis Command Center optimized for rapid point-by-point betting without disrupting the current live odds pipeline.

The target experience is a high-density court terminal:
- instant reading of server, point score, game score, set score, and pressure state
- premium pre-match context for tournament tier, surface, rankings, and H2H
- a live HUD that can react to break point, set point, match point, and tie-break states without forcing heavy re-renders on every price tick
- graceful fallback for lower-tier ATP Challenger / ITF matches where deep data is missing

This blueprint is intentionally non-breaking. The tennis odds loop remains isolated. Richer match intelligence is added alongside it through a curated `tennis_context` layer.

## Current Audit Summary

### Backend today
The current tennis domain is centered on:
- `back/lib/back/tennis.ex`
- `back/lib/back/tennis/api_client.ex`
- `back/lib/back/tennis/normalizer.ex`
- `back/lib/back/tennis/score.ex`
- `back/lib/back/tennis/match_state.ex`
- `back/lib/back/tennis/workers/live_sync_worker.ex`
- `back/lib/back_web/channels/tennis_channel.ex`
- `back/lib/back/sports_providers/api_tennis.ex`
- `back/lib/back/sports_providers/api_tennis_socket.ex`

What the current backend already does well:
- fetches fixtures via `get_fixtures`
- fetches live tennis state via `get_livescore`
- fetches live tennis odds via `get_live_odds`
- merges live odds into live state snapshots
- normalizes:
  - `event_key`
  - `event_status`
  - current set
  - current game score
  - current point score
  - server
  - deuce / advantage
  - tie-break
  - break point / set point / match point
  - set rows
  - point-by-point history
- pushes the live state over the dedicated tennis Phoenix channel

Important current detail:
- the system already tracks the current server properly enough for UI use
- `Back.Tennis.ApiClient` reads `event_serve` / fallback serve fields
- `Back.Tennis.Normalizer` maps that into `:player_1`, `:player_2`, or `:unknown`
- `Back.Tennis.Score` carries:
  - `server`
  - `mode`
  - `deuce?`
  - `advantage_player`
  - `tiebreak?`
  - `break_point?`
  - `set_point?`
  - `match_point?`

This is a strong foundation for a world-class tennis HUD.

### Frontend today
The current tennis UI is centered on:
- `next/src/components/tennis/public/TennisLobbyPageClient.tsx`
- `next/src/components/tennis/public/TennisMatchPageClient.tsx`
- `next/src/components/tennis/public/TennisScoreboard.tsx`
- `next/src/components/tennis/public/TennisMarketBoard.tsx`
- `next/src/hooks/useTennisSocket.ts`
- `next/src/components/user/sportsbook/PlayerSportsbookWorkspace.tsx`

What the current frontend already does:
- public tennis lobby for live and upcoming courts
- dedicated tennis match page
- live socket updates for lobby and per-match topic
- scoreboard shows:
  - server indicator
  - set rows
  - current game score
  - current point score
  - break / set / match point chips
  - tie-break state
- tennis markets are grouped and rendered cleanly enough for a baseline board

What is still missing:
- no luxury pre-match command surface
- no player headshot / ranking / H2H presentation
- no surface-aware match framing
- no live command-center layout optimized around point rhythm and serve pressure
- no dedicated split between very fast point lane and slower context lane
- no panel-2 intelligence feed for break point / set point alerts while browsing the wider sportsbook
- market language is better than some other sports, but still generic rather than tennis-native and premium

## Layout Principle

### Full-page mode
A direct tennis match page must render as a dedicated command surface.
- No redundant nested sportsbook sidebars
- No duplicate panel shell inside the match page
- The page should feel like a focused court terminal

### Multi-panel mode
When the user is browsing the wider sportsbook workspace:
- Panel 1 remains the list/navigation surface
- Panel 2 becomes the live intelligence feed for the selected tennis event or row-level preview
- Panel 3 remains the main betting surface

For tennis, Panel 2 should evolve into a compact intelligence drawer showing items such as:
- mini scoreline
- current server
- current game score and point score
- break point pulse
- set point / match point pulse
- tie-break state
- tournament / surface chip for pre-match

The critical tennis-specific rule:
- Panel 2 should flash or glow when a live court enters break point, set point, or match point
- but it must remain lightweight and must not become a duplicate full page

## API-Tennis Research and Rich Data Discovery

### Official provider capabilities confirmed
The official API-Tennis documentation currently exposes:
- `get_fixtures`
- `get_livescore`
- `get_H2H`
- `get_standings`
- `get_players`
- `get_odds`
- `get_live_odds`

Official docs used:
- API Tennis documentation: https://api-tennis.com/documentation

### High-value provider data points confirmed
From the official documentation, the provider gives enough data to build a serious tennis command center:

1. **Point-by-point and pressure state**
- `get_livescore` and `get_fixtures` expose:
  - `event_game_result`
  - `event_serve`
  - `event_status`
  - `pointbypoint`
  - per-point flags:
    - `break_point`
    - `set_point`
    - `match_point`
  - set-level score rows in `scores`

This is the core of a live tennis HUD.

2. **Pre-match context and tournament identity**
- fixtures/livescore include:
  - `event_type_type`
  - `tournament_name`
  - `tournament_key`
  - `tournament_round`
  - `tournament_season`
  - player keys and logos

This allows tournament-tier framing such as:
- ATP
- WTA
- Challenger
- ITF
- exhibition / juniors / doubles

3. **Head-to-head**
- `get_H2H` returns:
  - direct H2H results
  - recent results for player 1
  - recent results for player 2

This is exactly what a pre-match tennis comparison surface needs.

4. **Rankings / standings**
- `get_standings` returns:
  - `place`
  - `player`
  - `player_key`
  - `league`
  - `movement`
  - `country`
  - `points`

This is enough for ATP/WTA ranking blocks and ranking movement chips.

5. **Player profile and seasonal surface form**
- `get_players` returns player profile and seasonal stats including:
  - `rank`
  - `titles`
  - `matches_won`
  - `matches_lost`
  - `hard_won` / `hard_lost`
  - `clay_won` / `clay_lost`
  - `grass_won` / `grass_lost`
  - player photo/logo and country

This is very valuable for pre-match hype and surface-context framing.

### Important provider limitation discovered
The public API-Tennis docs clearly document:
- point-by-point live score
- H2H
- standings
- player profile and seasonal form
- live odds

But they do **not** clearly document a dedicated live match statistics endpoint for:
- aces
- double faults
- 1st serve %
- points won on first serve
- break points converted

That means the production plan must assume:
- point-by-point is guaranteed
- H2H/rankings/player profile are available
- deep live serving statistics are **optional** and capability-dependent

So the design must be null-safe and modular enough to support two modes:
1. provider-rich mode if statistics can be sourced later
2. point-pressure-first mode when only the documented API-Tennis surface is available

## Recommended Split-Fetch Architecture

### Principle
Do not force every tennis UI concern through one fetch lane.

Tennis has a uniquely fast state cadence. The platform must separate:
- very fast point-state updates
- slower pre-match context
- slower player/ranking/H2H enrichment
- live odds publishing

### Lane 1: Point heartbeat lane
Keep this as the fastest lane.

Backed by:
- `get_livescore`
- existing websocket / live sync path

Responsibilities:
- current set
- current game score
- current point score
- server
- break / set / match point flags
- tie-break state
- point-by-point progression

This lane must remain the fastest tennis state path and must stay independent from slower enrichment calls.

### Lane 2: Live odds lane
Keep this separate from the point heartbeat.

Backed by:
- `get_live_odds`
- existing margin / publish pipeline

Responsibilities:
- raw live odds
- published odds
- market availability

This lane must not wait for H2H or player/ranking calls.

### Lane 3: Pre-match context lane
Use a slower cached fetch for the active match or selected match.

Backed by:
- `get_H2H`
- `get_players`
- `get_standings`
- fixture payload metadata from `get_fixtures`

Responsibilities:
- player rankings
- ranking movement
- recent results
- H2H summary
- player photo/logo
- surface/context framing inferred from tournament naming and seasonal player stats

### Lane 4: Optional deep statistics lane
If richer live statistics become available from provider tier, alternate API module, or a future provider source, this lane can be added later.

Responsibilities would include:
- aces
- double faults
- 1st serve %
- break point conversion
- return points won

But the initial architecture must **not depend on it**.

## Execution Phases

## Phase 1: Data Enrichment
Upgrade the Elixir backend so tennis match state carries a curated `tennis_context` map without changing the live odds contract.

### Backend targets
Primary integration seam:
- `back/lib/back/tennis/api_client.ex`
- `back/lib/back/tennis.ex`
- `back/lib/back/tennis/normalizer.ex`
- `back/lib/back_web/channels/tennis_channel.ex`

Recommended modular structure:
- `back/lib/back/tennis/api_tennis/normalizers.ex`
- `back/lib/back/tennis/api_tennis/normalizers/point_normalizer.ex`
- `back/lib/back/tennis/api_tennis/normalizers/context_normalizer.ex`
- `back/lib/back/tennis/api_tennis/normalizers/h2h_normalizer.ex`
- `back/lib/back/tennis/api_tennis/normalizers/player_profile_normalizer.ex`
- `back/lib/back/tennis/api_tennis/normalizers/rankings_normalizer.ex`

### `tennis_context` shape
The goal is to broadcast curated tennis context, not provider raw JSON.
A clean `tennis_context` should carry:
- `tournament`
- `surface`
- `tier`
- `player_profiles`
- `rankings`
- `h2h`
- `recent_form`
- `pressure_summary`
- `point_timeline`
- `stats` (optional / capability-based)

### Safety rules for Phase 1
- keep `get_livescore` as the fast heartbeat
- do not block the live odds loop on H2H / player / standings requests
- cache H2H and profile/ranking responses per player pair and per player
- handle missing profile/ranking data gracefully for lower-tier players
- broadcast only curated `tennis_context`, not raw provider bloat

## Phase 2: Pre-Match Hype UI
Build a premium pre-match tennis surface that makes the court feel important before first serve.

### New component domain
Create a focused frontend directory such as:
- `next/src/components/tennis/prematch/`

Recommended modules:
- `TennisPrematchBoard.tsx`
- `TennisSurfaceCard.tsx`
- `TennisPlayerProfileCard.tsx`
- `TennisH2HCard.tsx`
- `TennisRankingCard.tsx`
- `TennisRecentFormStrip.tsx`

### Pre-match content priorities
- premium hero block for the court and tournament
- tournament tier / round / season
- inferred surface card:
  - clay
  - grass
  - hard
  - indoor
- player photos/headshots if available
- ATP/WTA ranking and movement
- H2H summary
- recent form and surface performance

### Surface strategy
Because the public docs do not clearly show a direct court-surface endpoint, the initial design should infer surface from:
- tournament naming / provider metadata if present
- player seasonal split data from `get_players`
- future provider expansion when a true surface field is available

The UI must therefore support:
- explicit surface when available
- inferred surface when confidence is high
- neutral fallback when unknown

### Null-state handling
If H2H or rankings are missing:
- show elegant placeholders
- never break the page

If player profile or headshot is missing:
- degrade to initials / country / rank placeholders

## Phase 3: Live Command Center
Replace the current basic tennis live page with a true court terminal optimized for point-by-point betting.

### New component domain
Create a focused live directory such as:
- `next/src/components/tennis/live/`

Recommended modules:
- `TennisLiveHud.tsx`
- `TennisLiveScorecard.tsx`
- `TennisServerIndicator.tsx`
- `TennisPressureBanner.tsx`
- `TennisPointTimeline.tsx`
- `TennisMiniStats.tsx`
- `TennisMomentumWave.tsx`

### Live HUD content priorities
Top-level live HUD should show:
- player names
- set scoreline
- current game score
- current point score
- server indicator with tennis ball icon
- tie-break state
- deuce / advantage state
- break point / set point / match point warnings

### Tennis-specific visual priorities
The most important live visual elements are:
1. **Server indicator**
- must be obvious at a glance
- should sit directly beside the active server

2. **Game score block**
- 0 / 15 / 30 / 40 / Ad must be high-contrast and legible

3. **Pressure pulse**
- break point: rose / red pulse
- set point: orange pulse
- match point: amber / gold pulse
- tie-break: cyan/ice tone

4. **Point timeline**
- a compact feed of recent points and pressure swings
- built from `pointbypoint`

### Optional live statistics block
If match-level stats become available later, `TennisMiniStats` should support:
- aces
- double faults
- 1st serve %
- break points won

But the live command center must already feel complete with only:
- server
- point score
- set/game state
- point-by-point timeline

### Panel 2 tennis intelligence feed
The middle sportsbook panel should evolve into a mini tennis alert terminal.

For live matches, row-level or drawer-level intelligence should show:
- compact set score
- current game score
- current point score
- active server
- break point / set point / match point pulse
- tie-break chip

This is especially important for tennis because one pressure point can change the entire board in seconds.

## Phase 4: Optimization and Polish
This phase turns the tennis command center from feature-rich into production-grade.

### React isolation rules
Tennis odds update frequently. The main scoreboard must not repaint unnecessarily.

Rules:
- isolate the live scoreboard and pressure blocks with `React.memo`
- keep the market grid in its own subscription path
- use selector-level stability in the tennis live store
- point heartbeat updates should only repaint tennis HUD slices, not the entire market board
- odds updates should not force the point timeline or scorecard to recalculate unless the match state changed

### CSS-only animation rules
Use CSS for all polish:
- transform
- opacity
- border/background flashes
- subtle pulse states for break/set/match point
- CSS-only glow for live server and pressure warnings

Do not add JS-heavy animation loops.

### Dictionary and copy cleanup
Introduce tennis-specific labeling utilities, for example:
- `next/src/lib/tennis/tennisMarketDictionary.ts`
- `next/src/lib/tennis/tennisPressureDictionary.ts`

Use them to:
- clean provider market names
- keep pressure warnings premium and user-facing
- remove any operator or provider jargon from public tennis views

### Responsive rules
Mobile and desktop must both feel intentional.
- server indicator must remain obvious on narrow widths
- point score must not collapse into unreadable tiny text
- set rows must scroll gracefully if needed
- panel intelligence chips must stay dense but readable
- no nested framing or duplicate shells

## Constraints and Safety Rules

### Zero disruption to live odds
- the tennis odds path must remain intact
- no enrichment call should gate live odds publication
- no H2H/ranking/profile request should slow down the point heartbeat lane

### Graceful provider limitations
- lower-tier ITF / Challenger matches may have limited context depth
- deep serving statistics may be unavailable
- surface may require inference rather than a true dedicated field

Every UI surface must handle these limitations elegantly.

### Zero nested framing
- full-page match mode must not duplicate sportsbook panels
- sportsbook workspace can use panels, but dedicated tennis match pages must remain clean

### Point-first architecture
Tennis is uniquely sensitive to point cadence.
- point and server state are the most important live signals
- all other enhancements must be additive and secondary to the point heartbeat lane

## Delivery Order
1. Phase 1: backend `tennis_context` enrichment and caching
2. Phase 2: pre-match tennis hype surface
3. Phase 3: live tennis command center and panel intelligence feed
4. Phase 4: memo isolation, dictionary cleanup, and CSS-only polish

## Sources
- API Tennis documentation: https://api-tennis.com/documentation
