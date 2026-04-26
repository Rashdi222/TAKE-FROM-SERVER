# Frontend Live Ops TODO

## Objective

Upgrade the Super Admin `Live Command Center` so each active live match card exposes:

- currently active odds/markets
- per-selection matched volume and liability
- per-selection suspend controls
- per-selection manual modify controls

This must be implemented with strict frontend modularity and without bloating the main live dashboard container.

## Constraints

- keep the main `Live Match Center` page thin
- use atomic components for rows, badges, and controls
- consume existing live websocket/API state where possible
- do not break current live card rendering for cricket
- design for both core markets and future fancy markets

## Phase 1: Audit And Data Contract

- [x] Inspect current Super Admin live cricket page structure and identify the exact component that renders the active live match card.
- [x] Audit current live match payloads available to the admin frontend:
  - match snapshot
  - odds rows
  - market suspension state
  - market state metadata
- [x] Audit whether per-selection matched volume and liability are already exposed in any admin API/websocket payload.
- [x] If exposure data is not yet present in the frontend payload, define the exact contract needed from backend:
  - `market_key`
  - `selection_key`
  - `matched_volume`
  - `liability`
  - `is_suspended`
  - `suspension_reason`
  - `last_price`
  - `market_family`
- [x] Confirm whether core and fancy markets should render through the same list component with family grouping.

## Phase 2: Component Decomposition

### Target component tree

- [x] `LiveMatchOpsCard`
  - existing parent card remains coordinator only
- [x] `LiveMarketsPanel`
  - expandable section inside the live card
  - owns grouped market rendering
- [x] `LiveMarketGroup`
  - groups rows by market family / market key
  - examples:
    - `Match Winner`
    - `Over / Under`
    - `Fancy`
- [x] `MarketOddsRow`
  - single odds row
  - renders label, price, volume, liability, state
- [x] `LiabilityBadge`
  - visual indicator for profit / risk / liability severity
- [x] `MatchedVolumeStat`
  - small metric display for exposure size
- [x] `AdminOddsControls`
  - suspend/resume button
  - modify button
- [x] `ModifyOddsDrawer` or `ModifyOddsModal`
  - manual override UI for one specific odds row
- [x] `MarketSuspensionPill`
  - displays suspended status and reason clearly

## Phase 3: UI/UX Requirements

### Market expansion inside live card

- [x] Add an expandable `Live Markets` section to each active live match card.
- [x] Render all active odds rows, not just summary-level card metadata.
- [x] Group rows by `market_key` or `market_family`.
- [x] Keep the default view scan-friendly:
  - compact on first load
  - expand for detail

### Per-selection financial visibility

- [x] Show `Matched Volume` per odds row.
- [x] Show `Liability` per odds row.
- [x] Distinguish:
  - favorable exposure
  - neutral exposure
  - dangerous negative liability
- [x] Use color and label treatment appropriate for a trading/risk desk.

### Per-selection admin controls

- [x] Add a per-row suspend control.
- [x] Add a per-row modify control.
- [x] Display loading/disabled states while a mutation is in flight.
- [x] Reflect backend-confirmed state after mutation.
- [x] Never rely on silent state changes; show explicit row status after action.

## Phase 4: State And Data Flow

- [x] Identify current hook/store used by Super Admin cricket live page.
- [x] Add a dedicated selector or derived mapper for:
  - grouped live odds
  - row exposure metrics
  - row suspension state
- [x] Normalize rows by stable identity:
  - `match_id`
  - `market_key`
  - `selection_key`
- [x] Ensure websocket/live refresh merges update the correct row instead of rerendering the whole card unnecessarily.
- [x] Preserve expansion state of cards/panels during polling or websocket updates.

## Phase 5: Suspend/Resume Interaction Contract

- [x] Wire per-row suspend button to the backend endpoint or admin mutation already used for market suspension.
- [x] If no per-row endpoint exists, define the required backend contract before UI coding.
- [x] On success, update row state to:
  - suspended
  - hidden/locked for user-facing frontend
- [x] Surface suspension reason in-row.
- [x] If backend supports family-level suspension only for some rows, clearly distinguish:
  - row suspension
  - whole market family suspension

## Phase 6: Manual Modify Workflow

- [x] Define the exact modify interaction for one odds row:
  - current price
  - new price input
  - optional admin note
  - submit / cancel
- [x] Reuse existing manual override infrastructure if present.
- [x] Ensure modify action targets one exact row identity only.
- [x] On success, reflect:
  - updated price
  - operator override marker
  - optional audit note

## Phase 7: Fancy Market Compatibility

- [x] Ensure the market panel can render future `fancy_markets` without needing a second UI rewrite.
- [x] Add market-family aware labels so fancy rows remain visually distinct from core rows.
- [x] Keep controls identical at row level so admin behavior stays consistent.

## Phase 8: Risk And Readability

- [x] Ensure profit/loss numbers are immediately legible on desktop.
- [x] Avoid collapsing critical risk data behind unnecessary clicks.
- [x] Make dangerous rows visually obvious.
- [x] Keep the layout compact enough for multiple live cards on one screen.
- [x] Ensure mobile/admin narrow widths still remain usable.

## Phase 9: Non-Breaking Delivery Order

- [x] Step 1: add read-only live markets panel
- [x] Step 2: add matched volume + liability badges
- [x] Step 3: add suspend control
- [x] Step 4: add modify workflow
- [x] Step 5: validate websocket refresh and optimistic state behavior

## Acceptance Criteria

- [x] Super Admin `Live` tab shows active live match cards with expanded market rows.
- [x] Each odds row shows:
  - price
  - matched volume
  - liability
  - suspension state
- [x] Admin can suspend one specific odds row from the live card.
- [x] Admin can modify one specific odds row from the live card.
- [x] UI updates correctly after backend confirmation.
- [x] Main live dashboard component remains thin and modular.
