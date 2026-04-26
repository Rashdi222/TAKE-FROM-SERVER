# ODI Cricket — Full Production Plan
**Goal:** Add ODI format support without breaking existing T20 infrastructure  
**Approach:** 3 phases, non-breaking, additive only  
**Date:** 2026-04-15

---

## CURRENT STATE (T20 — Production Grade ✅)

The engine is fully production-ready for T20. All these are already working:

- Format detection: `infer_match_format()` returns `"odi"` correctly
- Par score: `_FORMAT_PAR_SCORE["odi"] = 285.0` ✅
- Total overs: `_FORMAT_TOTAL_OVERS["odi"] = 50` ✅
- Balls remaining: calculated correctly for 50 overs ✅
- FOW wicket probability: ODI phase-aware (powerplay 0.015, middle 0.020, death 0.035) ✅
- Venue bias: format-level fallback for ODI (defending_bias=0.02) ✅

**What's NOT ODI-ready:**

1. `FANCY_WINDOWS = (6, 10, 15, 20)` — T20 session windows. ODI needs (10, 20, 30, 50)
2. `innings_phase_factor()` — T20 phases (6, 15 overs). ODI phases are (10, 40 overs)
3. `build_fancy_markets()` doesn't receive `format_name` from orchestrator — always reads from `match_state.format` which may not be set
4. `valid_for_ms` — ODI markets can have longer validity (prices move slower)
5. `batting_depth_factor()` — T20 calibrated. ODI has different depth dynamics
6. Batsman milestone markets — T20 milestones (10, 20, 30). ODI needs (25, 50, 75, 100)
7. `DetailRefresher` — 3 fixtures/tick is fine for ODI too (same rate limit math)

---

## PHASE 1 — Format-Aware Fancy Markets (1-2 hours)

**Goal:** ODI gets correct session windows and phase factors. Zero T20 impact.

### Task 1.1: Add format_name param to build_fancy_markets

**File:** `ai_engine/cricket/fancy_generator.py`

```python
def build_fancy_markets(
    *,
    match_state: Any,
    memory_context: dict[str, Any],
    over_number: float,
    balls_remaining: int | None,
    confidence: float,
    margin: Decimal,
    engine_trace_id: str,
    runtime_config: Any | None = None,
    format_name: str = "t20",   # ADD THIS
) -> list[dict[str, Any]]:
```

Then replace the hardcoded `FANCY_WINDOWS` usage:

```python
# Replace:
for overs in FANCY_WINDOWS:

# With:
fancy_windows = (10, 20, 30, 50) if format_name == "odi" else FANCY_WINDOWS
for overs in fancy_windows:
```

### Task 1.2: Pass format_name from orchestrator

**File:** `ai_engine/cricket/orchestrator.py`

```python
def fancy_generator_node(state: GraphState) -> GraphState:
    request = state["request"]
    dossier = (state.get("memory_context") or {}).get("match_dossier") or {}
    format_name = dossier.get("format_name") or dossier.get("format") or "t20"
    
    raw_markets = build_fancy_markets(
        match_state=request.match_state,
        memory_context=state.get("memory_context") or {},
        over_number=state["over_number"],
        balls_remaining=state["balls_remaining"],
        confidence=max(0.25, state["context_probability_team1"]),
        margin=margin_for_request(request, DEFAULT_MARGIN),
        engine_trace_id=state["engine_trace_id"],
        runtime_config=resolved_runtime_config(request),
        format_name=format_name,   # ADD THIS
    )
```

### Task 1.3: ODI-aware innings_phase_factor

**File:** `ai_engine/cricket/fancy_generator.py`

```python
def innings_phase_factor(over_number: float, format_name: str = "t20") -> float:
    if format_name == "odi":
        if over_number < 10.0:   # ODI powerplay
            return 1.04
        if over_number < 40.0:   # ODI middle overs
            return 1.0
        return 1.06              # ODI death (40-50)
    else:  # T20
        if over_number < 6.0:
            return 1.03
        if over_number < 15.0:
            return 1.0
        return 1.08
```

Pass `format_name` to `innings_phase_factor()` inside `build_fancy_markets()`.

### Task 1.4: ODI valid_for_ms

**File:** `ai_engine/cricket/fancy_generator.py`

```python
def fancy_valid_for_ms(*, balls_remaining, wickets_total, overs_window, format_name="t20"):
    policy = get_engine_policy()
    
    # ODI prices move slower — longer validity
    if format_name == "odi":
        if balls_remaining is None:
            return int(4000 * policy.fancy_expiry_multiplier)
        if balls_remaining <= 12:
            return max(1200, int(1800 * policy.fancy_expiry_multiplier))
        if wickets_total >= 8 or balls_remaining <= 30:
            return max(1800, int(2500 * policy.fancy_expiry_multiplier))
        return max(2500, int(3500 * policy.fancy_expiry_multiplier))
    
    # T20 (existing logic unchanged)
    ...
```

**Verification:** Run existing T20 tests — all should pass unchanged.

---

## PHASE 2 — ODI Batsman Markets + Depth Factor (1-2 hours)

**Goal:** Correct batsman milestones and batting depth for ODI.

### Task 2.1: ODI batsman milestones

**File:** `ai_engine/cricket/batsman_generator.py`

```python
def build_batsman_runs_market(
    *,
    raw_data,
    batting_team,
    balls_remaining,
    margin,
    confidence,
    valid_for_ms,
    event_time=None,
    format_name="t20",   # ADD THIS
):
    ...
    # Replace hardcoded milestones:
    milestones = [25, 50, 75, 100] if format_name == "odi" else [10, 20, 30]
    for milestone in milestones:
        ...
```

Pass `format_name` from `batsman_generator_node` in orchestrator (same pattern as Task 1.2).

### Task 2.2: ODI partnership milestones

**File:** `ai_engine/cricket/batsman_generator.py`

```python
def build_partnership_market(..., format_name="t20"):
    ...
    milestones = [50, 100, 150, 200] if format_name == "odi" else [25, 50, 75, 100]
```

### Task 2.3: ODI batting depth factor

**File:** `ai_engine/cricket/fancy_generator.py`

```python
def batting_depth_factor(match_state: Any, format_name: str = "t20") -> float:
    wickets = int(getattr(match_state, "wickets_total", 0) or 0)
    if format_name == "odi":
        # ODI: 10 wickets, depth matters more in middle overs
        if wickets <= 2: return 1.05
        if wickets <= 5: return 1.0
        if wickets <= 7: return 0.92
        return 0.82
    else:  # T20
        if wickets <= 2: return 1.05
        if wickets <= 5: return 1.0
        if wickets <= 7: return 0.90
        return 0.78
```

**Verification:** Manually test with ODI match state — check that 50-over windows appear, milestones are 25/50/75/100.

---

## PHASE 3 — ODI Market Depth + Frontend Labels (1 hour)

**Goal:** ODI-specific market labels and over/under lines on frontend.

### Task 3.1: ODI over/under ladder lines

**File:** `ai_engine/cricket/market_factory.py`

The `over_under_ladder_market()` currently uses T20 total projections. For ODI, the projected total is 250-320. The ladder offsets (±2 steps) are already relative so they work — but the step size needs to be larger:

```python
def over_under_ladder_market(..., format_name="t20"):
    # ODI: larger step size (10 runs vs 5 runs for T20)
    step = 10.0 if format_name == "odi" else 5.0
    ...
```

Pass `format_name` from `build_candidate_markets()` via dossier.

### Task 3.2: Frontend ODI market labels

**File:** `next/src/lib/cricket/cricketMarketDictionary.ts`

Add ODI-specific window labels so "Runs In Next 10 Overs" shows correctly (not confusing for T20 users who see 6/10/15/20 windows).

```typescript
// Add ODI session labels
fancy_session_10_overs: "Runs In Next 10 Overs (ODI)",
fancy_session_20_overs: "Runs In Next 20 Overs (ODI)",
fancy_session_30_overs: "Runs In Next 30 Overs (ODI)",
fancy_session_50_overs: "Full Innings Total (ODI)",
```

### Task 3.3: ODI suspension banner

**File:** `next/src/components/cricket/live/CricketLiveHud.tsx`

Add ODI-specific suspension reason for drinks break (ODI has drinks breaks, T20 doesn't):

```typescript
case "drinks_break":
  return "Drinks break in progress. Betting resumes shortly."
```

**Verification:** End-to-end test with a mock ODI match state — verify 50-over windows, correct par score (285), correct phase factors, correct milestones.

---

## EXECUTION ORDER

```
Phase 1 (Day 1, ~2 hours)
  ├── Task 1.1: format_name param in build_fancy_markets
  ├── Task 1.2: pass format_name from orchestrator
  ├── Task 1.3: ODI innings_phase_factor
  └── Task 1.4: ODI valid_for_ms
  → Syntax check all files
  → Run existing T20 tests (must all pass)

Phase 2 (Day 1, ~2 hours)
  ├── Task 2.1: ODI batsman milestones
  ├── Task 2.2: ODI partnership milestones
  └── Task 2.3: ODI batting depth factor
  → Syntax check all files
  → Manual test with ODI match state

Phase 3 (Day 2, ~1 hour)
  ├── Task 3.1: ODI ladder step size
  ├── Task 3.2: Frontend ODI labels
  └── Task 3.3: ODI suspension banner
  → Full end-to-end test with live ODI match
  → Deploy to staging
  → Monitor for 1 ODI match
  → Deploy to production
```

---

## WHAT DOES NOT NEED CHANGING

These already work correctly for ODI — do NOT touch:

| Component | Why It's Already Correct |
|-----------|--------------------------|
| `format_total_overs()` | Returns 50 for ODI ✅ |
| `format_par_score()` | Returns 285.0 for ODI ✅ |
| `balls_remaining` calculation | Uses total_overs × 6 ✅ |
| `infer_match_format()` | Detects "odi" from feed ✅ |
| FOW wicket probability | ODI phase-aware already ✅ |
| Venue bias | ODI fallback (defending 0.02) ✅ |
| Toss delta | Works for ODI ✅ |
| Coherence checks | Format-agnostic ✅ |
| Bet placement protection | Format-agnostic ✅ |
| WebSocket/PubSub | Format-agnostic ✅ |
| Rate limiting | Format-agnostic ✅ |
| Memory/persistence | Format-agnostic ✅ |

---

## RISK ASSESSMENT

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| T20 markets broken by ODI changes | Low | High | All changes are additive with `format_name` param + default="t20" |
| ODI format not detected from feed | Medium | Medium | Add fallback: if `balls_remaining > 120`, assume ODI |
| ODI par score wrong for specific venues | Low | Low | Venue bias table already has ODI-specific adjustments |
| DetailRefresher rate limit with ODI + T20 | Low | Medium | Already capped at 3 fixtures/tick |

---

## TOTAL EFFORT

- Phase 1: ~2 hours
- Phase 2: ~2 hours  
- Phase 3: ~1 hour
- Testing + staging: ~2 hours

**Total: ~7 hours to full ODI production readiness**

---

## DEFINITION OF DONE

- [ ] ODI match shows 10/20/30/50 over session markets
- [ ] ODI par score is 285 (not 165)
- [ ] ODI batsman milestones are 25/50/75/100 (not 10/20/30)
- [ ] ODI phase factors correct (powerplay ≤10, middle ≤40, death >40)
- [ ] All existing T20 tests pass unchanged
- [ ] One live ODI match monitored on staging without errors
- [ ] No suspension during normal ODI reprice cycle
