use std::sync::{Arc, Mutex};

use anyhow::{Context, Result, anyhow};
use reqwest::{Client, StatusCode, header};
use reqwest_cookie_store::{CookieStore, CookieStoreMutex};
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tracing::info;

use crate::config::{AppConfig, ScraperTargetConfig};

#[derive(Clone)]
pub struct BrowserSession {
    state: Arc<Mutex<BrowserSessionState>>,
    user_agent: String,
    read_timeout: std::time::Duration,
}

struct BrowserSessionState {
    client: Client,
    cookie_store: Arc<CookieStoreMutex>,
    proxy_url: Option<String>,
}

pub struct PollResponse {
    pub status: StatusCode,
    pub content_type: Option<String>,
    pub body: String,
}

impl BrowserSession {
    pub fn new(config: &AppConfig) -> Result<Self> {
        let user_agent = chrome_user_agent(config.chrome_major_version);
        let state = build_state(
            &user_agent,
            config.initial_target.proxy_url.as_deref(),
            config.read_timeout,
        )?;

        Ok(Self {
            state: Arc::new(Mutex::new(state)),
            user_agent,
            read_timeout: config.read_timeout,
        })
    }

    pub async fn bootstrap(&self, target: &ScraperTargetConfig) -> Result<()> {
        let bootstrap_url = target
            .bootstrap_url
            .as_ref()
            .ok_or_else(|| anyhow!("bootstrap URL is missing for this scraper target"))?;

        let client = self.client_for_target(target)?;
        let response = client
            .get(bootstrap_url)
            .send()
            .await
            .with_context(|| format!("bootstrap request failed for {bootstrap_url}"))?;

        let status = response.status();
        if !status.is_success() {
            anyhow::bail!("bootstrap request returned non-success for {bootstrap_url}: {status}");
        }

        info!(bootstrap_url = %bootstrap_url, status = %status, "bootstrap session established");
        Ok(())
    }

    pub fn clear_session(&self, target: &ScraperTargetConfig) -> Result<()> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| anyhow!("browser session mutex poisoned"))?;
        *state = build_state(&self.user_agent, target.proxy_url.as_deref(), self.read_timeout)?;
        Ok(())
    }

    pub fn websocket_request(&self, websocket_url: &str) -> Result<http::Request<()>> {
        let mut request = websocket_url.into_client_request().with_context(|| {
            format!("failed to construct websocket request for {websocket_url}")
        })?;

        let headers = request.headers_mut();
        headers.insert(
            header::USER_AGENT,
            header::HeaderValue::from_str(&self.user_agent)?,
        );
        headers.insert(
            header::ACCEPT_LANGUAGE,
            header::HeaderValue::from_static("en-US,en;q=0.9"),
        );
        headers.insert(
            header::CACHE_CONTROL,
            header::HeaderValue::from_static("no-cache"),
        );
        headers.insert(header::PRAGMA, header::HeaderValue::from_static("no-cache"));
        headers.insert(
            header::HeaderName::from_static("origin"),
            header::HeaderValue::from_str(&origin_for_ws(websocket_url))?,
        );
        headers.insert(
            header::HeaderName::from_static("sec-ch-ua"),
            header::HeaderValue::from_static(
                "\"Google Chrome\";v=\"135\", \"Chromium\";v=\"135\", \"Not.A/Brand\";v=\"24\"",
            ),
        );
        headers.insert(
            header::HeaderName::from_static("sec-ch-ua-mobile"),
            header::HeaderValue::from_static("?0"),
        );
        headers.insert(
            header::HeaderName::from_static("sec-ch-ua-platform"),
            header::HeaderValue::from_static("\"Windows\""),
        );
        headers.insert(
            header::HeaderName::from_static("sec-fetch-site"),
            header::HeaderValue::from_static("same-site"),
        );
        headers.insert(
            header::HeaderName::from_static("sec-fetch-mode"),
            header::HeaderValue::from_static("websocket"),
        );
        headers.insert(
            header::HeaderName::from_static("sec-fetch-dest"),
            header::HeaderValue::from_static("empty"),
        );

        if let Some(cookie_value) = self.cookie_header_for(websocket_url)? {
            headers.insert(
                header::COOKIE,
                header::HeaderValue::from_str(&cookie_value)?,
            );
        }

        Ok(request)
    }

    pub async fn poll(&self, target: &ScraperTargetConfig, poll_url: &str) -> Result<PollResponse> {
        let client = self.client_for_target(target)?;
        let mut request = client.get(poll_url);
        request = request.header(header::ACCEPT, "application/json, text/plain, */*");

        if is_one_x_bet_api_url(poll_url) {
            request = request
                .header(header::CONTENT_TYPE, "application/json")
                .header(header::HeaderName::from_static("x-requested-with"), "XMLHttpRequest")
                .header(header::HeaderName::from_static("x-app-n"), "__BETTING_APP__")
                .header(header::HeaderName::from_static("x-svc-source"), "__BETTING_APP__")
                .header(header::HeaderName::from_static("x-mobile-project-id"), "0")
                .header(header::HeaderName::from_static("is-srv"), "false");

            if let Some(referer) = target.bootstrap_url.as_deref() {
                request = request.header(header::REFERER, referer);
            }
        }

        let response = request
            .send()
            .await
            .with_context(|| format!("poll request failed for {poll_url}"))?;

        let status = response.status();
        let content_type = response
            .headers()
            .get(header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .map(|value| value.to_string());
        let body = response
            .text()
            .await
            .context("failed to read polling response body")?;

        Ok(PollResponse {
            status,
            content_type,
            body,
        })
    }

    fn client_for_target(&self, target: &ScraperTargetConfig) -> Result<Client> {
        let desired_proxy = normalize_proxy(target.proxy_url.as_deref());
        let mut state = self
            .state
            .lock()
            .map_err(|_| anyhow!("browser session mutex poisoned"))?;
        if state.proxy_url != desired_proxy {
            *state = build_state(&self.user_agent, desired_proxy.as_deref(), self.read_timeout)?;
        }
        Ok(state.client.clone())
    }

    fn cookie_header_for(&self, websocket_url: &str) -> Result<Option<String>> {
        let url = url::Url::parse(websocket_url)
            .or_else(|_| url::Url::parse(&origin_for_ws(websocket_url)))
            .with_context(|| {
                format!("failed to parse websocket URL for cookie resolution: {websocket_url}")
            })?;

        let state = self
            .state
            .lock()
            .map_err(|_| anyhow!("browser session mutex poisoned"))?;
        let store = state
            .cookie_store
            .lock()
            .map_err(|_| anyhow!("cookie store mutex poisoned"))?;

        let pairs = store
            .get_request_values(&url)
            .map(|(name, value)| format!("{}={}", name, value))
            .collect::<Vec<_>>();

        if pairs.is_empty() {
            Ok(None)
        } else {
            Ok(Some(pairs.join("; ")))
        }
    }
}

fn build_state(
    user_agent: &str,
    proxy_url: Option<&str>,
    read_timeout: std::time::Duration,
) -> Result<BrowserSessionState> {
    let cookie_store = Arc::new(CookieStoreMutex::new(CookieStore::default()));
    let default_headers = default_headers(user_agent)?;

    let mut builder = Client::builder()
        .cookie_provider(cookie_store.clone())
        .default_headers(default_headers)
        .connect_timeout(read_timeout)
        .timeout(read_timeout)
        .http2_adaptive_window(true)
        .http2_keep_alive_interval(Some(std::time::Duration::from_secs(20)))
        .tcp_keepalive(Some(std::time::Duration::from_secs(30)))
        .pool_idle_timeout(Some(std::time::Duration::from_secs(90)));

    if let Some(proxy_url) = normalize_proxy(proxy_url) {
        builder = builder.proxy(
            reqwest::Proxy::all(&proxy_url)
                .with_context(|| format!("invalid proxy URL: {proxy_url}"))?,
        );
    }

    let client = builder
        .build()
        .context("failed to build browser session client")?;

    Ok(BrowserSessionState {
        client,
        cookie_store,
        proxy_url: normalize_proxy(proxy_url),
    })
}

fn normalize_proxy(value: Option<&str>) -> Option<String> {
    value.and_then(|value| {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

fn default_headers(user_agent: &str) -> Result<header::HeaderMap> {
    let mut headers = header::HeaderMap::new();
    headers.insert(
        header::ACCEPT,
        header::HeaderValue::from_static(
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        ),
    );
    headers.insert(
        header::ACCEPT_ENCODING,
        header::HeaderValue::from_static("gzip, deflate, br"),
    );
    headers.insert(
        header::ACCEPT_LANGUAGE,
        header::HeaderValue::from_static("en-US,en;q=0.9"),
    );
    headers.insert(
        header::UPGRADE_INSECURE_REQUESTS,
        header::HeaderValue::from_static("1"),
    );
    headers.insert(
        header::USER_AGENT,
        header::HeaderValue::from_str(user_agent)?,
    );
    Ok(headers)
}

fn chrome_user_agent(chrome_major_version: u16) -> String {
    format!(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{0}.0.0.0 Safari/537.36",
        chrome_major_version
    )
}

fn origin_for_ws(websocket_url: &str) -> String {
    websocket_url
        .replace("wss://", "https://")
        .replace("ws://", "http://")
        .split('/')
        .take(3)
        .collect::<Vec<_>>()
        .join("/")
}

fn is_one_x_bet_api_url(url: &str) -> bool {
    url.contains("1x-bet") && url.contains("/service-api/")
}
