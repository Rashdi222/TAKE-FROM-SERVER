# Football Audit & Execution Plan

## 1. Executive Summary

Current position:
- Football is ahead of where the old UI text suggests.
- Super Admin already has a real football desk at `/admin/football`.
- Football discovery, feed import, live refresh, AI draft generation, rewrite, publish/unpublish, and provider-reference odds plumbing already exist in code.
- User side does **not** yet have a football-specific live trading experience comparable to the cricket live dashboard.
- Public/player football currently uses the shared public match board and shared match detail page.
- Advanced live football betting is therefore **partially built**, not complete.

Bottom line:
- If you buy API-Football Pro or Ultra, you should get plan-level access to all endpoints and all competitions.
- But actual odds availability for a specific league/season is still determined by provider coverage.
- Your platform can operate with your own AI/platform odds even if provider odds are incomplete.
- To reach serious advanced football live betting, the main remaining work is on the user-side live board, live event/risk model depth, and football-specific stateful UX.

---

## 2. Official API-Football Reality

### 2.1 What the official pricing page says
Official source:
- https://www.api-football.com/pricing

Confirmed from the official pricing page:
- `Pro`: `$19 / month`
- `Pro`: `7,500 requests / day`
- `Ultra`: `75,000 requests / day`
- page states: `All our plans include all competitions and endpoints.`
- page also lists both:
  - `In-play Odds`
  - `Pre-match Odds`

So at the **plan-access** level:
- yes, Pro and Ultra include odds endpoints
- yes, Pro and Ultra include all competitions/endpoints according to the pricing page

### 2.2 What the official documentation says
Official sources:
- https://www.api-football.com/documentation-v3
- https://www.api-football.com/public/doc/openapi.yaml

Confirmed from the official documentation/openapi:
- odds endpoints exist
- `odds/live` exists
- `odds/live/bets` exists
- `odds/bookmakers` exists
- `odds/bets` exists
- the `leagues` endpoint exposes season coverage metadata, including an `odds` boolean under season coverage

That means:
- the plan may allow odds endpoints
- but for a specific league-season, you still need the provider to actually mark odds coverage as available
- so `all competitions and endpoints` does **not** mean every competition-season has usable odds data for every market at every time

### 2.3 Practical interpretation for your product
For football, API-Football can provide:
- leagues
- seasons
- teams
- fixtures
- livescore
- events
- lineups
- standings
- pre-match odds
- in-play odds

But in your product decision-making, separate these two questions:

1. `Can the plan access the odds endpoints?`
- yes, based on official pricing/docs

2. `Will every target league/season actually return useful odds coverage?`
- not guaranteed
- depends on provider coverage for that competition-season

So the correct production rule is:
- use API-Football as primary football fixture/live provider
- treat provider odds as optional enhancement unless you verify target leagues return reliable odds consistently

---

## 3. Current Local Codebase Status

### 3.1 Super Admin football status
Current status: **substantially built**

Confirmed in code:
- dedicated football desk exists:
  - `next/src/app/admin/football/page.tsx`
- football discovery endpoint exists:
  - `GET /api/super-admin/football/discovery`
- football automation runs endpoint exists:
  - `GET /api/super-admin/football/automation-runs`
- football desk supports:
  - competition discovery
  - create feed
  - import upcoming
  - refresh live
  - grouped match operations
  - side workspace
  - AI generation
  - orchestration
  - rewrite
  - publish/unpublish

Supporting components already exist:
- `FootballCompetitionDiscoveryPanel.tsx`
- `FootballFeedAutomationPanel.tsx`
- `FootballMatchOpsCard.tsx`
- `FootballMatchWorkspacePanel.tsx`
- `FootballProviderReferencePanel.tsx`
- `FootballMatchOddsPanel.tsx`

### 3.2 Provider-reference odds status
Current status: **implemented in backend, but needs operational verification per provider/competition**

Confirmed in code:
- `back/lib/back/providers/api_sports.ex`
  - supports `/odds`
  - supports `/odds/live`
  - normalizes bookmaker/bet/value structures
- `back/lib/back/providers/allsports.ex`
  - supports `FullOdds`
  - supports `Odds`
  - supports `OddsLive`
- generic import/fetch pipeline exists in:
  - `back/lib/back/providers.ex`
  - `back/lib/back_web/controllers/odds_controller.ex`

Important correction:
- there is stale football admin copy still suggesting provider-reference odds are not enabled for current football adapters
- that UI copy is outdated relative to the actual backend implementation

### 3.3 Football AI/platform odds status
Current status: **implemented**

Confirmed in code:
- football odds strategy exists
- football automation exists:
  - `back/lib/back/ai/football_odds_automation.ex`
- sport market rules exist for football
- football in-play snapshot/settlement support exists, but only at a basic level

What this means:
- your platform can already generate and manage football platform odds even if provider odds are thin or inconsistent

### 3.4 User-side football status
Current status: **usable, but generic**

User side currently has:
- player sidebar link to `/sportsbook/football`
- shared player/public match board with football filtering
- shared match detail page that already has some football-specific touches:
  - minute chip handling
  - score summary formatting

But user side does **not** yet have:
- football-specific live dashboard like cricket has
- football websocket-driven live odds board
- football-specific atomic live bet slip experience
- football-specific live suspension/risk UI
- football-specific live scoreboard layout
- football-specific advanced market panels

So from a product maturity perspective:
- cricket live betting UX is ahead of football
- football user-side experience is still on the shared board/detail model

---

## 4. What You Will Actually Get From API-Football Pro / Ultra

## Pro Plan
Official source: https://www.api-football.com/pricing
- `$19 / month`
- `7,500 requests/day`
- plan page says all endpoints and competitions are included
- odds endpoints are included at plan level

## Ultra Plan
Official source: https://www.api-football.com/pricing
- `75,000 requests/day`
- plan page says all endpoints and competitions are included
- odds endpoints are included at plan level

## What that means for your product
You should expect access to:
- football leagues
- seasons
- fixtures
- live score/events
- pre-match odds
- in-play odds

But you must still verify for your target competitions:
- that `coverage.odds` is effectively available for the season/league you care about
- that the specific live/pre-match odds shape is usable for your admin workflow
- that request volume is enough for your expected live polling behavior

## Plan recommendation
### Use `Pro` if:
- you are running modest football inventory
- you mainly need fixtures/live data
- provider odds are secondary
- your platform odds are primarily AI-generated by your own system

### Use `Ultra` if:
- you want broader football live coverage
- you want reliable provider-reference odds pulls during busy live windows
- you will refresh many competitions and many live matches per day
- you expect operator-heavy live monitoring and comparison workflows

My practical recommendation:
- if football is going to be serious and live, `Ultra` is the safer operating plan
- if football is secondary and you mostly need fixture/live data plus your own AI odds, `Pro` may be enough early

---

## 5. What Remains On User Side

Current status:
- player football board exists through shared matchbook UI
- football cards and shared match detail are functional
- but football user-side is **not yet advanced live-trading grade**

### Remaining user-side work
1. Build a dedicated football live dashboard
- similar product quality to cricket live board
- football-specific scoreline
- minute/state ribbon
- market tabs optimized for football

2. Add football websocket/live delta pipeline on the UI
- live odds cell flashing
- suspend/resume banners
- stale quote handling for football live slip

3. Add football live bet slip specialization
- football-specific quote refresh logic
- live market rejection copy
- instant balance refresh after bet

4. Add football-specific match detail hierarchy
- top markets first:
  - Match Winner
  - Over/Under
  - Double Chance
  - BTTS
  - In-Play

5. Add results/completed football presentation
- completed match summary
- top-level settled/closed result boards

6. Add football-specific live card previews
- minute
- score
- pressure/live state context

---

## 6. What Remains In Super Admin

Current status:
- football admin desk already exists and is useful

Remaining work:
1. Remove stale UI copy about provider odds not being supported
2. Add real provider-coverage verification badges per competition
- fixture coverage
- odds coverage
- live coverage

3. Add feed health / incident panel for football
- provider failures
- odds import failures
- live refresh failures

4. Add stronger live operator controls
- suspend/resume per football market family
- emergency all-live football pause

5. Add football-specific provider comparison depth
- bookmaker filters
- source bookmaker preference
- variance alert when provider vs platform diverges too sharply

6. Add operator quality checks before publishing
- empty market detection
- duplicate selection detection
- odds outlier detection

---

## 7. Backend / Data / Migration Status

### Already present
- competition feeds
- football discovery
- football automation runs
- provider odds fetch/import pipeline
- football in-play settlement basics
- football market configs and odds rules

### Missing or worth adding for advanced football live betting
1. `football_live_events` or generalized event-log table usage
- needed if you want advanced football event-driven repricing, not just polling snapshots

2. richer match-state columns or raw-state extraction for football
- elapsed minute
- stoppage time
- red cards
- corners
- shots pressure
- possession bands
- xG if later available

3. football-specific incident logging
- live feed interruption
- provider odds gaps
- admin override audits

4. optional `market_health` / `market_quality` metadata
- useful for automated publish controls

5. optional pricing version audit trail
- if you move into more advanced live football trading

### Migration need now?
For the current next phase, not necessarily immediately.
- the existing schema is enough to continue user/admin football execution
- new migrations become justified when you move from generic football operations into event-driven advanced live football pricing/risk

So the answer is:
- no urgent migration is required just to continue the current football rollout
- yes, additional football state tables become justified for advanced live football trading

---

## 8. Non-Breaking Constraint Relative To Cricket

Cricket is now the more advanced live engine.
Football must be expanded without destabilizing cricket.

Rules for implementation:
1. keep football live UX isolated from cricket live dashboard modules
2. reuse generic infrastructure where stable:
- odds CRUD
- bet placement
- provider odds fetch/import
- admin feed management

3. do not force football into cricket-specific state assumptions
4. keep provider adapters separate
5. preserve current cricket live orchestrator path untouched while football evolves on its own timeline

---

## 9. Recommended Football Execution Plan

## Phase A: Truth & Cleanup
Status: should be done first

1. Fix stale football admin copy
2. Add provider coverage indicator in discovery
3. Add provider-reference odds health indicator on football workspace
4. Validate API-Football target leagues you care about:
- Premier League
- Champions League
- La Liga
- Serie A
- Bundesliga
- Ligue 1

Goal:
- stop guessing which football competitions actually return odds coverage

## Phase B: User-Side Football Live Surface
Status: highest product gap

1. Build `LiveFootballMatchDashboard`
2. Add football live scoreboard
3. Add football market tabs
4. Add football live bet slip behavior
5. Add live flash/update behavior for football odds cells

Goal:
- football player experience reaches the same seriousness as cricket live trading

## Phase C: Football Risk & Live Market Controls
1. add football-specific live suspend/resume messaging
2. add stale-quote rejection copy for football
3. add operator controls for football in-play market families
4. add live board health banners for provider issues

Goal:
- football becomes safe for real live trading, not just visually live

## Phase D: Provider Odds Deepening
1. bookmaker preference rules
2. odds coverage validation per league-season
3. provider-vs-platform variance alerts
4. optional scheduled provider-reference sync policy

Goal:
- turn provider odds into a disciplined reference layer instead of raw import clutter

## Phase E: Advanced Football Betting Layer
1. football event-state model
- minute
- stoppage time
- red cards
- corners
- goal events
- match tempo

2. advanced live pricing rules
3. richer in-play market families
4. advanced settlement support

Goal:
- move football from generic operator-grade to advanced live trading-grade

---

## 10. Current Status vs Future Target

## Current football status
### Admin
- good
- real football desk exists
- discovery exists
- feed creation/import exists
- AI workflow exists
- provider-reference odds pipeline exists

### User side
- acceptable for browsing and basic betting
- not yet advanced live-trading grade

### Backend
- solid enough for current football operations
- not yet event-rich enough for advanced football live state management

## After planned execution
### Admin
- football desk becomes provider-aware and quality-controlled

### User side
- football gets a dedicated live dashboard, not just shared detail page behavior

### Backend
- football can evolve toward richer live state and advanced live market control

### Product outcome
- live football score + live odds + safer in-play betting + operator control + provider-reference comparison

---

## 11. Direct Answers To Your Main Questions

### Are odds included in API-Football Pro / Ultra?
Yes, at plan level, based on the official pricing/docs.
But actual usable odds for a league-season still depend on provider coverage.

### Will you get all leagues?
The pricing page says all competitions/endpoints are included.
So plan-level access is broad.
But data richness can still vary by competition-season.

### Should you rely on provider odds?
Not fully.
Use them as a reference layer unless your target leagues prove consistently reliable.
Your own AI/platform odds should remain the core trading layer.

### Is football management already available in Super Admin?
Yes.
It is already materially built.
But it still needs cleanup, operator refinement, and better provider-coverage clarity.

### What is the biggest remaining football gap?
The player/user-side live football experience.
That is where the main product gap is now.

---

## 12. Recommended Next Action

Immediate next execution recommendation:
1. audit API-Football response coverage for your exact target competitions
2. clean the football admin desk messaging and provider coverage indicators
3. build the dedicated `LiveFootballMatchDashboard`

If you want football to become truly production-grade after cricket, this is the correct order.
