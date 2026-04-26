# Backend Provider Integration Notes

This backend supports one active provider at a time through `providers` table records and adapter dispatch.

## Provider config contract

Each provider row can include:

- `name`: one of `sportmonks | cricketdata | api_sports | allsports | entitysport`
- `api_key`: stored encrypted
- `base_url`: optional override
- `config`: map with provider-specific keys

Common config keys used by adapters:

- `fixtures_endpoint` (string)
- `live_endpoint` (string)
- `params` (map)

## Adapter defaults

- `sportmonks`: base `https://api.sportmonks.com/v3/cricket`
  - fixtures `/fixtures`
  - live `/livescores`
  - auth header `Authorization: Bearer <key>`
- `cricketdata`: base `https://api.cricketdata.org`
  - fixtures `/v1/matches`
  - live `/v1/currentMatches`
  - query param `apikey=<key>`
- `api_sports`: base `https://v3.football.api-sports.io`
  - fixtures `/fixtures`
  - live `/fixtures?live=all`
  - header `x-apisports-key: <key>`
- `allsports`: base `https://apiv2.allsportsapi.com`
  - fixtures endpoint `/football/` + `met=Fixtures`
  - live endpoint `/football/` + `met=Livescore`
  - query param `APIkey=<key>`
- `entitysport`: base `https://rest.entitysport.com/v2`
  - fixtures `/matches`
  - live `/matches?status=3`
  - query param `token=<key>`

## Super admin APIs

- `GET /api/super-admin/providers`
- `POST /api/super-admin/providers`
- `POST /api/super-admin/providers/:id/activate`
- `POST /api/super-admin/providers/:id/enable`
- `GET /api/super-admin/settings/openrouter/models`
- `POST /api/super-admin/settings/openrouter/model`
- `POST /api/super-admin/settings/openrouter/key`

## Runtime behavior

- Only one provider is active at a time.
- `Back.Workers.MatchFetcher` polls:
  - live every ~4s
  - fixtures every ~5 minutes
- external matches are upserted by `(provider, external_id)`.
- score/status updates broadcast over existing match channels.
