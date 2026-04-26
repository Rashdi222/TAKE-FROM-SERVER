# Cricket Automation Plan

## Goal
Enable draft-only automated cricket odds generation for prematch and in-play matches using the existing OpenRouter model and current odds workflow.

## Phase 1
- Add feed-level cricket automation config
- Add automation run tracking table and schema
- Add backend helpers to read/write automation state safely

## Phase 2
- Add cricket automation service
- Auto-generate prematch drafts inside configured window
- Use existing AI generation/orchestrator stack and market validation

## Phase 3
- Add cricket in-play automation
- Generate safe structured in-play drafts only
- Rate-limit reruns and record outcomes
- Deactivate stale in-play odds on live changes using existing lifecycle rules

## Phase 4
- Add worker integration and scheduled execution
- Trigger automation from cricket match refresh flow where safe
- Keep automation draft-only and never auto-publish

## Phase 5
- Add cricket desk controls and status
- Enable/disable prematch and in-play automation per feed
- Show automation state per match
- Keep manual generate/orchestrate/publish flow intact

## Safety Rules
- Cricket only
- Drafts only
- No auto-publish
- Skip closed/settled/cancelled matches
- Skip unsupported markets
- Respect market templates, payout limits, and current AI model setting
