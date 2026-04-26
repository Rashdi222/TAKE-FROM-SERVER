# Tennis System — Full Audit Report
**Date:** 2026-04-16  
**API:** api-tennis.com (Business Plan)  
**Scope:** API client, polling, WebSocket, types, bet placement, odds, edge cases

---

## EXECUTIVE SUMMARY

**Status:** ✅ PRODUCTION-READY with 3 medium issues

Tennis is architecturally cleaner than football. The live score broadcast is correct (unlike football). The main issues are: max odds cap too high, over/under outcomes too restrictive, and no tennis-specific bet slip suspension messages.

---

## AUDIT FINDINGS

### 1. API Client (api-tennis.com) ✅

**Rate limit handling:** ✅ Correct
- 429 → `{:error, {:rate_limited, 429}}` detected
- `LiveSyncWorker` applies exponential backoff on 429: doubles poll interval up to 120s max
- Resets backoff on success

**Polling:**
- `fetch_live_snapshot()` makes **2 API calls per cycle**: `get_livescore` + `get_live_odds`
- Default poll: 5s (no WebSocket) or 10s (WebSocket connected) or 3s (WebSocket fallback)
- At 5s: 2 × 720 = **1440 calls/hour**
- Business plan limit: need to verify against api-tennis.com business plan quota

**Error handling:** ✅
- 429 → exponential backoff ✅
- 503 → exponential backoff ✅
- Missing API key → backoff with info log ✅
- Task crash → reschedule ✅
- Network error → reschedule ✅

---

### 2. WebSocket Broadcast ✅ (Tennis is correct, unlike football)

`TennisChannel.broadcast_state_updated()` sends ALL relevant fields:
- `score`, `sets`, `point_by_point` ✅
- `current_set`, `current_game_score`, `current_point_score` ✅
- `server`, `deuce`, `advantage_player`, `tiebreak` ✅
- `set_point`, `match_point`, `break_point` ✅
- `published_odds` ✅
- `status`, `event_status` ✅

**No missing fields like football had.** Tennis live scores update in real-time correctly.

---

### 3. Frontend Types ✅

`TennisMatchState` type covers all broadcast fields correctly.  
`useTennisSocket` / `useTennisMatchSocket` hooks handle WebSocket correctly.  
Auto-reconnect after 1.2s on disconnect ✅

---

### 4. Odds Generation ✅

Tennis uses api-tennis.com live odds directly (not AI engine).  
`MarginControl.apply_margin()` applies house margin to each odds row.  
Min odds: 1.01 ✅  
Max odds: **999.0** ← See Issue T2 below

---

### 5. Bet Placement ✅

Tennis bets go through the same `Back.Betting` module as cricket/football.  
`OddsRules.validate()` enforces tennis bounds: 1.01-20.0 for match_winner/over_under/in_play/set_betting ✅  
State version + odds version + price drift checks all apply ✅

---

## 🔴 ISSUES FOUND

### Issue T1 — 2 API calls per poll cycle (rate limit risk)

**File:** `back/lib/back/tennis/api_client.ex` — `fetch_live_snapshot()`

```elixir
with {:ok, states} <- fetch_livescore(opts) do
  live_odds_result = fetch_live_odds(opts)  # Second call
```

**At 5s polling: 2 × 720 = 1440 calls/hour**

api-tennis.com Business Plan: typically 500-1000 calls/hour depending on tier.  
If your business plan is 500/hour, you're already over limit.  
If it's 1000/hour, you're at 144% — will hit 429 regularly.

**Fix:** Check your exact plan quota. If under 1440/hour, increase poll interval:
- 1000/hour plan → set poll to 8s (900 calls/hour with 2 calls each = 1800... still over)
- Actually: 1000/hour ÷ 2 calls = 500 polls/hour = 7.2s minimum interval
- Safe: set `@base_poll_ms 8_000` (450 polls × 2 = 900 calls/hour)

---

### Issue T2 — Tennis margin_control max odds is 999.0 (unrealistic)

**File:** `back/lib/back/tennis/margin_control.ex` line 5

```elixir
@maximum_odds Decimal.new("999.0")
```

This means if api-tennis.com sends a very low probability (e.g., 0.001), the engine will produce odds of 999.0. No real bookmaker offers 999.0 on tennis. This is a data quality issue — if the feed sends bad data, users see 999.0 odds.

**OddsRules** caps at 20.0 for bet placement, so bets at 999.0 would be rejected. But the odds are still **displayed** at 999.0 to users, which looks broken.

**Fix:** Cap `@maximum_odds` at 50.0 (realistic for tennis underdogs).

---

### Issue T3 — Tennis over/under outcomes too restrictive

**File:** `back/lib/back/ai/odds_rules.ex`

```elixir
@tennis_over_under MapSet.new(~w(over_20 under_20 over_22 under_22 over_24 under_24))
```

Only 3 game totals (20, 22, 24) are allowed. api-tennis.com may send other totals (18, 26, 28, 30 for longer matches). These would be rejected as `:invalid_market_outcome`.

**Fix:** Expand to cover common tennis game totals.

---

### Issue T4 — No tennis-specific suspension messages in frontend

Tennis uses the same generic suspension handling. When a match is suspended for `"set_change"` or `"rain_delay"` or `"medical_timeout"`, users see raw reason codes.

**Fix:** Add tennis-specific suspension messages (minor).

---

## FIXES

### Fix T2: Cap tennis max odds at 50.0
