# Cricket Bookmaker Intelligence Blueprint

Status: Executed through Step 8. Core fair-vs-display pricing, pre-match dossier loading, playbook-driven trap math, fancy fair-vs-trap projection, reviewer skew auditing, and replay validation are implemented. Remaining work belongs to operational visibility and tuning.

## Audit Summary

Current engine status after reviewing the live cricket stack:

- `ai_engine/cricket/orchestrator.py`
  - contains the actual `context_manager_node` and `in_play_generator_node`
  - still leans on:
    - implied probability from current odds
    - heuristic base probability
    - event impact scoring
    - momentum and run-rate pressure
  - good for structural safety, weak for bookmaker psychology
- `ai_engine/cricket/fancy_generator.py`
  - is driven by:
    - current run rate
    - recent boundary rate
    - dot pressure
    - wicket clusters
    - innings phase
    - batting depth
  - this is clean and deterministic, but still mathematically honest rather than commercially shaded
- `ai_engine/cricket/context_manager.py`
  - does not currently exist as a separate file
  - its responsibilities are still inline inside `orchestrator.py`
- `ai_engine/cricket/in_play_generator.py`
  - does not currently exist as a separate file
  - its responsibilities are also still inline inside `orchestrator.py`

This means the current engine is:

- safe
- structured
- liability-aware
- but still naive in bookmaker behavior

The next upgrade is not about safety. It is about controlled asymmetry, situational manipulation, and richer pre-match memory.

---

## Phase 1: The Pre-Match Dossier (Deep Context)

### Goal

Before Ball 1, the engine must already know what kind of match it is dealing with. Right now it mostly reacts to current state. That is not enough. A bookmaker prices the context before the first ball.

### What the dossier must contain

For every match, build and cache a pre-match dossier with:

1. Venue bias
- batting-first advantage vs chasing advantage
- average first-innings score by format
- average death-over scoring rate
- average wicket-loss pattern by innings phase
- dew tendency if available
- venue volatility score
- whether the venue historically punishes collapse after early wickets

2. Team personas
- powerplay aggression profile
- death-over hitting profile
- collapse tendency under scoreboard pressure
- chase temperament
- defense temperament
- pace vs spin vulnerability bias
- dependence on top-order vs distributed batting

3. Matchup context
- team-vs-team historical pace of scoring
- matchup imbalance score
- whether one team consistently overperforms while chasing
- whether one side has a strong psychological edge in close finishes

4. Market psychology hints
- public team bias
- star-player bias
- famous-franchise bias
- defending champion bias
- fan-heavy team premium

### How the dossier should be built

Create a dedicated pre-match preparation pipeline that runs before live trading:

1. Pre-match collector
- pulls venue stats
- pulls recent team form
- pulls chasing/defending splits
- computes stable meta scores

2. Dossier builder
- converts raw numbers into bookmaker-ready normalized factors
- stores them in a single dossier object

3. Dossier cache
- persists per match in SQLite checkpointer memory
- also supports a precomputed JSON cache on disk for fast Ball 1 load

### How the context manager must use it

At Ball 1 the context manager must load:

- current live match state
- prior live memory
- pre-match dossier

Then it should derive:

- baseline true probability
- venue-adjusted probability
- persona-adjusted probability
- public-bias risk markers
- psychological trap opportunities

### Required architectural change

Move the inline `context_manager_node` logic into a dedicated module later, for example:

- `ai_engine/cricket/context_manager.py`
- `ai_engine/cricket/dossier.py`
- `ai_engine/cricket/pre_match_cache.py`

The context manager should become the loader and synthesizer, not the place where all deep math lives.

---

## Phase 2: Asymmetrical Shading (The "Trap" Math)

### Goal

The generator must stop outputting fair-looking, honest lines. It must output commercially shaped lines that still live inside reviewer-approved safety bounds.

This does not mean reckless distortion. It means deliberate asymmetry.

### Core principle

We need two internal prices:

1. Fair probability
- the mathematically honest estimate

2. Display probability
- the bookmaker-shaped estimate sent to market construction

The display probability must be derived from fair probability plus controlled shading layers.

### Required shading dimensions

#### 1. Required Run Rate illusion shading

Problem:
- T20 bettors overestimate chase viability when required run rate looks only slightly high but wickets are intact
- they also underestimate how fast a chase dies when dot-ball pressure quietly accumulates

Plan:
- detect cases where:
  - required run rate is cosmetically achievable
  - but chase quality is weak due to:
    - venue slowing
    - weak finishing depth
    - low boundary frequency
    - pressure accumulation
- in those cases:
  - shade against the chasing side more than pure probability would suggest

Example logic direction:
- if required rate is 9.8 and public thinks “still easy”
- but venue late-overs drag and batting depth are weak
- then the chasing side should be shortened less than public expects or even pushed slightly longer than the fair model

#### 2. Star-player bias shading

Problem:
- public money clusters around famous teams and star batters
- true probability is often less inflated than public expectation

Plan:
- maintain a star-weight or brand-bias score in the dossier
- if public is likely to overbuy one team:
  - slightly under-reward that side
  - slightly improve the less fashionable side only within safe skew limits

This creates classic bookmaker asymmetry:
- not obviously unfair
- but subtly expensive where public demand is predictable

#### 3. Collapse-memory shading

Problem:
- teams with fragile middle orders are often priced too generously while 1 wicket down

Plan:
- if dossier says:
  - top-heavy batting
  - weak finishers
  - venue punishes rebuilding
- then after an early wicket:
  - price the batting side worse than a pure expected-runs model would

#### 4. Franchise reputation trap

Plan:
- globally penalize over-loved teams in ambiguous states
- never let brand reputation produce generous odds
- force the popular team’s line to be slightly worse than fair in neutral states

### Hard implementation rule

Shading must be capped.

We need explicit ceilings on display skew:

- low-volatility state: max display skew 1.5% probability
- medium-volatility state: max display skew 2.5% probability
- high-public-bias state: max display skew 3.5% probability

No psychological shading should bypass the reviewer’s absolute limits, jump checks, or coherence controls.

### New internal math layers

Later implementation should introduce:

- fair probability engine
- bookmaker shading engine
- display probability composer

Suggested future modules:

- `ai_engine/cricket/bookmaker_bias.py`
- `ai_engine/cricket/shading.py`
- `ai_engine/cricket/public_bias.py`

---

## Phase 3: Situational Playbooks

### Goal

A bookmaker does not price every moment with one global formula. It switches playbooks depending on match state.

We need explicit situational regimes.

### Playbook 1: Early Wicket Trap

Scenario:
- powerplay wicket falls early
- scoreboard still looks healthy enough
- public often overreacts or underreacts depending on team brand

Bookmaker behavior:
- if strong brand team loses an early wicket:
  - do not drift them as much as pure probability says if public will still back them
  - sell optimism expensively
- if fragile team loses an early wicket:
  - drift faster than the honest model

### Playbook 2: Death Over Panic

Scenario:
- overs 16 to 20
- public chases sixes mentally, not sustainable scoring structure

Bookmaker behavior:
- distinguish between:
  - scoreboard pressure that looks achievable
  - scoreboard pressure that only looks achievable because of recent boundaries
- if chasing side needs hero-ball outcomes:
  - price them worse than fair
- if defending side is emotionally vulnerable but structurally ahead:
  - do not overpay defending probability

### Playbook 3: Dead Over Pressure

Scenario:
- overs with dots and singles only
- no obvious collapse, but projected session line is quietly deteriorating

Fancy-market behavior:
- yes/no lines for next 6/10/15/20 overs should react more aggressively to:
  - dead overs
  - strike stagnation
  - low boundary threat
- public often underprices the effect of three quiet overs

This is exactly where fancy session traps should live.

### Playbook 4: False Recovery

Scenario:
- two boundaries make the chase look alive
- but required rate, wickets-in-hand quality, and bowler phase still say fragile

Behavior:
- suppress overreaction
- allow only partial recovery in display odds
- keep recovery lines stingy

### Playbook 5: Pitch Degradation Playbook

Scenario:
- venue dossier says pitch slows materially in second innings
- current live scoring still looks normal

Behavior:
- shade against easy-chase narratives
- make session overs slightly less generous on the positive side
- reduce “Yes” value on later-window fancy lines if the deck historically dies late

### Playbook 6: Choke / Close-Finish Persona

Scenario:
- team dossier indicates poor close-out rate
- defending side is ahead but historically leaks under pressure

Behavior:
- never price “ahead” as fully secure when the team has closeout weakness
- but do not overgift comeback value either
- this is a psychological spread zone, not a fair-probability zone

### Recommended playbook structure

Later code should hold these as explicit scenario evaluators:

- `ai_engine/cricket/playbooks/early_wicket.py`
- `ai_engine/cricket/playbooks/death_overs.py`
- `ai_engine/cricket/playbooks/dead_over_pressure.py`
- `ai_engine/cricket/playbooks/pitch_degradation.py`

The generator should ask:

1. what regime am I in
2. what public mistake is likely here
3. what controlled skew is justified

---

## Phase 4: Architecture Integration

### Goal

Inject bookmaker psychology without breaking the safety system already built in `fr1`.

### Current structural reality

Right now:

- context logic is inline in `orchestrator.py`
- in-play generation is inline in `orchestrator.py`
- fancy generation is in `fancy_generator.py`
- reviewer safety is in `reviewer.py`

So the correct integration path is staged extraction plus bounded composition.

### Required future architecture

#### 1. Split fair generation from shaded generation

For core in-play markets:

- fair probability stage
- bookmaker shading stage
- exposure shading stage
- reviewer stage

Proposed future flow:

1. context manager loads dossier and live state
2. fair generator computes neutral probability
3. bookmaker intelligence layer applies:
  - venue bias
  - team persona bias
  - public trap skew
  - situational playbook skew
4. exposure/liability layer shades further
5. reviewer validates final output
6. emitter publishes

#### 2. Fancy generator should also split into two stages

Current fancy logic is one-pass expected-run projection.

Future flow:

1. fair session projection
2. situational fancy trap adjustment
3. fancy reviewer stability check

Examples:
- dead-over pressure should lower projected session line more aggressively
- death-over public greed should make “Yes” less generous when the public will overbuy it

### Non-breaking safety requirement

The new intelligence layers must never bypass:

- absolute price ceilings
- jump thresholds
- reviewer veto
- coherence checks
- exposure envelopes

That means:

- the bookmaker layers may shape candidate output
- but the reviewer remains the final gatekeeper

### Reviewer integration rule

Reviewer must gain awareness of:

- fair probability
- shaded probability
- reason for shading
- playbook identifiers activated
- total skew applied

That way reviewer can reject:

- over-aggressive psychological skew
- incoherent trap pricing
- scenario logic that stacks too many biases at once

### Suggested future state additions

The graph state should later include:

- `fair_probability_team1`
- `bookmaker_shaded_probability_team1`
- `pre_match_dossier`
- `active_playbooks`
- `public_bias_flags`
- `venue_bias_flags`
- `shading_summary`
- `shading_magnitude`

Fancy side should include:

- `fair_session_projection`
- `shaded_session_projection`
- `active_fancy_playbooks`
- `fancy_shading_summary`

### Modularization target

Do not keep this in `orchestrator.py`.

The intended clean target should be:

- `ai_engine/cricket/context_manager.py`
- `ai_engine/cricket/in_play_generator.py`
- `ai_engine/cricket/bookmaker_bias.py`
- `ai_engine/cricket/shading.py`
- `ai_engine/cricket/pre_match_cache.py`
- `ai_engine/cricket/dossier.py`
- `ai_engine/cricket/fancy_bias.py`
- `ai_engine/cricket/playbooks/...`

`orchestrator.py` should only coordinate nodes and state transitions.

---

## Recommended Execution Order

### Step 1
Extract current inline context and in-play generator logic out of `orchestrator.py`.

### Step 2
Add pre-match dossier pipeline and persistent cache.

### Step 3
Build fair-vs-display probability split for core in-play pricing.

### Step 4
Add bookmaker bias engine with capped asymmetrical shading.

### Step 5
Implement situational playbooks for:
- early wicket
- death overs
- false recovery
- pitch degradation

### Step 6
Upgrade fancy generation with separate fair projection and trap projection.

### Step 7
Upgrade reviewer to validate:
- skew reason
- skew size
- playbook compatibility

### Step 8
Run live replay tests on historical ball-by-ball sequences to compare:
- fair line
- shaded line
- reviewer output

---

## Final Objective

The end state is not a model that merely predicts cricket.

It is a model that:

- understands match context before the first ball
- knows where public intuition is weak
- prices asymmetrically but safely
- uses explicit situational playbooks
- preserves strict reviewer safety at the final gate

That is the upgrade path from a safe probability engine to a real cricket bookmaker engine.
