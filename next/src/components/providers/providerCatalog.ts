export type ProviderPreset = {
  name: string;
  title: string;
  category: string;
  description: string;
  authLabel: string;
  defaultBaseUrl?: string;
  supportsProviderOdds?: boolean;
  configFields: Array<{
    key: string;
    label: string;
    placeholder?: string;
    help: string;
  }>;
};

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    name: "sportmonks",
    title: "SportMonks",
    category: "Cricket / Odds Reference",
    description: "Best used for cricket fixtures, live scores, and optional provider odds reference imports.",
    authLabel: "API token",
    defaultBaseUrl: "https://cricket.sportmonks.com/api/v2.0",
    supportsProviderOdds: true,
    configFields: [
      { key: "fixtures_endpoint", label: "Fixtures endpoint", placeholder: "/fixtures", help: "Endpoint for fixture imports." },
      { key: "live_endpoint", label: "Live endpoint", placeholder: "/livescores", help: "Endpoint for live match refresh." },
      { key: "provider_odds_endpoint", label: "Provider odds endpoint", placeholder: "/odds/fixtures/{fixture_id}", help: "Optional reference-odds endpoint." },
    ],
  },
  {
    name: "cricketdata",
    title: "CricketData",
    category: "Cricket",
    description: "Cricket fixtures and live scores through query-param API key auth.",
    authLabel: "API key query param",
    defaultBaseUrl: "https://api.cricketdata.org",
    configFields: [
      { key: "fixtures_endpoint", label: "Fixtures endpoint", placeholder: "/v1/matches", help: "Endpoint for match imports." },
      { key: "live_endpoint", label: "Live endpoint", placeholder: "/v1/currentMatches", help: "Endpoint for live refresh." },
    ],
  },
  {
    name: "api_tennis",
    title: "API Tennis",
    category: "Tennis",
    description: "Tennis fixtures, live states, point-by-point scoring, and in-play odds through API Tennis Business Plan.",
    authLabel: "Query API key",
    defaultBaseUrl: "https://api.api-tennis.com/tennis/",
    supportsProviderOdds: true,
    configFields: [
      { key: "api_key_param", label: "API key param", placeholder: "APIkey", help: "Query parameter used by API Tennis auth." },
      { key: "fixtures_method", label: "Fixtures method", placeholder: "get_fixtures", help: "REST method for fixture fetching." },
      { key: "live_method", label: "Live method", placeholder: "get_livescore", help: "REST method for live tennis state." },
      { key: "live_odds_method", label: "Live odds method", placeholder: "get_live_odds", help: "REST method for in-play odds passthrough." },
    ],
  },
  {
    name: "api_sports",
    title: "API-Sports",
    category: "Football",
    description: "Football fixtures and live data through x-apisports-key header auth.",
    authLabel: "Header API key",
    defaultBaseUrl: "https://v3.football.api-sports.io",
    configFields: [
      { key: "fixtures_endpoint", label: "Fixtures endpoint", placeholder: "/fixtures", help: "Endpoint for fixture imports." },
      { key: "live_endpoint", label: "Live endpoint", placeholder: "/fixtures", help: "Endpoint for live refresh. Live=all is added automatically." },
    ],
  },
  {
    name: "allsports",
    title: "AllSportsAPI",
    category: "Football",
    description: "Football data with API key in query params.",
    authLabel: "API key query param",
    defaultBaseUrl: "https://apiv2.allsportsapi.com",
    configFields: [
      { key: "fixtures_endpoint", label: "Fixtures endpoint", placeholder: "/football/", help: "Base endpoint for fixture imports." },
      { key: "live_endpoint", label: "Live endpoint", placeholder: "/football/", help: "Base endpoint for live refresh." },
    ],
  },
  {
    name: "entitysport",
    title: "EntitySport",
    category: "Cricket / Multi-sport",
    description: "Token-based sports data provider used through query-param token auth.",
    authLabel: "Token",
    defaultBaseUrl: "https://rest.entitysport.com/v2",
    configFields: [
      { key: "fixtures_endpoint", label: "Fixtures endpoint", placeholder: "/matches", help: "Endpoint for fixture imports." },
      { key: "live_endpoint", label: "Live endpoint", placeholder: "/matches", help: "Endpoint for live refresh." },
    ],
  },
  {
    name: "goalserve",
    title: "Goalserve",
    category: "Horse Racing",
    description: "Horse racing feed using Goalserve key-in-path auth. Region and timezone matter more than endpoint overrides.",
    authLabel: "Feed key",
    defaultBaseUrl: "http://www.goalserve.com/getfeed",
    configFields: [
      { key: "region", label: "Default region", placeholder: "uk", help: "Default horse racing region when the feed does not override it." },
      { key: "timezone", label: "Timezone", placeholder: "Europe/London", help: "Timezone used for Goalserve date parsing." },
    ],
  },
  {
    name: "betsapi",
    title: "BetsAPI",
    category: "Dog Racing / Racing",
    description: "Dog-racing and racing feed using token-based query auth. Supports optional fallback base URL.",
    authLabel: "Token",
    defaultBaseUrl: "https://api.b365api.com",
    configFields: [
      { key: "fallback_url", label: "Fallback base URL", placeholder: "https://api.betsapi.com", help: "Optional fallback host for request failures." },
      { key: "page", label: "Default page", placeholder: "1", help: "Default pagination page for manual fetches." },
      { key: "league_id", label: "Default league id", placeholder: "1234", help: "Optional league filter when the feed does not provide it." },
    ],
  },
];

export function getProviderPreset(name: string) {
  return PROVIDER_PRESETS.find((item) => item.name === name);
}
