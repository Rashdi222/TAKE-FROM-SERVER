# Live Cricket Audit And 4-Step Delivery Plan

## 1. What the system actually does today

### Current live flow
1. Sportmonks drives the live cricket match state.
   - When a ball/event comes in, `CricketSportmonksConsumer` updates the match row.
   - It updates status, innings, over, ball, score, run rate, momentum, last live event time, and suspension metadata.

2. The cricket router decides whether the match needs repricing.
   - If the match is live and there are no published platform odds yet, it forces a bootstrap recovery path.
   - If the event is important enough, it queues a cricket reprice request.

3. LangGraph receives the per-match context and reprices the board.
   - The AI engine gets the match state, current published odds, liability book, and runtime config.
   - The cricket graph has per-match memory in SQLite and per-match context building.
   - It uses score, innings, over, ball, batting side, required/current run rate, momentum, recent events, and prior reprices.

4. MarketManager decides what becomes visible to users.
   - If live publish mode is `auto_publish`, the new live platform odds become published and visible.
   - If live publish mode is `review_required`, live AI prices are stored as drafts and the public board stays suspended until manual publish.

5. The public match page shows only published platform odds.
   - It does not directly show raw 1xBet scraper odds.
   - Even if 1xBet has source odds, the public board can still look empty if platform odds were not published yet.

6. 1xBet is currently a live source/reference layer, not the final public rendering layer.
   - The scraper can fetch source odds for mapped matches.
   - The system can trigger targeted 1xBet refreshes for mapped cricket matches.
   - AI can advise when source refresh is needed.
   - But user-facing odds still depend on platform publication.

### What the AI already does well
- Keeps per-match memory.
- Understands ball-by-ball context.
- Reprices according to score pressure, batting side, wickets, run rate, momentum, and recent event history.
- Uses current board state and prior probability to avoid unrealistic jumps.
- Can advise source refresh when the match looks stale or confusing.

### What the AI does not do
- It does not invent bookmaker source odds.
- It does not replace 1xBet as source truth.
- It does not directly render the public board.

## 2. Audit findings and current bugs

### Finding A. Public live cricket is still gated by platform publication
This is the biggest reason users can see a live match but no odds.

What happens:
- Sportmonks can mark the match live.
- 1xBet can have source odds.
- LangGraph can even be healthy.
- But if platform live odds are not yet published, the public page still shows no odds.

Impact:
- Users think the live board is broken.
- Operators think the scraper failed, even when the real issue is publish state.

### Finding B. `review_required` can intentionally keep the live board empty
If the cricket feed is set to `Review Required`, the system stores live AI prices as draft odds and keeps the market suspended until manual publish.

Impact:
- This is correct behavior for review mode.
- But it is easy to mistake it for a live data failure.
- The product needs clearer surfacing of this state.

### Finding C. Whole-match suspension is still used too often
Today the system still suspends the whole cricket board in several paths:
- bootstrap without a board
- AI timeout
- AI engine unavailable
- unrecoverable anomaly
- some router decisions

Impact:
- A local failure can hide the whole board.
- This feels too aggressive for users.
- It does not match the desired behavior of pausing only the affected market family or odds row where possible.

### Finding D. The public board depends on AI publish timing more than on source freshness
The current chain is:
- Sportmonks live event
- maybe source refresh
- AI reprice
- platform publish
- public board visible

Impact:
- If any stage between source fetch and publish is delayed, the user sees a blank or paused board.
- The user does not care which stage failed; they only see missing odds.

### Finding E. Prematch -> Live -> Ended is not surfaced as one clean state ladder
The code handles these transitions, but the product experience is still fragmented.

Current result:
- prematch board exists
- live board exists
- ended/settled logic exists
- but the user-facing transition can still feel inconsistent if publication or suspension gets in the way

Impact:
- The user experience is not yet “100 channel and pub/sub clean” from prematch to live to ended.

### Finding F. 1xBet source refresh is present, but it is still advisory-driven and publish-dependent
The system now has:
- mapped-match targeted fetch
- AI refresh advice
- automation around fetches
- result tracking

But the missing part is this:
- source odds freshness is not yet made into a first-class public board readiness signal

Impact:
- Source can be fresh while public board still looks stale or empty.

## 3. What is already good and should be kept

1. Sportmonks is the correct match-state source for cricket.
2. 1xBet is the correct source/reference layer for live bookmaker odds.
3. LangGraph already has the right per-match memory and context model for ball-by-ball repricing.
4. The targeted 1xBet refresh path is the right pattern when AI is uncertain or source looks stale.
5. The recent work on Matchmaker and automation controls is useful and should stay.

## 4. 4-step plan to make this work the way we want

### Step 1. Make the live lifecycle deterministic and visible
Goal:
- One clear path from prematch -> live -> ended.

Do this:
- Define one explicit live board readiness state per match.
- Track these states clearly:
  - `prematch_ready`
  - `live_bootstrapping`
  - `source_refreshing`
  - `repricing`
  - `published_live`
  - `review_blocked`
  - `partially_paused`
  - `ended`
- Make both admin and public UI read from that state instead of inferring from scattered flags.

Why:
- This removes the confusion where a match is live but the odds page looks blank for unclear reasons.

### Step 2. Separate source odds freshness from public publish readiness
Goal:
- Make it obvious whether the issue is source fetch, AI pricing, or publication.

Do this:
- Persist per-match source freshness metadata for 1xBet on the same live cricket path.
- For each mapped live match track:
  - last source fetch requested at
  - last source fetch completed at
  - last source market count
  - source freshness age
  - last AI reprice at
  - last platform publish at
- Expose this in admin and use it in the live recovery logic.

Why:
- This lets us answer the real question fast:
  - “Did source odds arrive?”
  - “Did AI price them?”
  - “Were they published?”

### Step 3. Replace broad board suspension with scoped market control
Goal:
- Do not blank the whole live board when only one family is affected.

Do this:
- Reserve full-board suspension only for true match-wide failures.
- Default to scoped suspension for:
  - one market family
  - one market key
  - one odds row
- Keep previously published unaffected families visible where safe.
- If source or AI fails for only one family, pause that family and keep the rest open.

Why:
- This matches real trading behavior better.
- It gives users a stable board instead of a disappearing board.

### Step 4. Create a full live recovery loop driven by state and freshness
Goal:
- Make live odds automatic and resilient.

Do this:
- On Sportmonks live update:
  1. update match context
  2. decide if current source odds are stale for this match
  3. if stale or uncertain, request targeted 1xBet refresh
  4. once source odds arrive, run AI reprice using current match memory and context
  5. if feed mode is `auto_publish`, publish immediately
  6. if feed mode is `review_required`, show exact review-blocked state
  7. when the match finishes, immediately stop live refreshes and move board to ended state
- Add watchdogs for:
  - stale source odds
  - stale published board
  - repeated AI failures
  - stuck bootstrap state

Why:
- This creates the exact behavior you asked for:
  - live match comes in
  - source odds refresh when needed
  - AI reprices from ball-by-ball state
  - uncertain state can request a fresh 1xBet pull
  - ended match exits live cleanly

## 5. Bugs to fix as part of this plan

1. Public live cricket still has a hidden dependency on platform publication.
2. `review_required` is not surfaced strongly enough to operators/users.
3. Whole-board suspension is too broad.
4. Source freshness and publish readiness are not joined into one observable live state.
5. End-of-match transition needs stronger immediate shutdown of live refresh + clearer ended presentation.

## 6. Recommended execution order

1. Build the explicit per-match live board readiness state.
2. Add source freshness and publish timing telemetry per live cricket match.
3. Narrow suspension from whole-board to scoped market-family control.
4. Wire the full recovery loop so source refresh, AI repricing, publish, and end-state cleanup run automatically and observably.

## 7. Final conclusion

The current system is not broken in one place. It is split across three truths:
- Sportmonks truth = match state
- 1xBet truth = source odds
- platform truth = published user-facing odds

The AI layer is already strong enough for per-match cricket repricing and memory.
The remaining work is to make the handoff between those truths explicit, observable, and less aggressive when something partially fails.

That is the path to getting the user experience you want:
- prematch clean
- live odds appear reliably
- partial issues do not blank the whole board
- stale/confused conditions trigger targeted source refresh
- ended matches stop instantly and look finished, not broken
