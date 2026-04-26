# Sports Data Failure Runbook

## 1) HTTP 429 / Quota Exhaustion
Symptoms:
- provider requests return 429
- sync logs show frequent failures/snoozes

Actions:
1. Verify provider quota dashboard.
2. Confirm worker snooze behavior in logs.
3. Reduce polling aggressiveness.
4. Trigger replay after reset window if needed.

## 2) 403 / Goalserve IP Not Whitelisted
Symptoms:
- Goalserve calls fail with 403 or empty payload.

Actions:
1. Verify current server egress IP.
2. Reconfirm whitelist with Goalserve support.
3. Pause horse-racing worker until whitelist restored.

## 3) Malformed Provider Payload
Symptoms:
- rising entries in `sports_data_rejections`

Actions:
1. Inspect `GET /api/super-admin/sports-data/rejections`.
2. Identify provider field change or missing key.
3. Patch normalizer.
4. Enqueue replay job.

## 4) WebSocket Down (API-Tennis)
Symptoms:
- websocket disconnect logs, reduced live freshness

Actions:
1. Ensure `API_TENNIS_WS_ENABLED` and key are valid.
2. Confirm reconnect attempts.
3. REST fallback job should be auto-enqueued.
4. If persistent, disable ws and rely on polling until provider recovery.

## 5) Data Backfill Needed
Actions:
1. POST `/api/super-admin/sports-data/backfill` with provider/date range payload.
2. Monitor sync logs and rejection queue.
3. Run replay after normalizer fixes.
