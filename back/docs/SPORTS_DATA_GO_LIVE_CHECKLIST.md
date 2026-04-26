# Sports Data Go-Live Checklist

## Config & Secrets
- [ ] `SPORTS_DATA_ENABLED` set correctly in production
- [ ] `API_TENNIS_KEY`, `GOALSERVE_KEY`, `BETSAPI_TOKEN` set in production env
- [ ] `API_TENNIS_WS_ENABLED` only enabled with Business websocket plan

## Data Quality
- [ ] Rejection queue monitoring in place
- [ ] Replay flow tested
- [ ] Backfill worker tested for each provider

## Operational
- [ ] Oban queues healthy
- [ ] Cron jobs visible and running
- [ ] Sync logs stable for 24h burn-in

## Legal
- [ ] Goalserve commercial rights confirmed in writing
- [ ] BetsAPI MVP limitation accepted and replacement plan approved

## Handover
- [ ] Runbook shared with ops team
- [ ] Endpoint matrix shared with frontend team
- [ ] On-call escalation contacts confirmed
