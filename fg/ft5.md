# Football Orchestrator Status - `ft5`

## 1. Purpose

This document is the current execution status after `ft4.md`.

It answers four things clearly:
- what from `ft4.md` is done
- what extra work was added later from direct user instructions
- what still remains
- what the exact current runtime/product status is right now

This is a status-and-execution document, not the original planning file.

---

## 2. Executive Status

Current truth:
- football is no longer only an admin/import setup
- football now has a real super-admin management desk
- football now has a dedicated player/public live surface
- football now has provider-reference odds support in backend runtime
- football now has feed-level strategy control:
  - `Provider`
  - `AI Platform`
  - `Hybrid`
- football now has a dedicated Python AI endpoint and a dedicated Phoenix bridge
- football now has a materially deeper live-state model than before

But football is **not yet 100% finished**.

Main truth:
- the foundation is strong
- the main remaining gaps are around event-specific live triggering, broader market coverage, deeper incident tooling, and final runtime hardening

---

## 3. What From `ft4.md` Is Done

### Phase A: Truth & Cleanup

Done:
- stale football admin copy removed
- provider coverage indicators added on discovery/admin desk
- provider-reference odds health panel added in football workspace

Status:
- complete

---

### Phase B: User-Side Football Live Surface

Done:
- dedicated `LiveFootballMatchDashboard.tsx`
- dedicated `FootballScoreboard.tsx`
- dedicated `FootballRateField.tsx`
- dedicated football market board
- dedicated football live bet slip
- football live route integration so live football no longer uses only the generic detail surface

Status:
- complete

---

### Phase C: Football Risk & Live Market Controls

Done:
- football-specific suspension messaging
- football-specific live banners
- football operator controls for market-family suspend/resume
- football match suspend/resume controls
- football live risk summary on admin desk
- football workspace health messaging

Status:
- complete

---

### Phase D: LangGraph AI Integration & Hybrid Odds

Done:
- super-admin feed-level pricing strategy selection
- strategy persisted through feed config / booleans
- dedicated football AI endpoint:
  - `POST /calculate_football_odds`
- dedicated Phoenix football bridge:
  - `Back.Live.FootballLangGraphClient`
- `provider_only` runtime path implemented
- `ai_only` runtime path implemented
- `hybrid` runtime path implemented
- provider-vs-AI variance alerts implemented
- variance alerts surfaced in football workspace

Status:
- materially implemented

Important note:
- this phase is functionally built
- final quality still depends on provider data richness and runtime verification across target competitions

---

### Phase E: Advanced Football State Model

Done:
- football deep-state migration written
- `matches` schema upgraded for deep football state
- `match_live_events` schema upgraded for deep football state
- API-Football normalization upgraded to derive:
  - elapsed minute
  - stoppage minute
  - home/away score
  - red cards
  - corners
  - shots on target
  - tempo index
- upsert path persists those fields
- football AI state model upgraded
- football AI memory/checkpointer added
- public football live scoreboard upgraded to use deep state
- public football live dashboard upgraded to show deep state
- football admin workspace upgraded to show deep state
- football admin match cards upgraded with live micro-state

Status:
- materially advanced, not fully complete

---

## 4. What Was Added Later Beyond `ft4.md`

These were extra user-driven requirements executed after the original football plan.

### 4.1. Feed-Level Strategy Control

Added:
- explicit super-admin control for:
  - `Provider`
  - `AI Platform`
  - `Hybrid`
- visible OpenRouter model/configuration state in football desk context

Why it matters:
- football can now be run competition-by-competition, not only through one global assumption

Status:
- done

---

### 4.2. Provider-Only Runtime Publish Path

Added:
- `provider_only` is now a real runtime behavior
- provider reference odds can now drive a published board through Phoenix

Why it matters:
- the toggle now has operational meaning, not only config meaning

Status:
- done

---

### 4.3. Variance Alerts

Added:
- provider-vs-AI variance comparison
- alerts stored in match market state
- alerts shown in football workspace

Why it matters:
- operators can now detect when AI diverges too hard from provider reference odds

Status:
- done

---

### 4.4. Deep Football Surface On Admin/Public

Added:
- red cards
- corners
- shots on target
- stoppage
- tempo
on:
- public live football board
- football admin workspace
- football admin live cards

Why it matters:
- football is no longer a shallow score/minute-only surface

Status:
- done

---

## 5. Exact Current Runtime/Product Status

### 5.1. What Super Admin Can Do Right Now

Football super-admin can currently:
- discover leagues
- see coverage indicators
- create feeds
- import upcoming/live matches
- refresh live boards
- open live workspace panels
- generate platform odds
- orchestrate/rewrite odds
- publish/unpublish odds
- see provider-reference odds health
- compare provider reference vs platform odds
- choose strategy mode:
  - Provider
  - AI Platform
  - Hybrid
- suspend/resume football live market families
- see live risk messaging and banners

Status:
- strong

---

### 5.2. What Player/Public Can Do Right Now

Football player/public side can currently:
- open dedicated football sport page
- open dedicated football live match dashboard
- see football scoreboard and live status
- see football-specific market tabs
- see flashing rate cells on live updates
- use football-specific live bet slip
- receive stale-quote and suspension handling
- see deeper match context:
  - minute
  - stoppage
  - score
  - corners
  - red cards
  - shots on target
  - tempo

Status:
- good and beyond generic shared-board level
- not yet fully premium/trading-desk-complete

---

### 5.3. What AI/Pricing Can Do Right Now

Football pricing can currently operate in three modes:
- `Provider`
- `AI Platform`
- `Hybrid`

Current capability:
- provider reference odds can be fetched and used
- provider reference odds can be published in provider-only mode
- Phoenix can send football live state to the dedicated football AI endpoint
- Phoenix can send provider reference odds as baseline input to AI in hybrid mode
- AI output can be compared against provider odds for variance alerting
- football AI uses per-match memory/checkpointer support in the Python service layer

Status:
- materially functional
- still needs broader real-world validation across leagues and live states

---

### 5.4. What Is Still Not Fully Live-Complete

Not fully complete yet:
- football repricing triggers are still too coarse in practice
- football is not yet reacting deeply enough to event-specific triggers like:
  - red card
  - VAR review
  - penalty review
  - corner pressure spikes
  - shots-on-target momentum surges
- broader football market set is still incomplete
- higher-level football incident center is still incomplete
- deeper premium football UX can still be improved

Status:
- these are the main unfinished areas

---

## 6. What Still Remains

This is the honest unfinished list.

### 6.1. Football Event-Specific Trigger Routing

Still needed:
- trigger repricing from more than just score/minute-state changes
- explicitly react to:
  - red card
  - VAR review
  - penalty review
  - corner pressure shifts
  - shots-on-target swings
  - stoppage-time context swings

Why it matters:
- football pricing quality depends heavily on these events

Status:
- not complete

---

### 6.2. Richer Football Event Ingestion

Still needed:
- a more explicit football live event pipeline if API-Football event coverage is strong enough
- stronger event modeling instead of relying mainly on fixture snapshot deltas

Why it matters:
- event-aware repricing becomes more reliable and timely

Status:
- partial

---

### 6.3. Broader Football Market Set

Still needed:
- broader football market generation beyond the current core groups:
  - match winner
  - totals
  - BTTS

Future candidates:
- double chance
- next goal
- team totals
- draw no bet
- more in-play market families

Status:
- partial

---

### 6.4. Stronger Admin Alerting Surface

Still needed:
- dedicated football alert strip/panel for:
  - variance alerts
  - provider disconnect incidents
  - import failures
  - stale live board incidents
  - manual review clusters

Current reality:
- some alerts exist in workspace context
- there is no full football incident center yet

Status:
- partial

---

### 6.5. Full Deep-State UX Utilization

Still needed:
- make richer use of the new football state in the live UI, such as:
  - pressure balance visualization
  - stronger red-card emphasis
  - corner-pressure indicators
  - stoppage-time state strip
  - better urgency hierarchy in close late-game situations

Status:
- partial

---

### 6.6. Migration Activation

Still needed:
- run the football deep-state migration

Required command:

```bash
cd /home/nain/sixerbat/back
mix ecto.migrate
```

Current reality:
- code is ready
- DB is not upgraded until this runs

Status:
- pending operator action

---

## 7. Non-Breaking Status Relative To Cricket

Current truth:
- football work was kept isolated from cricket flows
- cricket-specific live UI components were not reused for football
- football got its own live dashboard and score/rate components
- football bridge logic was routed through football-specific modules
- cricket functionality should remain intact

But proper confidence still depends on regression testing in both sports after migration and live runtime checks.

Status:
- architecturally isolated
- runtime regression verification still advisable

---

## 8. Exact Next Recommended Execution Order

If continuing immediately, the correct order is:

1. Run the football migration
- activate deep football fields in DB

2. Implement football-specific trigger classification
- red card
- VAR review
- penalty review
- corner momentum
- shots-on-target pressure

3. Add stronger football incident/alert surface on admin desk
- make variance and provider failures visible at board level

4. Expand football market families
- double chance
- next goal
- team totals
- draw no bet

5. Upgrade football public live UX further
- better deep-state visualizations
- stronger premium trading feel

---

## 9. Final Summary

Done now:
- football is no longer just an admin feed feature
- football now has:
  - admin desk
  - live workspace
  - provider-reference odds
  - dedicated live player dashboard
  - dedicated AI endpoint
  - hybrid pricing path
  - deeper live-state model

Still remaining:
- event-specific trigger intelligence
- broader market set
- stronger incident tooling
- final premium deep-state UX
- migration activation

So the honest status is:
- football is **substantially built**
- football is **not yet 100% finished**
- the remaining work is now mostly advanced live-quality, risk, and expansion work rather than basic foundation work
