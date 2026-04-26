# Project FCX: Volatility & Luxury Table

Date: 2026-03-28

## Audit Report

### Why the current UI is too heavy

The current Super Admin odds surface is operational, but it is still vertically expensive:

1. `MarketOddsGroup.tsx` renders each market family as a rounded card with a header block and per-row padding.
2. `MarketOddsRow.tsx` renders each selection as a mini card row with multiple wrapped badges, metadata lines, liability block, and control block.
3. `LiveMarketsPanel.tsx` adds another container card, header text, helper copy, and expand/collapse chrome above the actual markets.

Result:
- too much vertical space per market
- too few rows visible above the fold
- the visual rhythm is still “stack of cards” rather than “dense trading table”
- scanning 20+ markets at once is inefficient

The intel UX is already structurally correct because it uses an overlay, but the base row layout is still too tall for a luxury desk.

### Where the current Python math is too linear

The cricket engine is materially improved versus the original state, but the pricing core is still mostly linear in its mechanics:

1. `in_play_generator.py`
- fair candidate comes from:
  - LLM estimate or context fallback
  - then correction envelopes
- it does not yet have a dedicated non-linear “boundary necessity” model for extreme second-innings chases

2. `fancy_generator.py`
- session projections are built from weighted run-rate adjustments:
  - boundary rate
  - dot pressure
  - wicket cluster
  - phase factor
  - batting depth
- this is directionally useful, but it is still mostly weighted scalar math around expected run rate

3. Current bias/playbook system
- bookmaker bias and playbooks add bounded skew
- but they still depend on a fair layer that is not explicitly modelling “impossible chase geometry”

Result:
- the system can shade intelligently
- but it still does not deeply distinguish:
  - linear chase difficulty
  - boundary dependency
  - batter-specific finishing capacity
  - true long-shot necessity in final overs

That is the gap FCX should close.

## Phase 1: Boundary Necessity Node (Python)

### Goal

Stop treating second-innings chase pressure as mostly linear run-rate pressure.

The engine needs a dedicated node that asks:
- how much of the remaining chase can only be completed through boundary-heavy scoring?
- how realistic is that requirement given the current batting pair, venue, and innings phase?

### New module structure

Create:
- `ai_engine/cricket/boundary_necessity.py`

Potential helper split if needed:
- `ai_engine/cricket/finishers.py`
- `ai_engine/cricket/chase_geometry.py`

### Input model

The node should consume:
- runs required
- balls remaining
- wickets in hand
- current batsmen context if available from SportMonks raw feed
- batter historical strike-rate / boundary-rate dossier entries
- venue scoring profile
- innings number
- pitch/slow surface dossier hints
- current required run rate
- recent dot-ball pressure

### Core calculation

The node must estimate:

1. `required_boundary_runs`
- portion of remaining chase that cannot plausibly be met through singles/doubles only

2. `boundary_density`
- required boundaries per remaining ball block
- not just “RR is high”, but “how many 4/6 outcomes are mathematically necessary”

3. `finisher_capacity_index`
- dynamic estimate of whether current batsmen can produce those boundaries
- driven by historical strike-rate, boundary %, and matchup/venue context

4. `necessity_gap`
- difference between required boundary density and estimated finisher capacity

### Mode switch

If `necessity_gap` breaches threshold:
- activate `aggressive_mode`
- switch the bookmaker bias layer into long-shot posture

This is not a hardcoded “need 4 sixes in 10 balls”.
It must be calculated dynamically from:
- chase requirement
- remaining ball geometry
- current batter profile
- venue behavior

### Output contract

The node should emit:
- `boundary_density`
- `finisher_capacity_index`
- `necessity_gap`
- `aggressive_mode`
- `boundary_necessity_flags`
- `boundary_necessity_summary`

### Pricing effect

If `aggressive_mode` is active:
- fair probability remains mathematically honest
- bookmaker display probability can be stretched toward higher-volatility long-shot pricing
- reviewer elasticity can later allow wider but explicit dispersion under that flag

## Phase 2: High-Density Luxury Table UI (Next.js)

### Goal

Replace the vertical card-stack admin odds presentation with a dense, horizontal luxury trading table.

### New design direction

The desk should feel closer to:
- Bloomberg terminal density
- Binance order table compactness
- professional exchange monitoring

Not:
- stacked cards
- vertically separated content blocks

### Layout requirements

Create a table-style admin odds view with:
- slim rows
- sticky header
- compact column widths
- columnar scanning
- icon-level controls where possible
- popover intel that overlays, never pushes layout

### Suggested component decomposition

Create:
- `CricketLuxuryOddsTable.tsx`
- `CricketLuxuryOddsRow.tsx`
- `CricketLuxuryOddsHeader.tsx`
- `CricketLuxuryOddsCell.tsx`
- reuse existing:
  - `OddsIntelPanel.tsx`
  - `LiabilityBadge.tsx`
  - `MarketSuspensionPill.tsx`
  - `AdminOddsControls.tsx`

### Table columns

Target columns:
- Market
- Selection
- Published
- Fair
- Bookmaker Display
- Final Published
- Liability
- Volume
- Flags
- Status
- Actions

### Styling direction

- condensed spacing
- tighter line-height
- lower row height
- reduced decorative border weight
- frozen row height regardless of market suspend/review state
- icon-based `Quant` trigger instead of text-heavy button

### Migration strategy

Do not delete the existing grouped row system immediately.

Implement:
1. new luxury table path for admin desks
2. reuse the same data contract and intel popover
3. then phase out card presentation once the table is proven stable

## Phase 3: UI Stability & Anti-Flicker (React/Elixir)

### Goal

Make the admin desk visually stable during suspend/review/self-heal events.

### Current instability source

The current UI is grouped and card-based, so when:
- rows disappear
- suspend pills appear
- controls change width
- groups re-sort

the DOM shifts noticeably.

### No re-render rule

The UI should preserve row geometry even when trading state changes.

That means:
- same row height
- same cell count
- same column widths
- no card collapse
- no group expansion/contraction

### Target behavior

When a market suspends:
- do not remove the row
- freeze the published odds cell
- replace price with:
  - `--`
  - or a frozen/suspended token

When review/self-heal is active:
- keep the row mounted
- keep liability and identifiers visible
- mark price cell as frozen/pending

### React work

Implement:
- memoized row rendering
- stable `key` strategy by `odds.id`
- no re-grouping on every socket event unless market identity actually changes
- optimistic cell freezing instead of full list replacement

Potential modules:
- `useStableOddsTableModel.ts`
- `useFrozenMarketRows.ts`

### Elixir work

Broadcast stable state transitions explicitly:
- `state: active | suspended | retrying | frozen`

Do not force the UI to infer unstable state from disappearing rows alone.

### Result

The desk should visually stay still while backend self-heals in the background.

## Phase 4: Volatility Reviewer Elasticity (Python)

### Goal

Allow controlled long-shot expansion when `boundary_necessity` says the chase is in true desperation territory.

### Problem with current reviewer

Current reviewer logic is designed for safe bounded movement.
That is correct for ordinary live repricing, but too restrictive for FCX long-shot mode.

### Elasticity design

Add a new reviewer pathway:
- normal mode: current strict bounds
- volatility mode: expanded ceilings only when `boundary_necessity_flags` justify it

### Required logic

When `aggressive_mode` is active and justified:
- allow odds dispersion into very high ranges
- allow probabilities to compress far enough to produce 50.00+ style long shots
- but only for the specific selections justified by chase impossibility

### Guardrails

Elasticity must still require:
- explicit `boundary_necessity` justification
- playbook flag presence
- coherent market structure
- bounded asymmetry for opposing outcomes
- full reviewer audit trail

### New reviewer outputs

Emit:
- `volatility_mode_active`
- `volatility_reason`
- `elasticity_applied`
- `elasticity_ceiling`

### Safety principle

This phase is not “remove safety”.
It is:
- stretch the safety envelope only when the chase state mathematically justifies extreme odds
- log exactly why that stretch happened

## Execution Order

1. Build `boundary_necessity` node and telemetry
2. Thread telemetry into orchestrator, bias engine, and reviewer
3. Build luxury table UI on top of existing admin data contract
4. Add anti-flicker row-state model
5. Add reviewer elasticity behind explicit flags

## Success Criteria

### Engine
- second-innings impossible chases no longer look linearly priced
- long-shot display pricing is driven by boundary necessity, not generic RR pressure
- reviewer explicitly records when elastic volatility rules were used

### UI
- 20+ markets visible at once without card-stack scrolling
- intel opens in overlay only
- suspend/retry/self-heal does not cause visible layout jumping
- rows stay mounted and readable during backend recovery

### Operational
- high-risk/high-profit pricing can be monitored without ambiguity
- admins can see:
  - fair
  - bookmaker display
  - final published
  - volatility reason
  - self-heal state
