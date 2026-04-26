# Sports Data API Integration — Master System Prompt
## Stack: Elixir/Phoenix + PostgreSQL
## Providers: API-Tennis | Goalserve (Horse Racing) | BetsAPI (Greyhound)
## Purpose: Fixtures, live status, results, participants, start times only (no odds needed)

---

You are an expert Elixir/Phoenix backend developer. Your task is to build a complete, production-ready
integration layer for three external sports data APIs. You will create HTTP clients, data normalisation
modules, database schemas, and scheduled polling workers for each provider. Follow all specifications
below exactly — each API has different authentication, response formats, and quirks.

---

## GLOBAL ARCHITECTURE RULES

- Use `Req` (or `Tesla`) as the HTTP client library.
- All API calls must be wrapped in a dedicated context module per provider.
- Normalise all three providers into a single unified internal schema (see Unified Schema below).
- Store normalised events in PostgreSQL using Ecto schemas.
- Use `Oban` for background polling jobs — one worker module per provider.
- All API keys/tokens must be read from `Application.get_env/2` — never hardcoded.
- All HTTP errors, JSON decode errors, and unexpected response shapes must be handled
  gracefully; log errors and return `{:error, reason}` — never raise in production code.
- Respect rate limits strictly (see per-provider limits).
- All timestamps should be stored and handled in UTC.

---

## UNIFIED INTERNAL SCHEMA

Normalise every event from every provider into this shape before persisting:

```elixir
%{
  provider: :api_tennis | :goalserve | :betsapi,   # atom
  provider_event_id: String.t(),                    # original ID from provider
  sport: :tennis | :horse_racing | :greyhound,
  competition_name: String.t(),                     # tournament / track / meeting name
  status: :scheduled | :live | :finished | :cancelled | :unknown,
  start_time_utc: DateTime.t(),                     # event start in UTC
  participants: [%{name: String.t(), role: String.t()}],
  # e.g. [{name: "Djokovic N.", role: "player_1"}, {name: "Alcaraz C.", role: "player_2"}]
  # for racing: [{name: "Horse Name", role: "runner", number: 3, jockey: "J. Smith"}]
  result: map() | nil,                              # raw result block, nil if not finished
  raw: map()                                        # original full response object, for debugging
}
```

---

## PROVIDER 1 — API-TENNIS (api-tennis.com)
### Sport: Tennis
### Docs: https://api-tennis.com/documentation | https://api-tennis.com/documentation_websocket
### Version: REST v2.9.4 + WebSocket v1.2.1

### Authentication
- Method: API key passed as a **query parameter** named `APIkey`
- You receive one key from your dashboard at api-tennis.com
- Config key: `config :my_app, :api_tennis_key, "YOUR_KEY_HERE"`
- No headers required for auth.

### Base URL
```
https://api.api-tennis.com/tennis/
```
All requests are GET (or POST — GET is preferred). Append `?method=METHOD_NAME&APIkey=KEY&...params`.

### Rate Limits
- Starter plan: 8,000 requests/day
- Premium plan: 80,000 requests/day
- Business plan: 200,000 requests/day
- No per-second limit documented — implement 200ms minimum delay between polling calls to be safe.

### Response Envelope
Every REST response wraps results in:
```json
{
  "success": 1,
  "result": [ ... ]
}
```
Check `success == 1` before processing. If `success == 0`, log the error and return `{:error, :api_error}`.

---

### ENDPOINT 1A — Get Event Types (tournament categories)
Returns all tournament types your plan supports. Call once on startup, cache results.

**URL:**
```
GET https://api.api-tennis.com/tennis/?method=get_events&APIkey=YOUR_KEY
```

**Response fields per item:**
```json
{
  "event_type_key": "265",
  "event_type_type": "Atp Singles"
}
```
Cache this as a map: `%{"265" => "Atp Singles", ...}` — used to enrich fixture data.

---

### ENDPOINT 1B — Get Tournaments
Returns all tournaments your plan covers. Call once daily, cache results.

**URL:**
```
GET https://api.api-tennis.com/tennis/?method=get_tournaments&APIkey=YOUR_KEY
```

**Response fields per item:**
```json
{
  "tournament_key": "2131",
  "tournament_name": "Acapulco",
  "event_type_key": "265",
  "event_type_type": "Atp Singles"
}
```

---

### ENDPOINT 1C — Get Fixtures (scheduled + results)
The primary endpoint. Poll this to get upcoming and finished matches.

**URL:**
```
GET https://api.api-tennis.com/tennis/?method=get_fixtures
  &APIkey=YOUR_KEY
  &date_start=YYYY-MM-DD
  &date_stop=YYYY-MM-DD
  [&event_type_key=265]        # optional: filter by event type
  [&tournament_key=2131]       # optional: filter by tournament
  [&match_key=143104]          # optional: single match detail
  [&player_key=949]            # optional: filter by player
  [&timezone=Europe/London]    # optional: defaults to Europe/Berlin — ALWAYS set this to UTC
```

**Important:** Always pass `&timezone=UTC` to receive times in UTC.

**Response fields per fixture:**
```json
{
  "event_key": "143104",           // unique match ID — use as provider_event_id
  "event_date": "2022-06-17",      // YYYY-MM-DD
  "event_time": "18:00",           // HH:MM in requested timezone
  "event_first_player": "M. Navone",
  "first_player_key": "949",
  "event_second_player": "C. Gomez-Herrera",
  "second_player_key": "3474",
  "event_final_result": "2 - 0",   // "X - Y" sets won, or "-" if not finished
  "event_game_result": "-",        // current game score during live
  "event_serve": null,             // "First Player" | "Second Player" | null
  "event_winner": "First Player",  // "First Player" | "Second Player" | null
  "event_status": "Finished",      // "" (scheduled) | "Set 1" | "Set 2" | "Finished" | etc.
  "event_live": "0",               // "1" = currently live, "0" = not live
  "event_type_type": "Challenger Men Singles",
  "tournament_name": "Corrientes Challenger Men",
  "tournament_key": "2646",
  "tournament_round": "",
  "tournament_season": "2022",
  "event_qualification": "False",
  "scores": [                      // array of set scores
    {"score_first": "6", "score_second": "4", "score_set": "1"},
    {"score_first": "6", "score_second": "2", "score_set": "2"}
  ],
  "pointbypoint": [ ... ]          // detailed point log — only on Business plan
}
```

**Status mapping:**
```elixir
defp map_tennis_status("Finished"), do: :finished
defp map_tennis_status("1"), do: :live   # when event_live == "1"
defp map_tennis_status(""), do: :scheduled
defp map_tennis_status(_), do: :live     # "Set 1", "Set 2", "Tiebreak", etc. = live
```

**Participants mapping:**
```elixir
[
  %{name: event["event_first_player"], role: "player_1", provider_id: event["first_player_key"]},
  %{name: event["event_second_player"], role: "player_2", provider_id: event["second_player_key"]}
]
```

**Polling strategy:**
- Poll `/get_fixtures` every 60 seconds for live events (event_live == "1")
- Poll every 5 minutes for today's fixtures
- Poll once daily for the next 3 days of fixtures (pre-schedule)

---

### ENDPOINT 1D — Livescore
Returns only currently live matches. More efficient than polling all fixtures when you only need live data.

**URL:**
```
GET https://api.api-tennis.com/tennis/?method=get_livescore&APIkey=YOUR_KEY&timezone=UTC
```
Response shape is identical to get_fixtures. Filter on `event_live == "1"`.

---

### WEBSOCKET — Live Events (Business plan only)
If on the Business plan, prefer WebSocket over REST polling for live data.

**Endpoint:**
```
wss://wss.api-tennis.com/live?APIkey=YOUR_KEY&timezone=UTC
```

**Optional filters (append as query params):**
- `&tournament_key=2131` — filter to one tournament
- `&match_key=143104` — filter to one match
- `&player_key=949` — filter to one player

**Message format:** The server pushes a JSON object identical to a fixtures response item every time a match updates.

**Elixir implementation:** Use `WebSockex` library. Implement a GenServer that:
1. Connects on startup
2. Handles `{:text, json_string}` frames — parse and normalise immediately
3. Reconnects with exponential backoff on disconnect (start at 1s, max 30s)
4. Falls back to REST polling if WebSocket is down for > 60 seconds

---

### ELIXIR MODULE SKELETON — API-Tennis
```elixir
defmodule MyApp.Providers.ApiTennis do
  @base_url "https://api.api-tennis.com/tennis/"
  
  defp api_key, do: Application.get_env(:my_app, :api_tennis_key)

  def get_fixtures(date_start, date_stop, opts \\ []) do
    params = [
      method: "get_fixtures",
      APIkey: api_key(),
      date_start: Date.to_string(date_start),
      date_stop: Date.to_string(date_stop),
      timezone: "UTC"
    ] ++ opts
    
    case Req.get(@base_url, params: params) do
      {:ok, %{status: 200, body: %{"success" => 1, "result" => results}}} ->
        {:ok, Enum.map(results, &normalise_fixture/1)}
      {:ok, %{body: %{"success" => 0}}} ->
        {:error, :api_error}
      {:error, reason} ->
        {:error, reason}
    end
  end
  
  defp normalise_fixture(event) do
    %{
      provider: :api_tennis,
      provider_event_id: event["event_key"],
      sport: :tennis,
      competition_name: event["tournament_name"],
      status: map_status(event),
      start_time_utc: parse_datetime(event["event_date"], event["event_time"]),
      participants: [
        %{name: event["event_first_player"], role: "player_1",
          provider_id: event["first_player_key"]},
        %{name: event["event_second_player"], role: "player_2",
          provider_id: event["second_player_key"]}
      ],
      result: if(event["event_winner"], do: %{
        winner: event["event_winner"],
        final_result: event["event_final_result"],
        scores: event["scores"]
      }, else: nil),
      raw: event
    }
  end
  
  defp map_status(%{"event_live" => "1"}), do: :live
  defp map_status(%{"event_status" => "Finished"}), do: :finished
  defp map_status(%{"event_status" => ""}), do: :scheduled
  defp map_status(_), do: :live
  
  defp parse_datetime(date_str, time_str) do
    # Combine "2022-06-17" + "18:00" into a UTC DateTime
    # event times are already UTC when timezone=UTC is passed
    NaiveDateTime.new!(Date.from_iso8601!(date_str),
      Time.from_iso8601!("#{time_str}:00"))
    |> DateTime.from_naive!("Etc/UTC")
  end
end
```

---

## PROVIDER 2 — GOALSERVE (goalserve.com)
### Sport: Horse Racing
### Docs: https://documentation.goalserve.com/v1/ | https://www.goalserve.com/en/sport-data-feeds/horse-racing-api/
### Data format: XML (primary) and JSON
### Version: REST

### Authentication
- Method: API key passed as query parameter `key` (sometimes `apikey` depending on endpoint — check your welcome email).
- Your IP address must be **whitelisted** by Goalserve before any calls work. Email support to add your server IP.
- Config key: `config :my_app, :goalserve_key, "YOUR_KEY_HERE"`

### Base URL
```
http://www.goalserve.com/getfeed/YOUR_KEY/FEED_TYPE/PARAMETERS
```
The URL structure is: `/{key}/{feed_category}/{feed_name}/{optional_id}`

**Important:** Goalserve URLs are constructed differently from typical REST APIs — the API key is a path segment, not a query param. Your HTTP client must interpolate the key into the URL path.

### Data Formats
Goalserve returns **XML by default**. Append `?json=1` to any URL to receive JSON instead.
Always request JSON: `?json=1` — much easier to parse in Elixir.

### Rate Limits
- Not publicly published.
- Goalserve recommends caching responses and not hammering endpoints.
- Implement minimum 30-second polling intervals for live/race-day data.
- Implement minimum 5-minute intervals for pre-race data.

---

### ENDPOINT 2A — Today's Horse Racing (Race Cards + Live Results)
Returns today's races for the specified region, including runners, jockeys, trainers, and results.

**URL pattern:**
```
GET http://www.goalserve.com/getfeed/{KEY}/racing/events?json=1
```
Or, for region-specific feeds (contact Goalserve for your specific URL — it is provided in your welcome pack):
```
GET http://www.goalserve.com/getfeed/{KEY}/racing/{region}?json=1
# where {region} is: uk | usa | southafrica | france | sweden
```

**XML sample structure (shown here to understand nesting — always request JSON):**
```xml
<scores sport="horse racing">
  <tournament name="Catterick" date="26.02.2019" going="Good" id="1279">
    <race name="Race 1 Handicap Hurdle" time="14:20" offAt="14:20" status=""
          class="Class 5" distance="2m 3f 66y" datetime="26.02.2019 13:20" id="409354">
      <runners>
        <horse number="1" stall="" name="Eolian" age="5" wgt="72"
               gender="gelding" rating="99"
               jockey="Miss A Stevens" jockey_id="1503917"
               trainer="Olly Murphy" trainer_id="1493214" id="328985">
          <recent_form>
            <section name="race record">
              <stat name="All Jumps Races" runs="4" wins="0" places="0" win_pct="0%" />
            </section>
            ...
          </recent_form>
        </horse>
      </runners>
      <results>
        <!-- populated after race finishes -->
        <!-- <result position="1" horse_id="328985" name="Eolian" ... /> -->
      </results>
      <wagers_available>
        <wageravail type="Exacta" />
        <wageravail type="Trifecta" />
      </wagers_available>
    </race>
  </tournament>
</scores>
```

**Equivalent JSON structure (when ?json=1 is passed):**
```json
{
  "scores": {
    "sport": "horse racing",
    "tournament": [
      {
        "name": "Catterick",
        "date": "26.02.2019",
        "going": "Good",
        "id": "1279",
        "race": [
          {
            "name": "Race 1 Handicap Hurdle",
            "time": "14:20",
            "offAt": "14:20",
            "status": "",
            "class": "Class 5",
            "distance": "2m 3f 66y",
            "datetime": "26.02.2019 13:20",
            "id": "409354",
            "horse": [
              {
                "number": "1",
                "name": "Eolian",
                "age": "5",
                "wgt": "72",
                "gender": "gelding",
                "rating": "99",
                "jockey": "Miss A Stevens",
                "jockey_id": "1503917",
                "trainer": "Olly Murphy",
                "trainer_id": "1493214",
                "id": "328985",
                "recent_form": { ... }
              }
            ],
            "results": {},
            "wagers_available": { ... }
          }
        ]
      }
    ]
  }
}
```

**Status mapping:**
```elixir
# race["status"] values observed:
# "" or nil       → :scheduled
# "Open"          → :live (betting open, race starting soon)
# "Result"        → :finished
# "Abandoned"     → :cancelled
# anything else   → :unknown
defp map_race_status(""), do: :scheduled
defp map_race_status(nil), do: :scheduled
defp map_race_status("Open"), do: :live
defp map_race_status("Result"), do: :finished
defp map_race_status("Abandoned"), do: :cancelled
defp map_race_status(_), do: :unknown
```

**Participants mapping (runners):**
```elixir
# horse is a list when multiple runners, map over it safely with List.wrap/1
defp map_runners(race) do
  race
  |> Map.get("horse", [])
  |> List.wrap()
  |> Enum.map(fn horse ->
    %{
      name: horse["name"],
      role: "runner",
      number: horse["number"],
      jockey: horse["jockey"],
      trainer: horse["trainer"],
      provider_id: horse["id"],
      weight: horse["wgt"],
      rating: horse["rating"]
    }
  end)
end
```

**CRITICAL Goalserve JSON parsing note:** Goalserve's JSON wraps single-item arrays as plain objects,
not arrays. Always use `List.wrap/1` when accessing any list field (tournaments, races, horses, results).
Example: if there is only one race in a tournament, `"race"` will be a map `{}`, not a list `[{}]`.

**datetime parsing:** Goalserve returns datetimes as `"26.02.2019 13:20"` — parse as `DD.MM.YYYY HH:MM`.
The timezone depends on the regional feed. UK feed = Europe/London. Always convert to UTC on ingest.

```elixir
defp parse_goalserve_datetime(datetime_str, timezone \\ "Europe/London") do
  # "26.02.2019 13:20"
  [date_part, time_part] = String.split(datetime_str, " ")
  [day, month, year] = String.split(date_part, ".") |> Enum.map(&String.to_integer/1)
  [hour, minute] = String.split(time_part, ":") |> Enum.map(&String.to_integer/1)
  naive = NaiveDateTime.new!(year, month, day, hour, minute, 0)
  # Convert from local time to UTC using Tzdata
  DateTime.from_naive!(naive, timezone) |> DateTime.shift_zone!("Etc/UTC")
end
```

---

### ENDPOINT 2B — Historical Results
Returns past race results for a specific date.

**URL:**
```
GET http://www.goalserve.com/getfeed/{KEY}/racing/results/{YYYY-MM-DD}?json=1
```
Same response structure as the events endpoint but with results populated.

---

### ENDPOINT 2C — Webhooks / Inplay (if enabled)
Goalserve offers webhook push notifications for their inplay module. Your server must expose a POST endpoint.
Your IP must be whitelisted. See https://documentation.goalserve.com/v1/ under "Inplay Webhooks".

Webhook payload structure:
```json
{
  "type": "update",
  "eventId": "409354",
  "sport": "horse racing",
  "data": { ... }
}
```
Implement a Phoenix controller `GoalserveWebhookController` to receive these at `/webhooks/goalserve`.

---

### ELIXIR MODULE SKELETON — Goalserve
```elixir
defmodule MyApp.Providers.Goalserve do
  @base_url "http://www.goalserve.com/getfeed"
  
  defp api_key, do: Application.get_env(:my_app, :goalserve_key)

  def get_todays_races(region \\ "uk") do
    url = "#{@base_url}/#{api_key()}/racing/#{region}"
    
    case Req.get(url, params: [json: 1]) do
      {:ok, %{status: 200, body: body}} ->
        {:ok, parse_races(body)}
      {:ok, %{status: status}} ->
        {:error, {:http_error, status}}
      {:error, reason} ->
        {:error, reason}
    end
  end
  
  defp parse_races(body) do
    body
    |> get_in(["scores", "tournament"])
    |> List.wrap()
    |> Enum.flat_map(fn tournament ->
      tournament
      |> Map.get("race", [])
      |> List.wrap()
      |> Enum.map(fn race -> normalise_race(tournament, race) end)
    end)
  end
  
  defp normalise_race(tournament, race) do
    %{
      provider: :goalserve,
      provider_event_id: race["id"],
      sport: :horse_racing,
      competition_name: "#{tournament["name"]} - #{race["name"]}",
      status: map_race_status(race["status"]),
      start_time_utc: parse_goalserve_datetime(race["datetime"]),
      participants: map_runners(race),
      result: parse_results(race["results"]),
      raw: race
    }
  end

  defp map_race_status(""), do: :scheduled
  defp map_race_status(nil), do: :scheduled
  defp map_race_status("Open"), do: :live
  defp map_race_status("Result"), do: :finished
  defp map_race_status("Abandoned"), do: :cancelled
  defp map_race_status(_), do: :unknown
  
  defp map_runners(race) do
    race |> Map.get("horse", []) |> List.wrap()
    |> Enum.map(fn h ->
      %{name: h["name"], role: "runner", number: h["number"],
        jockey: h["jockey"], provider_id: h["id"]}
    end)
  end
  
  defp parse_results(nil), do: nil
  defp parse_results(%{}), do: nil   # empty map = no result yet
  defp parse_results(results) when is_map(results) do
    results |> Map.get("result", []) |> List.wrap()
    |> Enum.map(fn r -> %{position: r["position"], name: r["name"], horse_id: r["horse_id"]} end)
  end
  
  defp parse_goalserve_datetime(nil), do: nil
  defp parse_goalserve_datetime(datetime_str) do
    [date_part, time_part] = String.split(datetime_str, " ")
    [day, month, year] = String.split(date_part, ".") |> Enum.map(&String.to_integer/1)
    [hour, minute] = String.split(time_part, ":") |> Enum.map(&String.to_integer/1)
    NaiveDateTime.new!(year, month, day, hour, minute, 0)
    |> DateTime.from_naive!("Europe/London")
    |> DateTime.shift_zone!("Etc/UTC")
  end
end
```

---

## PROVIDER 3 — BETSAPI / B365API (betsapi.com)
### Sport: Greyhound Racing (also covers Horse Racing and Tennis as backup/cross-check)
### Docs: https://betsapi.com/docs/ | https://betsapi.com/api-doc/index.html
### Version: v1
### ⚠ LEGAL NOTE: BetsAPI is a prototype/MVP source only for greyhound.
###   It aggregates from Bet365 and others. It does NOT hold official GBGB data rights.
###   Replace with a licensed provider (Podium Sports) before production launch.

### Authentication
- Method: Token passed as **query parameter** `token=YOUR_TOKEN`
- Or in HTTP header: `X-API-TOKEN: YOUR_TOKEN` (both work)
- You receive the token from the Orders page after purchase.
- Config key: `config :my_app, :betsapi_token, "YOUR_TOKEN_HERE"`
- Base URLs (both work — use b365api as primary, betsapi as fallback):
  - Primary: `https://api.b365api.com/`
  - Fallback: `https://api.betsapi.com/`

### Rate Limits
- Default: **3,600 requests/hour** (1 req/sec effective)
- Rate limit headers returned with every response:
  ```
  X-RateLimit-Limit: 3600
  X-RateLimit-Remaining: 3599
  X-RateLimit-Reset: 1495857600   ← Unix timestamp when limit resets
  ```
- Volume packages: $50 extra for 199,999 req/hr standalone server
- Implement a rate limiter in your Oban worker — do not exceed 1 request/second on default plan.
- If you receive HTTP 429, back off for `(X-RateLimit-Reset - now)` seconds.

### Response Envelope
All responses return JSON with a `success` field:
```json
{
  "success": 1,
  "results": [ ... ],   // or "result" (singular) — check per endpoint
  "pager": {            // present when pagination applies
    "page": 1,
    "per_page": 50,
    "total": 423
  }
}
```
Pagination: when `pager` is present, fetch all pages by incrementing `page=2`, `page=3`, etc.
Stop when `page * per_page >= total`.

### Sport IDs
BetsAPI identifies sports by numeric `sport_id`. The relevant IDs:
```
Tennis:       13
Horse Racing: 16
Greyhounds:   78
```
Always pass `sport_id=78` for greyhound racing.

---

### ENDPOINT 3A — Upcoming Events (Fixtures)
Returns upcoming/scheduled events for a given sport.

**URL:**
```
GET https://api.b365api.com/v1/events/upcoming
  ?token=YOUR_TOKEN
  &sport_id=78           # 78 = Greyhounds, 16 = Horse Racing, 13 = Tennis
  [&league_id=LEAGUE_ID] # optional: filter by league/meeting
  [&page=1]              # pagination, default page=1
```

**Response fields per event:**
```json
{
  "id": "123456789",           // event ID — use as provider_event_id
  "sport_id": "78",
  "time": "1711980000",        // Unix timestamp (UTC) — this is the authoritative start time
  "time_status": "0",          // see status mapping below
  "league": {
    "id": "12345",
    "name": "UK Greyhounds - Romford"
  },
  "home": {
    "id": "111",
    "name": "Trap 1"            // for racing, "home" = trap/runner name or "field"
  },
  "away": {
    "id": "222",
    "name": "Trap 2"
  },
  "ss": null,                   // score string, null if not started
  "our_event_id": "111222",
  "r_id": "xxxxxxxx"
}
```

**time_status mapping** — this is the primary status field:
```elixir
defp map_betsapi_status("0"), do: :scheduled   # not started
defp map_betsapi_status("1"), do: :live        # in play
defp map_betsapi_status("2"), do: :finished    # ended / to be confirmed
defp map_betsapi_status("3"), do: :finished    # ended
defp map_betsapi_status("4"), do: :cancelled   # postponed
defp map_betsapi_status("5"), do: :cancelled   # cancelled
defp map_betsapi_status("6"), do: :cancelled   # abandoned
defp map_betsapi_status("7"), do: :live        # interrupted
defp map_betsapi_status("8"), do: :scheduled   # suspended (will resume)
defp map_betsapi_status("9"), do: :cancelled   # retired
defp map_betsapi_status(_), do: :unknown
```

---

### ENDPOINT 3B — Inplay Events (Live)
Returns only currently live events. More efficient for live polling.

**URL:**
```
GET https://api.b365api.com/v1/events/inplay
  ?token=YOUR_TOKEN
  &sport_id=78
```
Response shape is identical to the upcoming endpoint, but `time_status` will be `"1"` for all events.

---

### ENDPOINT 3C — Ended Events (Results)
Returns recently finished events. Use to close out results.

**URL:**
```
GET https://api.b365api.com/v1/events/ended
  ?token=YOUR_TOKEN
  &sport_id=78
  [&page=1]
```
Events here have `time_status` of `"2"` or `"3"`. The `ss` field contains final score string.

---

### ENDPOINT 3D — Event Detail (Single Event)
Returns full detail for one event, including result if available.

**URL:**
```
GET https://api.b365api.com/v1/event/view
  ?token=YOUR_TOKEN
  &event_id=123456789
```

**Response:** Same shape as events list, but for a single event. May include extended `stats` and `scores` blocks depending on sport coverage.

---

### ENDPOINT 3E — Search Events
Useful for finding a specific event by team/participant names and approximate time.

**URL:**
```
GET https://api.b365api.com/v1/events/search
  ?token=YOUR_TOKEN
  &sport_id=78
  &home=Romford&away=...
  &time=UNIX_TIMESTAMP
```

---

### ELIXIR MODULE SKELETON — BetsAPI
```elixir
defmodule MyApp.Providers.BetsApi do
  @primary_url "https://api.b365api.com"
  @fallback_url "https://api.betsapi.com"
  @greyhound_sport_id 78
  @horse_racing_sport_id 16
  @tennis_sport_id 13
  
  defp token, do: Application.get_env(:my_app, :betsapi_token)

  def get_upcoming_greyhounds(page \\ 1) do
    get_events(:upcoming, @greyhound_sport_id, page)
  end
  
  def get_live_greyhounds do
    get_events(:inplay, @greyhound_sport_id, 1)
  end
  
  def get_ended_greyhounds(page \\ 1) do
    get_events(:ended, @greyhound_sport_id, page)
  end
  
  defp get_events(type, sport_id, page) do
    endpoint = case type do
      :upcoming -> "/v1/events/upcoming"
      :inplay   -> "/v1/events/inplay"
      :ended    -> "/v1/events/ended"
    end
    url = @primary_url <> endpoint
    params = [token: token(), sport_id: sport_id, page: page]
    
    case Req.get(url, params: params) do
      {:ok, %{status: 200, body: %{"success" => 1, "results" => results}}} ->
        {:ok, Enum.map(results, &normalise_event/1)}
      {:ok, %{status: 429, headers: headers}} ->
        reset_at = headers |> Enum.find_value(fn {k, v} ->
          if k == "x-ratelimit-reset", do: String.to_integer(v)
        end)
        {:error, {:rate_limited, reset_at}}
      {:ok, %{body: %{"success" => 0}}} ->
        {:error, :api_error}
      {:error, reason} ->
        {:error, reason}
    end
  end
  
  defp normalise_event(event) do
    %{
      provider: :betsapi,
      provider_event_id: to_string(event["id"]),
      sport: :greyhound,
      competition_name: get_in(event, ["league", "name"]) || "Unknown",
      status: map_betsapi_status(to_string(event["time_status"])),
      start_time_utc: DateTime.from_unix!(String.to_integer(to_string(event["time"]))),
      participants: [
        %{name: get_in(event, ["home", "name"]), role: "home",
          provider_id: get_in(event, ["home", "id"])},
        %{name: get_in(event, ["away", "name"]), role: "away",
          provider_id: get_in(event, ["away", "id"])}
      ],
      result: if(event["ss"], do: %{score: event["ss"]}, else: nil),
      raw: event
    }
  end
  
  defp map_betsapi_status("0"), do: :scheduled
  defp map_betsapi_status("1"), do: :live
  defp map_betsapi_status("2"), do: :finished
  defp map_betsapi_status("3"), do: :finished
  defp map_betsapi_status("4"), do: :cancelled
  defp map_betsapi_status("5"), do: :cancelled
  defp map_betsapi_status("6"), do: :cancelled
  defp map_betsapi_status("7"), do: :live
  defp map_betsapi_status("8"), do: :scheduled
  defp map_betsapi_status(_),   do: :unknown
end
```

---

## DATABASE SCHEMA (Ecto)

```elixir
# migration: create_sports_events.exs
defmodule MyApp.Repo.Migrations.CreateSportsEvents do
  use Ecto.Migration

  def change do
    create table(:sports_events, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :provider, :string, null: false           # "api_tennis" | "goalserve" | "betsapi"
      add :provider_event_id, :string, null: false
      add :sport, :string, null: false               # "tennis" | "horse_racing" | "greyhound"
      add :competition_name, :string
      add :status, :string, null: false, default: "scheduled"
      add :start_time_utc, :utc_datetime
      add :participants, {:array, :map}, default: []
      add :result, :map
      add :raw, :map
      timestamps(type: :utc_datetime)
    end

    create unique_index(:sports_events, [:provider, :provider_event_id])
    create index(:sports_events, [:sport])
    create index(:sports_events, [:status])
    create index(:sports_events, [:start_time_utc])
  end
end
```

---

## OBAN POLLING WORKERS

```elixir
# Tennis — poll fixtures every 5 minutes
defmodule MyApp.Workers.TennisFetchWorker do
  use Oban.Worker, queue: :data_feeds, max_attempts: 3

  @impl Oban.Worker
  def perform(%Oban.Job{}) do
    today = Date.utc_today()
    tomorrow = Date.add(today, 1)
    
    case MyApp.Providers.ApiTennis.get_fixtures(today, tomorrow) do
      {:ok, events} -> MyApp.DataIngestion.upsert_events(events)
      {:error, reason} -> {:error, reason}
    end
  end
end

# Horse Racing — poll today's races every 2 minutes
defmodule MyApp.Workers.HorseRacingFetchWorker do
  use Oban.Worker, queue: :data_feeds, max_attempts: 3

  @impl Oban.Worker
  def perform(%Oban.Job{}) do
    Enum.each(["uk", "usa", "france"], fn region ->
      case MyApp.Providers.Goalserve.get_todays_races(region) do
        {:ok, events} -> MyApp.DataIngestion.upsert_events(events)
        {:error, reason} -> Logger.error("Goalserve #{region} fetch failed: #{inspect(reason)}")
      end
      Process.sleep(500)  # space out regional calls
    end)
    :ok
  end
end

# Greyhound — poll live events every 60 seconds
defmodule MyApp.Workers.GreyhoundFetchWorker do
  use Oban.Worker, queue: :data_feeds, max_attempts: 3

  @impl Oban.Worker
  def perform(%Oban.Job{}) do
    with {:ok, live} <- MyApp.Providers.BetsApi.get_live_greyhounds(),
         {:ok, upcoming} <- MyApp.Providers.BetsApi.get_upcoming_greyhounds() do
      MyApp.DataIngestion.upsert_events(live ++ upcoming)
    else
      {:error, {:rate_limited, reset_at}} ->
        snooze = max(reset_at - System.system_time(:second) + 1, 5)
        {:snooze, snooze}
      {:error, reason} ->
        {:error, reason}
    end
  end
end
```

**Schedule workers in config:**
```elixir
# config/config.exs
config :my_app, Oban,
  queues: [data_feeds: 5],
  plugins: [
    {Oban.Plugins.Cron, crontab: [
      {"*/5 * * * *",  MyApp.Workers.TennisFetchWorker},
      {"*/2 * * * *",  MyApp.Workers.HorseRacingFetchWorker},
      {"* * * * *",    MyApp.Workers.GreyhoundFetchWorker}
    ]}
  ]
```

---

## ENVIRONMENT CONFIG

Add to `config/runtime.exs`:
```elixir
config :my_app,
  api_tennis_key:  System.get_env("API_TENNIS_KEY")  || raise("API_TENNIS_KEY not set"),
  goalserve_key:   System.get_env("GOALSERVE_KEY")   || raise("GOALSERVE_KEY not set"),
  betsapi_token:   System.get_env("BETSAPI_TOKEN")   || raise("BETSAPI_TOKEN not set")
```

`.env` / deployment secrets:
```
API_TENNIS_KEY=your_api_tennis_key_here
GOALSERVE_KEY=your_goalserve_key_here
BETSAPI_TOKEN=your_betsapi_token_here
```

---

## CRITICAL IMPLEMENTATION NOTES

1. **Goalserve XML-as-JSON quirk:** Single-item lists are returned as objects, not arrays.
   ALWAYS wrap with `List.wrap/1` before calling `Enum.map/2` on any list field.

2. **Goalserve IP whitelisting:** API calls will silently fail (empty response or 403)
   until your server IP is whitelisted. Contact support@goalserve.com immediately after signup.

3. **BetsAPI dual URLs:** Primary is `api.b365api.com`, fallback is `api.betsapi.com`.
   Implement automatic fallback: if primary returns non-2xx, retry once on fallback URL.

4. **BetsAPI rate limit header handling:** Read `X-RateLimit-Remaining` on every response.
   When it drops to 0, pause all BetsAPI calls until `X-RateLimit-Reset` unix timestamp.

5. **API-Tennis time zones:** The API defaults to `Europe/Berlin`. Always pass `&timezone=UTC`
   on every fixtures and livescore request to receive UTC times. Do not assume the default.

6. **API-Tennis WebSocket reconnection:** The WSS server can disconnect without warning.
   Implement a supervisor around the WebSockex process to auto-restart it.

7. **Upsert pattern:** Use `Repo.insert/2` with `on_conflict: :replace_all` and
   `conflict_target: [:provider, :provider_event_id]` to safely handle re-ingestion of the same event.

8. **No odds needed:** You are NOT consuming odds data from any of these APIs — only event/fixture/result
   data. When response payloads include odds fields, ignore them entirely.

9. **Goalserve commercial rights:** Before going live with horse racing data, confirm in writing with
   Goalserve that your subscription includes commercial use rights for a betting platform in your target
   jurisdiction. This is a legal requirement, not a preference.

10. **BetsAPI greyhound legal status:** BetsAPI does NOT hold GBGB (UK greyhound governing body) data
    rights. This is acceptable for MVP prototyping only. Before production launch, replace with
    Podium Sports (podiumsports.com) for fully licensed UK/Ireland greyhound data.
