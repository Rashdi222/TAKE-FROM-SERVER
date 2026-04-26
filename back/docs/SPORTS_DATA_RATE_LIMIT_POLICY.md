# Sports Data Rate Limit Policy

## Baseline
- API-Tennis:
  - enforce >= 200ms delay between sequential calls within worker run
- Goalserve:
  - spacing between regional calls (>= 500ms)
  - avoid aggressive polling outside race windows
- BetsAPI:
  - parse and honor `X-RateLimit-Remaining` and `X-RateLimit-Reset`
  - on limit exhaustion, worker snoozes until reset

## Scheduling (current)
- Tennis worker: every 5 minutes
- Horse racing worker: every 2 minutes
- Greyhound worker: every 1 minute
- Rejection replay worker: every 30 minutes

## Hard Requirements
- Never crash worker on provider rate-limit response.
- Always log blocked/snoozed behavior.
- Keep provider keys/tokens out of logs.
