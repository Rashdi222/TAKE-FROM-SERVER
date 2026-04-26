# Sports Data Endpoint Matrix

## Public Webhook
- `POST /webhooks/goalserve`
  - Purpose: ingest Goalserve push updates
  - Auth: none (source validation recommended)

## Super Admin APIs
- `GET /api/super-admin/sports-data/events`
  - Purpose: list normalized sports events
- `GET /api/super-admin/sports-data/sync-logs`
  - Purpose: ingestion operational logs
- `GET /api/super-admin/sports-data/rejections`
  - Purpose: malformed/quarantined event diagnostics
- `POST /api/super-admin/sports-data/backfill`
  - Purpose: enqueue historical provider backfill
- `POST /api/super-admin/sports-data/replay-rejections`
  - Purpose: enqueue replay for pending rejected payloads

## Existing Provider Admin APIs (legacy system)
- `GET /api/super-admin/providers`
- `POST /api/super-admin/providers`
- `POST /api/super-admin/providers/:id/activate`
- `POST /api/super-admin/providers/:id/enable`
- `GET /api/super-admin/providers/health`
- `POST /api/super-admin/providers/sync-now`
- `GET /api/super-admin/providers/sync-logs`
