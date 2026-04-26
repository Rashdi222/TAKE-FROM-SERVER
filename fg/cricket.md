# Cricket Architecture Summary

## Purpose
This document summarizes the current cricket architecture from feed import to live pricing, operator control, public display, and the remaining gaps.

## A. Provider And Match Lifecycle
1. Cricket fixtures and live state come from provider feeds, primarily SportMonks.
2. Provider imports normalize match state into the `matches` table.
3. Match status moves through:
   - `upcoming`
   - `live`
   - `closed`
   - `settled`
   - `cancelled`
4. `closed` means trading is finished.
5. `settled` means platform bet settlement has actually been executed.
6. A match that has ended at provider level should currently appear in `Closed` until settlement runs.

## B. Live Activation
1. When a cricket match transitions `upcoming -> live`, Phoenix enables in-play and suspends the market first.
2. Phoenix bootstraps the live pricing engine immediately.
3. If a live event arrives and there is no published platform board yet, Phoenix forces bootstrap again.
4. This is the recovery path for "live but no board" situations.

## C. Cricket LangGraph Engine
1. The cricket AI engine lives in `ai_engine/cricket/`.
2. Phoenix calls the existing cricket endpoint `/calculate_odds`.
3. The Python engine uses runtime config passed from Phoenix, not local env as the source of truth.
4. The runtime config comes from Super Admin AI settings via Phoenix.
5. The cricket graph now has these stages:
   - Context Manager
   - In-Play Generator
   - Reviewer / Risk Manager
   - Rate Emitter
6. The reviewer can:
   - approve
   - reject and retry
   - reject and keep suspended

## D. Cricket Memory / Match Context
1. Cricket LangGraph now has persistent per-match memory.
2. Memory is isolated by `match_id`.
3. The current persistence layer is SQLite inside the AI engine.
4. Memory is bounded with sliding windows so prompt/context size does not grow forever.
5. This means live pricing is no longer based only on the latest state payload.

## E. Python vs Phoenix Responsibility
1. Python LangGraph generates the live cricket prices.
2. Phoenix does not invent separate live prices in this path.
3. Phoenix decides what to do with LangGraph output:
   - publish directly
   - keep suspended
   - save as review draft
4. So the current architecture is:
   - LangGraph generates
   - Phoenix enforces lifecycle and publication policy

## F. Live Publication Modes
Cricket now supports two live AI publication modes per competition feed.

### 1. Auto Publish
1. Live event arrives.
2. Phoenix calls cricket LangGraph.
3. LangGraph returns generated markets.
4. Phoenix publishes those markets directly if checks pass.
5. The public live board updates automatically.

### 2. Review Required
1. Live event arrives.
2. Phoenix calls cricket LangGraph.
3. LangGraph returns generated markets.
4. Phoenix stores those generated markets as `draft` odds.
5. The match stays suspended for operator review.
6. Operator can review and publish manually.

## G. Where The Mode Is Controlled
1. Go to `/admin/cricket`.
2. Open `Feeds & Setup`.
3. Open `Cricket Automation Controls`.
4. Each feed now has:
   - `Auto Publish`
   - `Review Required`
5. This setting is saved in feed config as `live_ai_publish_mode`.

## H. Admin Review Surfaces
There is no dedicated tab literally named `Approval`, but review UI exists.

### 1. Admin Cricket Page
On `/admin/cricket` match cards you already have:
- `Generate`
- `Orchestrate`
- `Rewrite`
- `Publish`
- `Unpublish`
- `Odds Desk`

### 2. Draft Odds Board
If review mode is enabled, generated live boards appear in:
- `/admin/cricket`
- `Live Command Center`
- `Draft Odds`

### 3. Full Odds Workspace
The full review workspace is:
- `/admin/matches/:id/odds`
This page has:
- `Draft`
- `Published`
- `All`
- `Publish`
- `Unpublish`
- draft preview
- manual editing tools

## I. Public Live Board
1. The public/player live match page shows only active published platform odds.
2. Draft odds are not shown publicly.
3. If review mode is on, the public board remains suspended until manual publish happens.
4. If auto mode is on, live LangGraph prices can keep updating the public board directly.

## J. Reliability Fixes Already Applied
1. Live activation and bootstrap recovery were hardened.
2. Reviewer veto is now handled natively by Phoenix.
3. Heartbeat monitor was decoupled from unrelated schema columns.
4. Public odds route precedence was fixed.
5. Public live odds filtering was fixed so platform `in_play` odds are treated as bettable.
6. Live dashboard websocket churn was fixed by stabilizing the live store instance.
7. Admin cricket board tab counts now use actual loaded match rows instead of lagging feed metrics.
8. Ordinary live price movement no longer forces `manual_admin_review` automatically.

## K. What `manual_admin_review` Means Now
1. It is still a real suspension reason.
2. It is now mainly used when operator review is actually desired.
3. In `Review Required` live mode, LangGraph-generated live boards are intentionally held as draft for review.
4. It should no longer be triggered just because normal live prices moved materially.

## L. Current Cricket In-Play Reality
1. Ball-by-ball or live-state-driven repricing is supported by the architecture.
2. Python LangGraph is the live pricing engine.
3. Phoenix handles suspension, publish, resume, and operator review state.
4. In auto mode, in-play pricing can stay fully automated.
5. In review mode, the same LangGraph output is held as draft instead of being published immediately.

## M. Closed vs Settled
1. `Closed` and `Settled` are not the same.
2. `Closed` means the event is finished for trading.
3. `Settled` means bets were settled in the platform.
4. Right now the auto transition from `Closed -> Settled` is still a remaining gap.
5. So ended matches belong in `Closed` unless settlement has actually run.

## N. Remaining Gaps
1. Automatic `Closed -> Settled` lifecycle for cricket is still not fully wired.
2. The cricket admin page still does not have a dedicated obvious `Needs Review` tab.
3. The current review flow is functional but spread across:
   - match cards
   - Draft Odds board
   - Odds Desk
4. Runtime verification on real live matches is still needed continuously.

## O. Short Truth
1. Cricket live AI architecture is now materially built.
2. LangGraph generates the live prices.
3. Phoenix controls whether those live prices are auto-published or held for review.
4. Admin review is available through Draft Odds and Odds Desk.
5. The biggest remaining lifecycle gap is automatic settlement after matches close.
