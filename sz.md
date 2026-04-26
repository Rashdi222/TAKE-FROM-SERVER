# Zero-Trust Audit Findings

Date: 2026-03-28

Scope audited:
- `fr1.md` implementation path: exchange safety, reviewer, runtime serialization, exposure
- `frontend_live_ops_todo.md` implementation path: live admin controls and intel UI
- `fr2_bookmaker_intelligence.md` implementation path: dossier, bookmaker bias, playbooks, fancy traps

## Executive Summary

The system is structurally coherent and currently compiles/lints cleanly across Elixir, Next.js, and Python. The major end-to-end pipeline is present:

1. Python generates fair/display telemetry and emitted markets.
2. Elixir ingests and stores that telemetry in `provider_snapshot` and `match.market_state`.
3. Phoenix broadcasts row updates.
4. Next.js admin surfaces render the intel consistently in both Live Match cards and the Global Odds Desk.

The audit did find a few real gaps:

1. `LangGraphClient` validates only part of the Python intel contract.
2. The admin UI shows bookmaker `display_probability` as “Trap Odds”, but that is not always the final post-exposure published price.
3. The reviewer detects `shading_declaration_mismatch`, but currently only flags it instead of rejecting or retrying.

These are not “system broken” findings. They are contract-hardening and monitoring-accuracy findings.

## 1. Contract Audit: Python -> Elixir -> Phoenix

### What is working

Python `rate_emitter` / orchestrator response includes:
- `fair_probability`
- `display_probability`
- `shading_magnitude`
- `active_playbooks`
- `bookmaker_summary`
- `fancy_summary`
- `bookmaker_node_latency_ms`

Elixir `MarketManager` persists these into:
- row `provider_snapshot`
- `match.market_state`

Phoenix row broadcasts expose the important intel fields used by admin UI:
- `fair_probability`
- `display_probability`
- `shading_magnitude`
- `active_playbooks`
- `fair_projected_line`
- `provider_snapshot`

Admin API `OddsController.index` also exposes the same core intel fields needed by the desk.

### Contract gap found

`LangGraphClient.validate_engine_response/2` validates only:
- `fair_probability`
- `display_probability`
- `shading_magnitude`
- `active_playbooks`

It does **not** validate shape/type for:
- `bookmaker_summary`
- `fancy_summary`
- `bookmaker_node_latency_ms`

Result:
- those fields are persisted downstream by `MarketManager`
- but they are not guarded at the Elixir boundary

Risk:
- malformed Python telemetry in these fields could silently flow into storage/broadcast without a contract failure at ingest

Severity: Medium

## 2. Intelligence Audit: Bookmaker Bias vs Reviewer

### What is working

`bookmaker_bias.py` enforces:
- `MAX_ABSOLUTE_SKEW = 0.035`

Bias shaping is capped before the reviewer sees the candidate. The orchestrator then runs:

1. fair generation
2. bookmaker bias
3. exposure shading
4. reviewer

The reviewer explicitly checks:
- fair -> display shift
- display -> final shift
- total fair -> final shift
- unjustified bookmaker skew
- unjustified exposure skew
- hard reject on combined skew above Phase 1 limit

This is the correct safety order.

### Logic loophole found

`reviewer.py` computes:
- `declared_shading`
- `total_skew`

If they differ materially, it adds:
- `shading_declaration_mismatch:...`

But it does **not** reject or retry on that mismatch. It only flags it.

Why this matters:
- this is exactly the kind of silent contract drift that zero-trust review should not tolerate
- if declared telemetry drifts from actual final candidate movement, admin monitoring can be wrong while reviewer still approves

Current protection level:
- still partially safe, because hard jump checks use actual probabilities
- not fully safe from telemetry dishonesty/inconsistency

Severity: Medium

### Quant conclusion

There is no obvious path where bookmaker bias alone exceeds the 3.5% cap before reviewer inspection.

The bigger issue is not “unsafe odds bypass reviewer”.
The bigger issue is:
- telemetry mismatch can survive as a flag instead of a hard decision

## 3. Visibility Audit: Admin UI Math & Sync

### What is working

The Global Odds Desk and Live Match cards now share the same row renderer:
- `MarketOddsRow.tsx`

The intel popover:
- `OddsIntelPanel.tsx`

uses the same contract on both surfaces. That removes the earlier UI divergence risk.

For core markets the UI converts:
- probability -> decimal odds using `1 / probability`

That math is correct for displaying implied decimal odds to admin users.

For fancy markets the UI correctly renders:
- `fair_projected_line`
- `projected_line`
- fancy playbook metadata from `trace_meta`

### Monitoring semantics gap found

The admin UI labels “Trap Odds” using:
- `display_probability`

But `display_probability` is the bookmaker layer output, not necessarily the final post-exposure approved/published candidate.

If exposure manager shaded the candidate further, then:
- admin sees “Fair vs Trap”
- but the user may actually be seeing “Fair vs Final Published”

That means the current UI is good for monitoring bookmaker psychology specifically, but not perfect if the admin interprets it as final user-facing odds.

This is a monitoring accuracy gap, not a math bug.

Severity: Medium

### Sync finding

Mutation synchronization is now correct in principle:
- API path returns intel
- activate/deactivate broadcasts row updates
- manual override updates also broadcast row updates

This means admin override state is globally synchronized across:
- Live Match cards
- Global Odds Desk

No immediate sync gap found there.

## 4. Persistence Audit: SQLite Match Memory

### What is working

`memory.py` persists and normalizes:
- `match_dossier`
- `last_fancy_projection`
- `last_fancy_fair_projection`

`pre_match_cache.ensure_match_dossier(...)`:
- rebuilds dossier from `match_state.raw_data`
- compares against existing stored dossier
- persists back into SQLite snapshot when changed

`context_manager.py` loads the dossier at graph start and injects it into `memory_context`.

`orchestrator.py` persists memory snapshot again after graph execution.

### Persistence conclusion

The dossier is not ephemeral. If the engine restarts and the same `match_id` is reloaded:
- dossier should still exist in SQLite
- and if missing/stale, it can be rebuilt from match raw payload

No immediate persistence loss bug found here.

Severity: Low / no hotfix required

## Hotfix List

### Hotfix 1
Harden `LangGraphClient.validate_engine_response/2` to validate:
- `bookmaker_summary` is a map when present
- `fancy_summary` is a map when present
- `bookmaker_node_latency_ms` is a number/integer when present

Reason:
- closes the current Python -> Elixir contract hole

### Hotfix 2
Upgrade reviewer handling of `shading_declaration_mismatch` from “flag only” to:
- retry, or
- reject_and_keep_suspended

Reason:
- telemetry inconsistency should not pass zero-trust review silently

### Hotfix 3
Clarify admin UI labels:
- current `Trap Odds` = bookmaker display layer
- add separate optional `Final Published Odds` if exposure-adjusted final output should be visible

Reason:
- avoids admin misreading bookmaker display odds as the final user-visible line

### Hotfix 4
Make API and channel contracts byte-for-byte closer where practical:
- same intel keys
- same naming
- same fancy/core metadata fields

Reason:
- reduces future drift between polling UI and websocket UI

## Validation Run

The current audited state passed:

- `cd /home/nain/sixerbat/back && mix compile`
- `cd /home/nain/sixerbat/next && npm run lint`
- `python3 -m py_compile /home/nain/sixerbat/ai_engine/cricket/*.py`

## Bottom Line

The system is operational and structurally aligned.

The most important findings are not feature failures. They are trust-boundary and monitoring-precision issues:

1. Elixir should validate more of the Python intel contract.
2. Reviewer should not treat declared-vs-actual shading mismatch as a soft flag forever.
3. Admin UI should distinguish bookmaker display odds from final published odds if both layers matter operationally.
