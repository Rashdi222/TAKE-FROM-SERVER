# Cricket AI Odds Engine — Audit + 3-Phase Fix Plan

---

## CONFIRMED AUDIT FINDINGS

Every issue below was verified by reading the actual source code. File + line references are included.

---

### ISSUE 1 — `DEFAULT_TOTAL_OVERS` is hardcoded to 20 everywhere
**File:** `cricket/context_manager.py` lines 12, 36, 225, 326

```python
DEFAULT_TOTAL_OVERS = 20
balls_remaining = max(DEFAULT_TOTAL_OVERS * 6 - balls_bowled, 0)
```

The format is detected in `dossier.py` (`odi`, `t20`, `test`) but **never passed back** to `context_manager`. For an ODI (50 overs), `balls_remaining` will be calculated as if only 20 overs exist. Every downstream calculation — fancy windows, exposure phase, boundary pressure, valid_for_ms — is wrong for non-T20 formats.

---

### ISSUE 2 — Toss decision is extracted but never used in probability
**File:** `cricket/dossier.py` line 172 (extracts toss), `cricket/context_manager.py` (no grep hit for "toss")

`build_match_dossier()` extracts `toss.winner_team` and `toss.decision`. `context_manager_node()` calls `ensure_match_dossier()` and gets the dossier back, but **zero lines in context_manager reference the toss**. In T20, winning the toss and choosing to field (dew advantage) shifts win probability by 5–12%. This is completely ignored.

---

### ISSUE 3 — Venue bias covers only 6 cities
**File:** `cricket/dossier.py` lines 123–128

```python
if any(token in venue_name for token in ["karachi", "lahore", "multan"]):
    chasing_bias = 0.08
if any(token in venue_name for token in ["dubai", "sharjah", "chennai"]):
    defending_bias = 0.06
```

Every other venue — Wankhede, Eden Gardens, Chinnaswamy, Headingley, MCG, etc. — gets `track_hint = "balanced"` with zero bias. That is the majority of cricket venues. The engine is effectively blind to venue conditions for 95% of matches.

---

### ISSUE 4 — LLM is disabled by default and has no warm path
**File:** `cricket/orchestrator.py` lines 89, 274

```python
llm_enabled: bool = False   # RuntimeConfig default
llm_enabled=False,          # resolved_runtime_config fallback
```

The LLM path requires `api_key` + `model` to be passed per-request. If not provided, the engine runs 100% deterministic. There is no local model fallback, no response caching, and no pre-warming. The LLM is architecturally present but operationally absent.

---

### ISSUE 5 — Margin is flat across all market types
**File:** `cricket/in_play_generator.py` lines 119–125

```python
if profile == "tight":   return Decimal("0.03")
if profile == "aggressive": return Decimal("0.06")
return default_margin    # 0.04
```

The same margin is applied to match_winner, over_under, fancy session markets, and in-play specials. Real bookmakers apply:
- Match winner: 3–5%
- Fancy/session markets: 8–15%
- In-play specials (next boundary, next wicket): 10–18%

Applying 4% to fancy markets is leaving significant margin on the table.

---

### ISSUE 6 — 165.0 is hardcoded as the "average winning score"
**File:** `cricket/context_manager.py` line 229

```python
innings_edge = (projected_total - 165.0) / 120.0
```

165 is a rough T20 average. For ODIs the par score is ~280–300. For spin-friendly T20 pitches it can be 140. This single constant produces wrong base probabilities for every non-standard match condition.

---

### ISSUE 7 — Fancy markets missing the highest-volume Indian market types
**File:** `cricket/fancy_generator.py` line 11

```python
FANCY_WINDOWS = (6, 10, 15, 20)
```

Missing markets:
- **Next over runs** (most-bet fancy on Indian exchanges — every single over)
- **Current over runs** (ball-by-ball)
- **Batsman runs** (top scorer, individual milestones)
- **Partnership runs** (next partnership total)
- **Fall of next wicket** (FOW score)
- **Method of dismissal** (caught/bowled/LBW/run-out)

The engine only offers session totals for 6/10/15/20 overs. This is a fraction of the fancy market depth expected on Indian platforms.

---

### ISSUE 8 — No wicket-method markets at all
**File:** Searched entire `cricket/` directory — zero results for `caught`, `bowled`, `lbw`, `dismissal_type`, `wicket_method`

Wicket method markets (caught behind, bowled, LBW, run-out, stumped) are high-margin, high-volume markets. They are completely absent.

---

### ISSUE 9 — Coherence check ignores fancy and ladder markets
**File:** `cricket/coherence.py` lines 50, 77

```python
for market_key in {"match_winner", "over_under", "in_play"}:   # two-way total check
for market_key in {"match_winner", "in_play"}:                  # drift check
```

`fancy_session_*` and `over_under_ladder` markets are never coherence-checked. A broken fancy price (e.g., Over 45.0 at 1.01 and Under 45.0 at 1.01) will pass the reviewer and be emitted.

---

### ISSUE 10 — Bookmaker skew cap is too tight for extreme events
**File:** `cricket/policy.py` lines 44–45

```python
bookmaker_max_absolute_skew=_float_env("CRICKET_BOOKMAKER_MAX_ABSOLUTE_SKEW", "0.03"),
bookmaker_max_volatility_skew=_float_env("CRICKET_BOOKMAKER_MAX_VOLATILITY_SKEW", "0.08"),
```

In a genuine death-over collapse (8 wickets down, 40 needed off 12 balls), the fair probability swing can be 25–40% in a single ball. The 8% volatility cap means the engine will be significantly mispriced vs. the market during the most volatile — and most bet — moments of a match.

---

### ISSUE 11 — No proactive suspension for standard bookmaker triggers
**File:** `cricket/orchestrator.py` — no proactive suspension logic outside reviewer rejection

The engine only suspends when the reviewer rejects. There is no proactive suspension for:
- Rain delay / DLS recalculation in progress
- DRS (umpire review) pending
- Ball change
- Injury timeout
- Power cut / floodlight failure
- Innings break (between innings)

Every bookmaker suspends markets during these events. The engine will keep emitting prices during a DRS review.

---

### ISSUE 12 — `brand_bias` keyword matching is broken
**File:** `cricket/dossier.py` line 174

```python
if any(token in name for token in ["indians", "kings", "super", "united", "knight", "sultans"]):
    return 0.08
return 0.03
```

"kings" matches Punjab Kings AND Chennai Super Kings AND any team with "kings" in the name. "super" matches every team with "super" in the name globally. This will apply the same 0.08 bias to completely different teams. It is a placeholder, not a real implementation.

---

### ISSUE 13 — Memory is SQLite with threading lock, not production-safe under load
**File:** `cricket/memory.py` lines 89, 100–101, 122–123

```python
with self._lock, self._connect() as conn:
    conn.execute("PRAGMA journal_mode=WAL")
```

WAL mode is set but a new connection is opened on every read/write. Under concurrent requests for the same `match_id` (e.g., multiple events arriving in the same over), the threading lock serializes everything. Redis is supported but only as an optional overlay — if Redis is unavailable, all writes fall back to SQLite with no connection pool.

---

### ISSUE 14 — No pre-match probability seeding
**File:** `cricket/context_manager.py` — `heuristic_base_probability()` is the cold-start path

When a match starts with no `current_odds` and no `prior_probability_team1` in memory, the engine falls back to a heuristic that uses only wickets, momentum, and a hardcoded 165.0 par score. There is no pre-match model, no H2H history, no team form, no pitch report integration. The first price emitted for a match is a rough guess.

---

## CORRECTIONS TO PREVIOUS AUDIT

Two items from the previous audit were **partially wrong** and need correction:

1. **SQLite concurrency** — WAL mode IS enabled (`PRAGMA journal_mode=WAL` confirmed at line 101). The concern is not WAL mode but the pattern of opening a new connection per operation rather than using a connection pool. Under high concurrency this causes lock contention, not data corruption.

2. **Memory Redis support** — Redis IS implemented as the primary store with SQLite as fallback. The concern is that Redis is optional and the fallback path (SQLite) has the concurrency issue described above.

---

---

# 3-PHASE FIX PLAN

---

## PHASE 1 — Critical Correctness (Fix Before Any Live Traffic)

These issues cause wrong prices or wrong market behavior right now. Fix all of these before going live on any format other than T20.

---

### P1-1: Format-aware `total_overs` (fixes Issues 1, 6)

**What to do:**
- Add a `total_overs` resolver function that reads `dossier["format"]` and returns 20 for T20, 50 for ODI, 90 for Test (per innings)
- Pass `total_overs` into `context_manager_node` and replace every hardcoded `DEFAULT_TOTAL_OVERS = 20` reference
- Replace the hardcoded `165.0` par score with a format-aware par score: T20=165, ODI=285, Test=350

**Files to change:** `context_manager.py`, `market_factory.py`

---

### P1-2: Toss delta in base probability (fixes Issue 2)

**What to do:**
- In `context_manager_node`, after `dossier` is loaded, extract `dossier["toss"]["decision"]` and `dossier["toss"]["winner_team"]`
- If the toss winner elected to field (bowl first) and it is the second innings, apply a +0.04 to +0.08 delta toward the chasing team depending on `venue_bias["chasing_bias"]`
- If the toss winner elected to bat and it is the first innings, apply a small defending bias
- Add this as a new `toss_delta` variable in the reasoning string

**Files to change:** `context_manager.py`

---

### P1-3: Proactive suspension triggers (fixes Issue 11)

**What to do:**
- Add a `should_proactively_suspend(event_type, match_state)` function that returns `(True, reason)` for: `rain_break`, `drs_review`, `innings_break`, `ball_change`, `injury_timeout`, `match_end`
- Call this at the start of `run_graph()` before invoking the LangGraph DAG
- If it returns True, skip the graph entirely and return a `CalculateOddsResponse` with all markets `is_suspended=True`

**Files to change:** `orchestrator.py`

---

### P1-4: Coherence check for fancy and ladder markets (fixes Issue 9)

**What to do:**
- In `coherence.py`, extend `check_two_way_totals()` to also check `over_under_ladder` and any `fancy_session_*` market keys
- For fancy markets, group by `(market_key, projected_line)` — each `(over_X.X, under_X.X)` pair must sum to between 1.00 and 1.20
- Add this check to `evaluate_market_coherence()` and pass fancy markets into it from `fancy_reviewer.py`

**Files to change:** `coherence.py`, `fancy_reviewer.py`

---

## PHASE 2 — Market Depth & Margin (Bookmaker-Grade Offering)

These issues mean the engine is missing revenue and market coverage. Fix after Phase 1 is stable.

---

### P2-1: Per-market-type margin (fixes Issue 5)

**What to do:**
- Replace the single `margin_for_request()` function with a `margin_for_market(market_type, profile)` function
- Define margins: match_winner=0.04, over_under=0.05, in_play_special=0.10, fancy_session=0.12, over_under_ladder=0.06
- Apply the correct margin when calling `price_two_way_market()` in `market_factory.py` and `fancy_generator.py`

**Files to change:** `in_play_generator.py`, `market_factory.py`, `fancy_generator.py`

---

### P2-2: Next-over runs fancy market (fixes Issue 7 partially)

**What to do:**
- Add a new `build_next_over_market()` function in `fancy_generator.py`
- Project next-over runs using `weighted_rr` already computed in `build_fancy_markets()`
- Offer a 5-rung ladder: lines at projected ± 2, ± 1, 0 (e.g., Over 7.5, Over 8.5, Over 9.5, Over 10.5, Over 11.5)
- Apply a higher margin (0.12) and shorter `valid_for_ms` (max 900ms)
- Add this to the markets returned by `build_fancy_markets()`

**Files to change:** `fancy_generator.py`

---

### P2-3: Fall-of-wicket (FOW) market (fixes Issue 7 partially, Issue 8)

**What to do:**
- Add a new `build_fow_market()` function in a new file `cricket/fow_generator.py`
- Project the score at which the next wicket falls using: current score + (expected_rpb × expected_balls_to_wicket)
- Expected balls to wicket = 1 / wicket_probability_per_ball (derive from recent wicket rate in memory)
- Offer a 3-rung ladder: FOW at projected ± 5, ± 0 (e.g., FOW Under 145, FOW 145–155, FOW Over 155)
- Wire into `orchestrator.py` as a new graph node or as an extension of `fancy_generator_node`

**Files to change:** new `cricket/fow_generator.py`, `orchestrator.py`

---

### P2-4: Venue bias table (fixes Issue 3)

**What to do:**
- Create a `VENUE_BIAS_TABLE` dict in `dossier.py` covering the top 30 cricket venues by name keyword
- Include: all IPL venues, all PSL venues, all international grounds (Lords, MCG, SCG, Headingley, Newlands, etc.)
- Each entry: `{chasing_bias, defending_bias, pitch_degradation, track_hint, volatility_score}`
- Fall back to format-level defaults (T20: balanced 0.0, ODI: slight defending 0.02) when venue not found
- Replace the current 6-city if/else block

**Files to change:** `cricket/dossier.py`

---

### P2-5: Fix `brand_bias` to use team ID not name keywords (fixes Issue 12)

**What to do:**
- Replace keyword matching with a `TEAM_BRAND_BIAS` dict keyed by normalized team name or competition-specific team ID
- Define explicit entries for IPL teams, PSL teams, international teams
- Default to 0.03 for unknown teams
- Use `competition["id"]` from the dossier to scope the lookup (IPL teams vs PSL teams with same name)

**Files to change:** `cricket/dossier.py`

---

## PHASE 3 — Intelligence & Scale (Full Bookmaker Grade)

These issues require more design work. Fix after Phase 2 is live and stable.

---

### P3-1: Raise volatility skew cap with event-severity scaling (fixes Issue 10)

**What to do:**
- Add a new policy parameter `bookmaker_max_critical_skew` (default 0.18)
- In `bookmaker_bias.py`, when `critical_event_exception(event_type)` is True AND `aggressive_mode` is True, use `bookmaker_max_critical_skew` instead of `bookmaker_max_volatility_skew`
- Scale the cap dynamically: `cap = base + (necessity_gap * 0.4)` capped at 0.22
- This allows the engine to move 18–22% on a genuine collapse instead of being stuck at 8%

**Files to change:** `cricket/policy.py`, `cricket/bookmaker_bias.py`

---

### P3-2: Pre-match probability seeding (fixes Issue 14)

**What to do:**
- Add a `PreMatchSeed` model to `orchestrator.py` with fields: `team1_win_probability`, `team2_win_probability`, `source`, `confidence`
- Accept this as an optional field in `CalculateOddsRequest`
- In `context_manager_node`, if `pre_match_seed` is present and `prior_probability_team1` is None (first event of match), use the seed probability as the base instead of the heuristic
- The seed can come from: external odds feed, historical H2H model, or operator manual entry

**Files to change:** `orchestrator.py`, `context_manager.py`

---

### P3-3: LLM warm path with response caching (fixes Issue 4)

**What to do:**
- Add a `LLMResponseCache` class (Redis-backed, TTL=30s) that caches LLM responses keyed by `(match_id, state_version)`
- Before calling OpenRouter, check the cache. If hit and within TTL, use cached probability
- Add a `llm_warm_enabled` flag to `RuntimeConfig` that pre-fetches an LLM probability on `innings_break` events (when there is time) and stores it in the cache for the first ball of the next innings
- This reduces LLM latency from 800–2000ms to near-zero for cached responses

**Files to change:** `cricket/in_play_generator.py`, `cricket/memory.py` (or new `cricket/llm_cache.py`)

---

### P3-4: Batsman and partnership markets (fixes Issue 7 fully)

**What to do:**
- Add `build_batsman_runs_market()` in a new `cricket/batsman_generator.py`
- Use `raw_data["batting"]` strike rates and current scores to project individual batsman milestones (next 10, 20, 30 runs)
- Add `build_partnership_market()` projecting current partnership total using combined strike rates
- These require reliable batsman data from the feed — gate behind a `raw_data` quality check

**Files to change:** new `cricket/batsman_generator.py`, `orchestrator.py`

---

### P3-5: Connection pool for SQLite fallback (fixes Issue 13)

**What to do:**
- Replace the per-call `sqlite3.connect()` pattern with a module-level connection pool (use `queue.Queue` with 3–5 pre-opened connections)
- Or: make Redis mandatory in production and document SQLite as dev-only
- Add a health check endpoint that verifies Redis connectivity and warns if falling back to SQLite

**Files to change:** `cricket/memory.py`

---

## SUMMARY TABLE

| Phase | Issue # | Description | Files | Effort |
|-------|---------|-------------|-------|--------|
| P1 | 1, 6 | Format-aware total_overs + par score | context_manager.py, market_factory.py | Small |
| P1 | 2 | Toss delta in base probability | context_manager.py | Small |
| P1 | 11 | Proactive suspension triggers | orchestrator.py | Small |
| P1 | 9 | Coherence check for fancy/ladder | coherence.py, fancy_reviewer.py | Small |
| P2 | 5 | Per-market-type margin | in_play_generator.py, market_factory.py, fancy_generator.py | Medium |
| P2 | 7 | Next-over runs fancy market | fancy_generator.py | Medium |
| P2 | 7 | Fall-of-wicket market | new fow_generator.py, orchestrator.py | Medium |
| P2 | 3 | Venue bias table (30 venues) | dossier.py | Medium |
| P2 | 12 | Fix brand_bias to use team ID | dossier.py | Small |
| P3 | 10 | Raise volatility skew cap | policy.py, bookmaker_bias.py | Small |
| P3 | 14 | Pre-match probability seeding | orchestrator.py, context_manager.py | Medium |
| P3 | 4 | LLM warm path + response cache | in_play_generator.py | Medium |
| P3 | 7 | Batsman + partnership markets | new batsman_generator.py, orchestrator.py | Large |
| P3 | 13 | SQLite connection pool | memory.py | Small |
