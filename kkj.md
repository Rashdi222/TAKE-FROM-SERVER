# Cricket Command Center Upgrade Plan

## Objective
Upgrade the cricket public match experience into a richer, faster, more user-readable command center without breaking the current live odds and betting flow.

The current live cricket board already has a custom command-center shell, but it is still incomplete relative to the intended product goal. The pre-match experience is too generic, the live UI is underusing SportsMonks data, and some user-facing text is still written in operator language.

This plan keeps the current request pattern stable wherever possible. The main improvement is to enrich the SportsMonks include set, normalize more provider fields into the existing match payload, and redesign both pre-match and live cricket rendering to use more of that information.

---

## Layout Principle

The cricket experience should use two different presentation modes depending on where the user is:

### Full-page public match detail
- This is the dedicated cricket match page.
- It should show the full cricket command center directly.
- It should **not** duplicate the multi-panel shell visually inside the page.
- In other words, the full page itself is the main cricket surface.
- Users should not see a redundant hidden side-panel structure on the full page.

### Multi-panel sportsbook flow
- When the user is browsing through the sportsbook-style shell, the second panel should be actively used for cricket event intelligence.
- Panel 2 should not stay generic when the selected event is a live cricket match.
- Panel 2 should become a **live cricket info panel** that supports the main betting page rather than duplicating the full board.
- Panel 2 must include a visible back action so the user can return to the broader match list or prior panel state cleanly.

### Panel split rule
For live cricket:
- **Panel 2** should carry compact event intelligence and match context.
- **Main page / main content area** should carry the main score HUD, momentum, and market board.

This split makes the product easier to read because not every piece of information needs to fight for space in the same central board.

---

## Current State Summary

### Already done
- Live cricket has a custom command-center layout.
- Score HUD exists.
- Momentum wave exists.
- Fast market tabs exist.
- Quick-stake and quick-bet bar exists.
- Odds flash on price movement exists.

### Still weak
- Pre-match cricket page is still mostly generic.
- Empty-state copy says `No published odds right now`, which is operator language and not suitable for public users.
- SportsMonks cricket provider payload is richer than what is currently surfaced.
- Live page does not fully show match story context such as toss, lineup, officials, richer batting/bowling detail, or clearer inning/state storytelling.
- The panel architecture is not yet being used properly for live cricket event intelligence.

### Existing SportsMonks usage
Current include set in the provider adapter:
- `localteam`
- `visitorteam`
- `league`
- `season`
- `venue`
- `runs`
- `batting`
- `bowling`
- `balls`

This means the app already requests enough to power a better live board than the one currently rendered.

### SportsMonks fields we are not fully using yet
SportsMonks docs support additional include options for cricket fixtures/livescores such as:
- `scoreboards`
- `lineup`
- `stage`
- `tosswon`
- `firstumpire`
- `secondumpire`
- `referee`
- `tvumpire`
- `manofmatch`
- `manofseries`

Docs also support nested relationships for batting/bowling player context, which can help identify batters and bowlers more clearly.

---

# Phase 1: Provider Data Enrichment

## Goal
Increase the quality and completeness of cricket data coming from SportsMonks without changing the overall request pattern or introducing extra polling lanes.

## Work
1. Expand the default SportsMonks cricket include string in the provider adapter.
2. Add the following include options to the adapter default set:
   - `scoreboards`
   - `lineup`
   - `stage`
   - `tosswon`
   - `firstumpire`
   - `secondumpire`
   - `referee`
   - `tvumpire`
   - `manofmatch`
   - `manofseries`
3. Preserve the existing current includes:
   - `localteam`
   - `visitorteam`
   - `league`
   - `season`
   - `venue`
   - `runs`
   - `batting`
   - `bowling`
   - `balls`
4. Normalize the most useful fields into the match payload while preserving raw provider data in `raw_data`.
5. Avoid breaking existing consumers by only adding new fields, not changing the meaning of current ones.

## Data to normalize or expose more clearly
- toss winner
- toss decision if available
- stage name
- scoreboard blocks
- lineup entries
- officials
- player-of-match / player-of-series if present
- richer batting and bowling rows for live display

## Constraints
- Do not change request cadence.
- Do not add extra provider lanes unless absolutely required.
- Keep the same public/live match contract stable for existing consumers.
- Add fields rather than mutate old semantics.

## Expected result
The backend match payload for cricket becomes richer and can support a proper pre-match and live command-center UI without requiring a separate data product.

---

# Phase 2: Pre-Match Cricket Redesign

## Goal
Replace the current generic cricket pre-match detail page with a richer pre-match event board that feels premium and understandable to a user.

## Problem being solved
The current pre-match page falls back to generic public match rendering and uses weak empty-state copy:
- `No published odds right now`

That is not the right tone for users. It exposes backend publication state rather than useful user-facing status.

## Work
1. Create a cricket-specific pre-match detail rendering path.
2. Keep the current public match route structure intact, but branch cricket pre-match into a dedicated UI component.
3. Add a gradient-based hero section using CSS only.
4. Add denser context cards for:
   - competition
   - stage
   - venue
   - scheduled start time
   - toss data when available
   - officials
5. Add lineup presentation when provider data is available.
6. Improve public market empty-state copy.

## Replace current bad copy with user-safe copy
Instead of:
- `No published odds right now`

Use copy like:
- `Markets are being prepared for this match.`
- `Check back closer to the start time for betting options.`
- `Live markets will open as the match approaches.`

## UI style direction
- use gradient surfaces, not flat panels
- use high-contrast typography
- use CSS-only transitions and hover/focus polish
- keep it responsive and close to full-width on mobile
- avoid JS-heavy animation

## Expected result
Pre-match cricket becomes a real event board rather than a generic odds list with operator language.

---

# Phase 3: Live Cricket Enrichment and Panel Architecture

## Goal
Use more of the SportsMonks cricket live payload so the live command center tells the full match story, not just score and odds.

## Problem being solved
The current live board has the skeleton of a command center, but not the complete cricket story. It does not yet clearly expose:
- who is batting
- who is bowling
- striker / non-striker when available
- current bowler when available
- toss context
- scoreboard context
- richer inning state

It also does not yet use the second panel correctly for live cricket event intelligence.

## Work
1. Extend the live scoreboard/HUD to show:
   - batting team
   - bowling team
   - striker
   - non-striker
   - current bowler
   - overs and inning context
   - toss winner and toss decision
2. Use scoreboard and ball data to improve the momentum narrative.
3. Use batting and bowling data to show player-level context cards where available.
4. Surface officials and match context where useful but do not overcrowd the primary live action area.
5. Keep the live board fast by preserving memoization on market rows and isolating score updates from market repaint churn.

## Panel 2 live-cricket content plan
When the selected match is live and the user is in the multi-panel sportsbook flow, Panel 2 should show compact cricket event intelligence such as:
- teams and current scoreline summary
- batting side and bowling side
- striker and non-striker if available
- current bowler if available
- current over and innings label
- toss winner and decision
- venue and stage
- lineup/playing XI summary where useful
- officials if present
- last six balls strip
- quick context like run rate / required rate
- visible back button to return to the wider match list or previous panel state

## Main page live-cricket content plan
The main page should continue to own the heavier high-attention areas:
- score HUD
- momentum wave
- market navigation tabs
- betting action grid
- quick-stake / quick-bet bar

## Full-page rule
If the user is already on the dedicated full cricket page:
- do not render a duplicated panel-shell experience
- do not show a fake hidden side panel
- the full page itself should be the main experience
- only use the panel split where the sportsbook panel architecture actually exists

## UI principles
- score first
- innings story second
- market action third
- event intelligence separated cleanly into Panel 2 when panel architecture is present
- everything visible at a glance
- no unnecessary scroll burden on desktop

## Animation rules
- CSS only
- use pulse, shimmer, opacity fades, gradient motion, and transition-based emphasis
- avoid JS-heavy animation libraries for continuous effects

## Expected result
The live cricket page becomes much more readable and feels closer to a premium sportsbook/trading terminal while staying performant, and the second panel becomes meaningfully useful during live cricket browsing.

---

# Phase 4: Luxury Responsive UI Pass

## Goal
Polish the full cricket page into a more premium, mobile-responsive, gradient-driven experience while keeping the rendering speed high.

## Work
1. Rework page backgrounds and section surfaces with CSS gradients.
2. Improve card density and spacing so desktop feels information-rich without becoming cluttered.
3. Make mobile layouts use nearly full width and stack naturally.
4. Tighten market rows and context cards using CSS transitions only.
5. Keep current React memoization and store separation intact so score updates do not cause visible UI stutter in market rows.
6. Ensure all interactions remain readable and tappable on mobile.

## Non-goals
- no canvas/chart dependency
- no heavy animation runtime
- no extra provider polling
- no breaking API contract changes

## Expected result
The cricket page feels more luxurious, more modern, and more readable on both mobile and desktop, while still being operationally fast.

---

## Execution Order
1. Phase 1: Provider data enrichment
2. Phase 2: Pre-match cricket redesign
3. Phase 3: Live cricket enrichment and panel architecture
4. Phase 4: Luxury responsive UI pass

This order is deliberate:
- richer provider data must exist first
- pre-match and live UI should be built on the final payload shape
- panel usage should be defined after the live data model is richer
- luxury polish should happen after the structure is correct

---

## Constraints and Safety Rules
- Do not break current live odds flow.
- Do not break quick-bet or bet slip behavior.
- Do not alter request frequency unless strictly required.
- Prefer additive payload evolution over contract mutation.
- Keep animations CSS-based for speed and stability.
- Preserve React memoization and live store rendering isolation.
- Do not duplicate the sportsbook panel shell inside the full-page cricket detail view.
- Panel 2 enhancements must remain visible and user-facing, not hidden or internal-only.

---

## Provider Documentation Notes
SportsMonks cricket docs indicate support for richer fixture/livescore enrichment using includes such as:
- `balls`
- `runs`
- `bowling`
- `batting`
- `venue`
- `stage`
- `season`
- `league`
- `visitorteam`
- `localteam`
- `scoreboards`
- `firstumpire`
- `secondumpire`
- `referee`
- `tvumpire`
- `manofseries`
- `manofmatch`
- `tosswon`
- `lineup`

This supports the product direction without needing a new provider lane.

---

## Final Product Target
A cricket command center that:
- feels premium
- is readable in one glance
- uses more of the SportsMonks cricket payload
- avoids operator-language mistakes on public pages
- remains fast under live updates
- uses CSS-driven gradients and transitions instead of heavy animation code
- uses Panel 2 intelligently for live cricket event intelligence when the panel architecture is present
- does not duplicate panel structure inside the dedicated full-page cricket match view
