# Sports Tangle Audit And Modularization Plan

## Purpose

This document records the current audit of how cricket, football, and other sports are structured in the project, where the logic is still mixed, and how to modularize it later without breaking existing sports functionality.

The goal is not to redesign everything immediately. The goal is to create a safe plan for gradually separating sports logic while preserving current routes, database contracts, and product behavior.

## Current State

The project is partially separated by sport already, but not fully.

What is already in a good direction:

- frontend sport-specific components exist
  - `next/src/components/cricket`
  - `next/src/components/football`
  - `next/src/components/live-cricket`
  - `next/src/components/live-football`
- Python AI engine is already separated by sport
  - `ai_engine/cricket/orchestrator.py`
  - `ai_engine/football/orchestrator.py`
- provider adapters are already separated by provider and effectively by sport
  - `back/lib/back/providers/sportmonks.ex`
  - `back/lib/back/providers/api_sports.ex`
- some settlement logic is already separated by sport
  - `back/lib/back/betting/market_settlement/in_play/cricket.ex`
  - `back/lib/back/betting/market_settlement/in_play/football.ex`

What is still too centralized:

- match normalization and upsert flow
- provider and feed orchestration
- multi-sport admin/provider controller logic
- generic live orchestration
- shared frontend hooks and feed forms

So the codebase is not fully tangled, but important orchestration layers are still mixed.

## Main Mixed Files

These are the primary places where sport logic is still living together in shared files.

### 1. `back/lib/back/betting.ex`

This file currently contains too much sport-specific match behavior in one place.

It handles:

- external match upsert
- status normalization
- sport normalization
- cricket live fields
- football live fields
- close, cancel, settle flows

This is one of the strongest coupling points between sports.

### 2. `back/lib/back/providers.ex`

This file behaves like a multi-sport service hub.

It currently owns or coordinates:

- competition discovery
- competition feed import
- sync behavior
- feed metrics
- automation run lookup

It knows too much about multiple sports in one place.

### 3. `back/lib/back_web/controllers/provider_controller.ex`

This controller contains both cricket and football endpoints side by side.

That is not automatically wrong, but it becomes a maintenance problem because:

- discovery endpoints for different sports live together
- automation endpoints for different sports live together
- feed management for all sports goes through one growing controller

### 4. `back/lib/back/live/lang_graph_client.ex`

This module still acts like a central live engine client with football branching out and cricket as the default path.

That means:

- football is explicitly delegated
- cricket is implicitly the base behavior
- any future sport risks being added to the same shared client

This is not a clean long-term boundary.

### 5. `next/src/components/providers/CompetitionFeedForm.tsx`

This is a generic provider/feed form, but it already contains cricket-specific behavior:

- `useResolveCricketSeason`
- SportMonks league to season resolution
- cricket-specific messaging in a generic feed form

That is a clear frontend coupling smell.

### 6. `next/src/hooks/useSuperAdmin.ts`

This file contains a large amount of cross-sport admin hooks in one place.

It includes:

- cricket discovery hooks
- football discovery hooks
- cricket automation hooks
- football automation hooks
- suspend/resume/reprice hooks

This works for now, but it is not modular.

### 7. Shared Match Schema And Service Flow

The current `matches` schema contains multiple sport-specific fields, including:

- cricket live state fields
- football live state fields

This is acceptable for now if the service layer is disciplined, but the current application layer is not separated enough yet.

## What Is Already Separated Well

The following parts should be preserved and extended, not rewritten from scratch.

### Frontend

- sport-specific live dashboards
- sport-specific admin components
- separate cricket and football component folders

### Python AI Engine

- separate cricket and football directories
- separate cricket and football orchestrators

### Provider Adapters

- cricket provider adapter
- football provider adapter

### Settlement Modules

- in-play settlement modules are already sport-specific

These are good boundaries and should become the model for the rest of the project.

## Non-Breaking Modularization Plan

The modularization should happen in phases. The first phases should only separate internals, not public contracts.

That means:

- keep current API routes at first
- keep current Phoenix channels at first
- keep current database schema at first
- keep current page URLs at first

Refactor internals first. External contracts can remain stable.

## Phase 1: Extract Sport Application Services

Create a sports application layer in the backend:

- `back/lib/back/sports/cricket/`
- `back/lib/back/sports/football/`
- later:
  - `tennis/`
  - `horse_racing/`
  - `dog_racing/`

Inside each sport folder, create service modules such as:

- `matches.ex`
- `lifecycle.ex`
- `feeds.ex`
- `discovery.ex`
- `automation.ex`
- `provider_bridge.ex`

Shared files should stop containing direct sport behavior and instead dispatch to these services.

Initial targets for extraction:

- logic from `back/lib/back/betting.ex`
- logic from `back/lib/back/providers.ex`

## Phase 2: Split Provider And Feed Orchestration By Sport

Instead of one large `Back.Providers` owning everything, create sport-specific provider orchestration modules, for example:

- `Back.Sports.Cricket.Providers`
- `Back.Sports.Football.Providers`

Each one should own:

- discovery
- feed import
- sync policies
- automation run lookups
- feed validation rules

`Back.Providers` can remain as a thin compatibility layer if needed, but it should no longer contain all sport logic directly.

## Phase 3: Split Match Normalization By Sport

Currently match normalization in `back/lib/back/betting.ex` handles both cricket and football concerns together.

This should be extracted into dedicated modules such as:

- `Back.Sports.Cricket.MatchNormalizer`
- `Back.Sports.Football.MatchNormalizer`

Each normalizer should own:

- provider payload interpretation
- live-state derivation
- sport-specific status handling if needed
- JSON-safe raw payload shaping

This keeps cricket concepts like overs and wickets away from football concepts like minute, corners, and tempo.

## Phase 4: Split Live Orchestration Explicitly By Sport

The live orchestration layer should stop treating cricket as the implicit default.

Create explicit sport live modules such as:

- `Back.Live.Cricket.Client`
- `Back.Live.Football.Client`

Then either:

- reduce `back/lib/back/live/lang_graph_client.ex` to a thin dispatcher
- or replace it with a sport router module

This phase should also separate:

- bootstrap logic
- repricing triggers
- suspend/resume rules
- recovery policies

by sport.

## Phase 5: Split Frontend Admin And Feed Plumbing

The frontend should stop using generic components that contain sport-specific conditions.

Main target:

- split `next/src/components/providers/CompetitionFeedForm.tsx`

Into:

- `CricketFeedForm.tsx`
- `FootballFeedForm.tsx`
- optional shared base form for neutral fields only

Also split admin hooks:

- `next/src/hooks/useSuperAdminCricket.ts`
- `next/src/hooks/useSuperAdminFootball.ts`
- `next/src/hooks/useSuperAdminProviders.ts`
- `next/src/hooks/useSuperAdminMatches.ts`

This keeps query keys, invalidations, and admin behavior cleaner.

## Phase 6: Enforce Sport Boundaries

Once the modules are split, apply clear rules:

1. no cricket-specific helper should live inside football modules
2. no football-specific helper should live inside cricket modules
3. shared modules may only contain truly shared logic
4. any file using repeated `if sport == ...` branches is a future refactor target unless it is intentionally a dispatcher

Allowed shared logic:

- transport/http wrappers
- generic DB helpers
- generic admin utilities
- UI primitives
- type helpers

## Edge Cases To Preserve During Refactor

The modularization must not break current sports.

The refactor should preserve:

- existing API routes
- existing WebSocket topics
- existing page URLs
- current Python endpoints
- current database schema
- current admin workflow contracts

This means the initial work is internal refactoring, not a product rewrite.

## What Should Not Be Done First

Do not start by splitting the database schema into sport-specific tables.

That is much riskier than necessary right now.

The higher-value first move is:

- separate service modules
- separate orchestration
- keep database and routes stable

Schema splitting can be evaluated later only if the service-layer separation is complete and proven.

## Best First Targets

If the refactor starts later, these should be the first files targeted:

1. `back/lib/back/betting.ex`
2. `back/lib/back/providers.ex`
3. `back/lib/back/live/lang_graph_client.ex`
4. `next/src/components/providers/CompetitionFeedForm.tsx`
5. `next/src/hooks/useSuperAdmin.ts`

These files give the biggest separation gain with the least architectural ambiguity.

## Expected Outcome

After the modularization:

- cricket and football will remain fully functional
- sport logic will be easier to reason about
- future sports can be added without growing giant shared files
- provider, live, and admin logic will be easier to maintain
- one sport’s edge cases will be less likely to leak into another sport

## Final Position

The project already has good separation in some layers, especially:

- Python AI engines
- sport-specific UI components
- provider adapters
- settlement modules

But backend orchestration and some frontend admin plumbing are still too centralized.

The right plan is to split internals first, preserve external contracts, and move one layer at a time.
