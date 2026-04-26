# Public Matches Redesign Brief

## Goal
Redesign the public `/matches` experience so it feels closer to a top sportsbook trading lobby than a raw fixture dump.

This page must outperform the current flat-card experience by improving:
- information hierarchy
- live vs upcoming prioritization
- sport and competition filtering
- date-based browsing
- card density without clutter
- conversion into match detail / betting flow

## Benchmark Direction
This brief is informed by current sportsbook interaction patterns seen across major operators and official product material.

Key benchmark traits:
- live first, not flat-list first
- fast filter switching with minimal cognitive load
- competition-aware grouping
- dense cards with clear hierarchy
- date and state segmentation
- strong in-play emphasis
- mobile-first chip/tab interaction
- desktop layout that can scale into a trading-board feel

Reference sources:
- SportMonks cricket docs and product pages
- bet365 product/review coverage emphasizing fast in-play tooling and control features
- DraftKings sportsbook product positioning around mobile-first sportsbook navigation

## Current Page Audit
Current public `MatchesPageClient` is too weak for sportsbook use.

Observed problems:
1. Flat grid of all matches
2. Only two weak filters: sport + status
3. No separation between live, today, tomorrow, week
4. No grouping by competition or date
5. No data-quality suppression for low-quality imported rows
6. No strong CTA hierarchy toward the best markets
7. No premium visual rhythm; cards feel like generic admin data tiles
8. No sport chip rail or quick segmented navigation
9. No live emphasis / urgency model
10. No competition identity on cards

## Product Principles
1. Live-first
2. Date-aware
3. Competition-grouped
4. Sport-filtered
5. Mobile-thumb friendly
6. Premium but dense
7. Public-safe data only
8. No noisy admin language
9. Bad imported rows must be filtered or visually degraded
10. The page should feel like a sportsbook lobby, not a schedule table

## Required User Outcomes
A user should be able to answer all of these within seconds:
- What is live right now?
- What is coming today?
- What is coming tomorrow?
- What matches belong to IPL vs PSL?
- Show me only cricket or only football
- Open a match quickly to see odds

## Target Information Architecture
### Level 1: State rail
- Live
- Today
- Tomorrow
- This Week
- All Upcoming

### Level 2: Sport rail
- All
- Cricket
- Football
- Tennis
- Horse Racing
- Dog Racing

### Level 3: Competition filter
Contextual to the selected sport.
Examples for cricket:
- IPL
- PSL
- Asia Cup
- BBL
- CPL

### Level 4: Grouped result sections
If one sport selected:
- group by competition
- then date buckets inside competition

If all sports selected:
- group by sport
- then competition
- then date

## Screen Blueprint

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Header                                                                       │
│ Brand | Search/CTA | Login/Profile                                           │
├──────────────────────────────────────────────────────────────────────────────┤
│ Matches Lobby                                                                │
│ Headline + small trust/coverage line                                         │
├──────────────────────────────────────────────────────────────────────────────┤
│ State Rail                                                                   │
│ [Live] [Today] [Tomorrow] [This Week] [All Upcoming]                         │
├──────────────────────────────────────────────────────────────────────────────┤
│ Sport Rail                                                                   │
│ [All] [Cricket] [Football] [Tennis] [Horse Racing] [Dog Racing]              │
├──────────────────────────────────────────────────────────────────────────────┤
│ Secondary Tools                                                              │
│ Competition dropdown | Date chip | Clear filters | Match count               │
├──────────────────────────────────────────────────────────────────────────────┤
│ Section: Cricket                                                              │
│   Subsection: IPL                                                             │
│   ├─ Wed, Mar 31                                                              │
│   │  [Card] Team A vs Team B | 7:00 PM | status | round | open odds          │
│   │  [Card] Team C vs Team D | 9:30 PM | status | round | open odds          │
│   ├─ Thu, Apr 1                                                               │
│   │  [Card] ...                                                               │
│                                                                              │
│   Subsection: PSL                                                             │
│   ├─ Wed, Mar 31                                                              │
│   │  [Card] ...                                                               │
├──────────────────────────────────────────────────────────────────────────────┤
│ Optional: Live strip                                                          │
│ horizontally scrollable high-priority live cards                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Card Specification
Each public match card should show:
- team 1 name
- team 2 name
- team logos if available
- sport badge
- competition name
- round/stage when available
- local date/time
- state chip: live / today / upcoming
- fast CTA: `View Odds` or `Open Match`

For live cards, additionally:
- stronger color emphasis
- current score if safe and available
- small in-play label
- higher prominence than upcoming cards

## Data Quality Rules
Public page must not expose junk imports blindly.

Rules:
1. hide rows where teams are placeholder values like `Team 1` / `Team 2`
2. require real start time
3. require public-safe status
4. prefer matches that have competition context
5. if row quality is incomplete but still potentially useful, degrade its visibility rather than making it primary

## Backend Support Needed
### Public match filters
Add support for:
- sport
- status/state bucket
- date bucket
- competition key / competition feed id
- date_from / date_to
- live_only shortcut

### Public match serializer enrichment
Expose consistent public-safe fields:
- competition name
- competition key
- season name
- round name
- venue name
- team logos
- live score summary where safe

### Public quality gate
Prefer backend-side suppression or tagging for low-quality rows so the public UI is not forced to infer everything client-side.

## Frontend Build Plan
### Phase 1: Data + filtering foundation
- add public query model for state/date/sport/competition
- add helper functions for date buckets
- define match quality rules

### Phase 2: Lobby shell redesign
- rebuild top section with state rail + sport chips
- add secondary toolbar for competition/date controls
- remove plain dropdown-only control pattern

### Phase 3: Grouped rendering
- group by sport/competition/date depending on current filter context
- add section headers and counts

### Phase 4: Card redesign
- premium card with logos, competition, time, round, CTA
- separate live-card visual treatment

### Phase 5: Mobile optimization
- horizontal chip rails
- compact grouped list layout
- sticky controls
- strong thumb-zone action placement

### Phase 6: Quality gate + polish
- suppress placeholder rows
- empty states per filter mode
- skeletons / loading behavior
- preserve SEO-friendly server shell around the client experience

## Visual Direction
This page should not look like generic SaaS.

Direction:
- dark premium sportsbook surface
- stronger information density
- restrained accent usage
- card hierarchy by state
- live cards feel urgent, upcoming cards feel schedulable
- competition headers create structure
- typography slightly sharper and more compact than current public cards

## Interaction Rules
1. State rail updates result groups immediately
2. Sport chips reduce competition list contextually
3. Competition selection narrows the grouped sections
4. Clear filters resets to default lobby state
5. Match click always goes to canonical match detail route
6. If no results, empty state should say why and how to recover

## SEO / Technical Constraints
- keep `/matches` indexable
- keep canonical stable
- avoid client-only data vacuum on first render if possible
- preserve existing match detail SEO path
- do not let filter state create index bloat without a deliberate canonical strategy

## Recommended Default State
Default `/matches` should open as:
- `Today`
- `All sports`
- with live strip at top if live matches exist

Reason:
- better immediate relevance than raw `all upcoming`

## Immediate Implementation Priority
1. public data-quality gate
2. state rail (`Live / Today / Tomorrow / This Week / All Upcoming`)
3. sport chips
4. competition grouping
5. upgraded cards

## Honest Constraint
This redesign will materially improve the public experience, but it depends on imported match quality.
For cricket specifically, the recent SportMonks enrichment work is the right foundation. After re-import/refresh, the public side can consume those richer fields.

## Success Criteria
The redesign is successful when:
- public matches are not a raw flat dump
- IPL and PSL are clearly separated
- live and upcoming are easy to scan
- low-quality rows do not dominate public view
- mobile interaction feels sportsbook-native
- the page looks intentional enough to compare credibly against mainstream sportsbook lobbies
