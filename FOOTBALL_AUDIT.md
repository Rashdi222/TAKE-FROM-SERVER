# Football System — Full Audit Report
**Date:** 2026-04-15  
**Scope:** Frontend UI, API types, WebSocket, Backend endpoints, Database  
**Status:** 🔴 CRITICAL BUG FOUND — Scores showing 0 on live page

---

## ROOT CAUSE OF "SHOWING 0" BUG

### 🔴 CRITICAL — Football score fields NOT broadcast via WebSocket

**File:** `back/lib/back_web/channels/match_channel.ex` — `broadcast_match_state_updated()`

**Current broadcast payload:**
```elixir
%{
  match_id, status, live_state_version, live_event_seq,
  current_innings, current_over, current_ball_in_over,  # Cricket fields ✓
  runs_total, wickets_total, batting_team, bowling_team, # Cricket fields ✓
  momentum_index, market_state, suspended_markets,
  score, cricket_context, football_context, payload
}
```

**MISSING football fields:**
```
home_score        ← NEVER BROADCAST
away_score        ← NEVER BROADCAST
elapsed_minute    ← NEVER BROADCAST
stoppage_minute   ← NEVER BROADCAST
home_red_cards    ← NEVER BROADCAST
away_red_cards    ← NEVER BROADCAST
home_corners      ← NEVER BROADCAST
away_corners      ← NEVER BROADCAST
home_shots_on_target  ← NEVER BROADCAST
away_shots_on_target  ← NEVER BROADCAST
tempo_index       ← NEVER BROADCAST
```

**What happens:**
1. Match starts: frontend loads initial data via HTTP → scores show correctly ✓
2. Goal scored: backend updates `home_score` in DB ✓
3. Backend broadcasts `match_state_updated` → **home_score NOT included** ✗
4. Frontend `applyMatchStateUpdated()` receives payload → no score fields → keeps old values
5. If page is refreshed: HTTP call gets correct score ✓
6. Without refresh: score stays at initial value (0-0 if page loaded before kickoff)

**The fields ARE in the database** (`live_state_fields` includes all football fields).  
**The fields ARE sent to the AI engine** (`football_lang_graph_client.ex` reads them).  
**The fields ARE in the HTTP API** (`match_controller.ex` serializes them).  
**The fields ARE in the frontend Match type** (`matches.ts` has all fields).  
**The fields ARE NEVER broadcast via WebSocket.**

---

## FULL AUDIT FINDINGS

### 1. Database Schema ✅
All football fields exist in the `matches` table:
- `home_score`, `away_score` (integer, default 0)
- `elapsed_minute`, `stoppage_minute` (integer)
- `home_red_cards`, `away_red_cards` (integer, default 0)
- `home_corners`, `away_corners` (integer, default 0)
- `home_shots_on_target`, `away_shots_on_target` (integer, default 0)
- `tempo_index` (decimal)

**Status:** ✅ Schema correct

---

### 2. Backend Data Flow ✅ (except broadcast)

**How football scores get into DB:**
1. API Sports provider fetches live fixture data
2. `football/api_sports/enrichment.ex` normalizes and persists via `live_state_changeset`
3. `live_state_changeset` includes all football fields ✅
4. `broadcast_match_state_updated` called — **but missing football fields** ❌

**AI Engine receives correct data:**
- `football_lang_graph_client.ex` reads `match.home_score`, `match.away_score`, `match.elapsed_minute` ✅
- Probability calculation uses correct scores ✅

---

### 3. HTTP API ✅
`match_controller.ex` serializes `home_score`, `away_score`, `elapsed_minute` correctly.  
Initial page load shows correct scores. ✅

---

### 4. WebSocket / PubSub ❌ BROKEN
`broadcast_match_state_updated` missing all football-specific fields.  
Frontend never receives score updates after initial load.

---

### 5. Frontend Types ✅
`next/src/lib/api/types/matches.ts` has all fields:
- `home_score`, `away_score`, `elapsed_minute`, `stoppage_minute`
- `home_red_cards`, `away_red_cards`, `home_corners`, `away_corners`
- `home_shots_on_target`, `away_shots_on_target`, `tempo_index`

---

### 6. Frontend Store (matchLiveStore.ts) ❌ BROKEN
`applyMatchStateUpdated()` does NOT update football fields:
```typescript
// These are MISSING from applyMatchStateUpdated:
home_score, away_score, elapsed_minute, stoppage_minute,
home_red_cards, away_red_cards, home_corners, away_corners,
home_shots_on_target, away_shots_on_target, tempo_index
```

Even if the broadcast was fixed, the store wouldn't apply the values.

---

### 7. Frontend MatchStateUpdatePayload type ❌ BROKEN
`next/src/lib/live/types.ts` — `MatchStateUpdatePayload` missing football fields:
```typescript
// MISSING from MatchStateUpdatePayload:
home_score?: number;
away_score?: number;
elapsed_minute?: number;
stoppage_minute?: number;
home_red_cards?: number;
away_red_cards?: number;
home_corners?: number;
away_corners?: number;
home_shots_on_target?: number;
away_shots_on_target?: number;
tempo_index?: number | string | null;
```

---

### 8. Football Scoreboard Component ⚠️ PARTIAL
`FootballScoreboard.tsx` reads from `match.home_score` and `match.away_score` directly.  
Works on initial load. Breaks on live updates because store never updates these fields.

The `footballDeepStats()` function reads `home_red_cards`, `home_corners`, etc. — same issue.

---

### 9. pruneExpiredOdds Timer ❌ SLOWER THAN CRICKET
Football dashboard uses `setInterval(1000ms)` — same as old cricket (before we fixed it to 300ms).  
Football in-play odds can expire in 700-900ms. Stale prices shown for up to 1900ms.

---

### 10. Football AI Engine ✅
`ai_engine/football/orchestrator.py` correctly uses `home_score`, `away_score`, `elapsed_minute`.  
Probability calculation is format-aware. No issues found.

---

### 11. OddsRules for Football ✅
`back/lib/back/ai/odds_rules.ex` — football bounds: 1.01-20.0 for match_winner/over_under/in_play.  
Correct for football markets.

---

## ISSUES SUMMARY

| # | Severity | Component | Issue |
|---|----------|-----------|-------|
| F1 | 🔴 CRITICAL | `match_channel.ex` | Football score fields not broadcast via WebSocket |
| F2 | 🔴 CRITICAL | `matchLiveStore.ts` | `applyMatchStateUpdated` doesn't update football fields |
| F3 | 🔴 CRITICAL | `types.ts` | `MatchStateUpdatePayload` missing football fields |
| F4 | 🟡 MEDIUM | `LiveFootballMatchDashboard.tsx` | `pruneExpiredOdds` runs every 1000ms (should be 300ms) |
| F5 | 🟡 MEDIUM | `match_channel.ex` | `football_context` only sent if in `raw_data.football_context` — may be empty for some providers |

---

## FIXES REQUIRED

### Fix F1 (Backend — 15 min)
Add football fields to `broadcast_match_state_updated` in `match_channel.ex`

### Fix F2 (Frontend store — 15 min)
Add football fields to `applyMatchStateUpdated` in `matchLiveStore.ts`

### Fix F3 (Frontend types — 5 min)
Add football fields to `MatchStateUpdatePayload` in `types.ts`

### Fix F4 (Frontend — 2 min)
Change `setInterval(1000)` to `setInterval(300)` in `LiveFootballMatchDashboard.tsx`

---

## ESTIMATED EFFORT
- All 4 fixes: **~45 minutes**
- After fixes: Football live scores update in real-time without page refresh ✅
