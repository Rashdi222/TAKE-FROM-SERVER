use std::{env, time::Duration};

use anyhow::Result;

#[derive(Clone, Debug)]
pub struct AppConfig {
    pub redis_url: String,
    pub redis_channel: String,
    pub scraper_name: String,
    pub parser_name: String,
    pub transport: ScraperTransport,
    pub max_backoff: Duration,
    pub min_backoff: Duration,
    pub ping_interval: Duration,
    pub read_timeout: Duration,
    pub chrome_major_version: u16,
    pub initial_target: ScraperTargetConfig,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ScraperTargetConfig {
    pub websocket_url: Option<String>,
    pub bootstrap_url: Option<String>,
    pub poll_url: Option<String>,
    pub proxy_url: Option<String>,
    pub is_active: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ScraperTransport {
    Websocket,
    Polling,
}

impl AppConfig {
    pub fn from_env() -> Result<Self> {
        let websocket_url = env::var("SCRAPER_WS_URL")
            .ok()
            .filter(|value| !value.trim().is_empty());
        let bootstrap_url = env::var("SCRAPER_BOOTSTRAP_URL")
            .ok()
            .filter(|value| !value.trim().is_empty())
            .or_else(|| {
                websocket_url
                    .as_ref()
                    .map(|value| derive_bootstrap_url(value))
            });
        let transport = match env::var("SCRAPER_TRANSPORT")
            .unwrap_or_else(|_| "websocket".to_string())
            .trim()
            .to_lowercase()
            .as_str()
        {
            "polling" => ScraperTransport::Polling,
            _ => ScraperTransport::Websocket,
        };
        let poll_url = env::var("SCRAPER_POLL_URL")
            .ok()
            .filter(|value| !value.trim().is_empty())
            .map(|value| {
                normalize_poll_url(
                    &value,
                    bootstrap_url.as_deref(),
                    transport,
                    env::var("SCRAPER_PARSER").ok().as_deref(),
                )
            });
        let proxy_url = env::var("SCRAPER_PROXY_URL")
            .ok()
            .filter(|value| !value.trim().is_empty());
        let is_active = env::var("SCRAPER_ACTIVE")
            .ok()
            .map(|value| matches!(value.as_str(), "1" | "true" | "TRUE"))
            .unwrap_or_else(|| match transport {
                ScraperTransport::Websocket => websocket_url.is_some(),
                ScraperTransport::Polling => poll_url.is_some(),
            });

        Ok(Self {
            redis_url: env::var("SCRAPER_REDIS_URL")
                .unwrap_or_else(|_| "redis://127.0.0.1:6379".to_string()),
            redis_channel: env::var("SCRAPER_REDIS_CHANNEL")
                .unwrap_or_else(|_| "odds_raw_stream".to_string()),
            scraper_name: env::var("SCRAPER_NAME")
                .unwrap_or_else(|_| "provider_a_worker".to_string()),
            parser_name: env::var("SCRAPER_PARSER").unwrap_or_else(|_| "generic_json".to_string()),
            transport,
            min_backoff: Duration::from_millis(
                env::var("SCRAPER_MIN_BACKOFF_MS")
                    .ok()
                    .and_then(|v| v.parse().ok())
                    .unwrap_or(500),
            ),
            max_backoff: Duration::from_millis(
                env::var("SCRAPER_MAX_BACKOFF_MS")
                    .ok()
                    .and_then(|v| v.parse().ok())
                    .unwrap_or(15_000),
            ),
            ping_interval: Duration::from_secs(
                env::var("SCRAPER_PING_INTERVAL_SEC")
                    .ok()
                    .and_then(|v| v.parse().ok())
                    .unwrap_or(15),
            ),
            read_timeout: Duration::from_secs(
                env::var("SCRAPER_READ_TIMEOUT_SEC")
                    .ok()
                    .and_then(|v| v.parse().ok())
                    .unwrap_or(30),
            ),
            chrome_major_version: env::var("SCRAPER_CHROME_MAJOR")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(135),
            initial_target: ScraperTargetConfig {
                websocket_url,
                bootstrap_url,
                poll_url,
                proxy_url,
                is_active,
            },
        })
    }
}

fn derive_bootstrap_url(websocket_url: &str) -> String {
    websocket_url
        .replace("wss://", "https://")
        .replace("ws://", "http://")
}

fn normalize_poll_url(
    raw_url: &str,
    bootstrap_url: Option<&str>,
    transport: ScraperTransport,
    parser_name: Option<&str>,
) -> String {
    if transport != ScraperTransport::Polling {
        return raw_url.to_string();
    }

    if parser_name != Some("one_x_bet") && parser_name != Some("1xbet") {
        return raw_url.to_string();
    }

    let trimmed = raw_url.trim();
    if trimmed.is_empty() {
        return trimmed.to_string();
    }

    let mut url = match url::Url::parse(trimmed) {
        Ok(url) => url,
        Err(_) => return trimmed.to_string(),
    };

    if url.path() == "/LiveFeed/GetSportsShortZip" {
        url.set_path("/service-api/LiveFeed/GetSportsShortZip");
    }

    let query_keys = url
        .query_pairs()
        .map(|(key, _)| key.to_string())
        .collect::<Vec<_>>();
    let mut pairs = url.query_pairs_mut();
    if !query_keys.iter().any(|key| key == "lng") {
        pairs.append_pair("lng", "en");
    }
    if !query_keys.iter().any(|key| key == "country") {
        pairs.append_pair("country", "141");
    }
    drop(pairs);

    if url.scheme() == "http" {
        let _ = url.set_scheme("https");
    }

    if url.host_str().is_none() {
        if let Some(base) = bootstrap_url.and_then(|value| url::Url::parse(value).ok()) {
            let _ = url.set_host(base.host_str());
            let _ = url.set_scheme(base.scheme());
        }
    }

    url.to_string()
}
