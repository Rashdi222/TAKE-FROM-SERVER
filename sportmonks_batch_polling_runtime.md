# SportMonks Cricket Batch Polling Runtime

This documents the current live SportMonks cricket polling flow after Phases 1, 2, and 3.

## Live score flow

1. `Back.Providers.SportmonksLiveIndex`
- polls SportMonks `/livescores`
- one batch request returns all visible live cricket fixtures
- stores a compact live index in ETS with TTL

2. `Back.Providers.SportmonksDetailRefresher`
- reads the live index
- chooses only due live matches for full fixture detail refresh
- does not fetch full detail for every live match on every tick

3. Existing match pipeline
- changed SportMonks fixture details are normalized
- `Back.Betting.upsert_external_match/1` is called
- normal broadcasts and live state updates continue through existing infrastructure

## What is batch vs targeted

### Batch
- `/livescores`
- single request
- all live match score discovery
- used for:
  - live fixture discovery
  - freshness signal
  - deciding which matches are candidates for targeted refresh

### Targeted
- `/fixtures/{id}` detail fetch
- per-match request
- only for matches selected by the Phase 2/3 scheduler
- used for:
  - richer match detail
  - accurate state transitions
  - updating live match context when the snapshot materially changed

## Phase 3 scheduler behavior

The targeted refresher now has:

- per-tick budget:
  - `SPORTMONKS_DETAIL_REFRESH_MAX_TARGETS_PER_TICK`
- bounded concurrency:
  - `SPORTMONKS_DETAIL_REFRESH_MAX_CONCURRENCY`
- unchanged snapshot cooldown:
  - `SPORTMONKS_DETAIL_REFRESH_UNCHANGED_COOLDOWN_MULTIPLIER`
  - `SPORTMONKS_DETAIL_REFRESH_MAX_COOLDOWN_MS`

Priority is biased toward:
- live matches already generating platform odds
- degraded/recovery matches
- matches with approved `one_x_bet_worker` mapping
- enabled in-play feeds

## Runtime knobs

These env vars are supported through `back/config/config.exs`:

- `SPORTMONKS_DETAIL_REFRESH_MAX_TARGETS_PER_TICK`
- `SPORTMONKS_DETAIL_REFRESH_MAX_CONCURRENCY`
- `SPORTMONKS_DETAIL_REFRESH_UNCHANGED_COOLDOWN_MULTIPLIER`
- `SPORTMONKS_DETAIL_REFRESH_MAX_COOLDOWN_MS`
- `CRICKET_REPRICE_QUEUE_ENABLED`

## Test behavior

In test config:
- `CRICKET_REPRICE_QUEUE_ENABLED` is disabled

This suppresses background live repricer tasks during scheduler tests so Phase 1/2/3 tests remain deterministic and do not emit sandbox ownership noise.

## Operator visibility

Feed metrics now show:

- batch live discovery:
  - active fixtures
  - freshness
  - last success

- targeted detail scheduler:
  - tracked
  - due
  - selected
  - throttled
  - cooldown suppressed
  - hot/warm counts
  - refreshed/unchanged/failed counts

## Other provider batch polling

### Football (`api_sports`)
- live score discovery:
  - batch request through `/fixtures?live=all`
- live odds:
  - batch request through `/odds/live`
  - cached in `Back.Providers.ApiSportsLiveOddsIndex`
  - existing per-match provider odds fetch remains fallback if the batch cache is stale or missing

### Tennis (`api_tennis`)
- live score discovery:
  - batch request through `get_livescore`
- live odds:
  - batch request through `get_live_odds`
- current tennis live sync merges those two batch responses into a per-match live snapshot before broadcasting
