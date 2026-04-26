use anyhow::{Context, Result};
use futures_util::StreamExt;
use redis::AsyncCommands;
use serde::Deserialize;
use tokio::sync::{mpsc, watch};
use tracing::{error, info, warn};

use crate::config::ScraperTargetConfig;

const CONTROL_CHANNEL: &str = "control:scrapers";
const CONTROL_KEY_PREFIX: &str = "control:scrapers:last:";
const ACTION_CHANNEL: &str = "control:scraper-actions";

#[derive(Debug, Clone, Deserialize)]
struct ControlMessage {
    source_name: String,
    bootstrap_url: Option<String>,
    ws_url: Option<String>,
    poll_url: Option<String>,
    proxy_url: Option<String>,
    is_active: bool,
    #[serde(default)]
    deleted: bool,
}

#[derive(Debug, Clone, Deserialize)]
struct ActionMessage {
    source_name: String,
    action: String,
    match_id: Option<String>,
    source_match_id: Option<String>,
}

#[derive(Debug, Clone)]
pub enum RuntimeAction {
    FetchMatchOnce { match_id: Option<String>, source_match_id: String },
}

pub async fn load_initial_control(
    redis_url: &str,
    source_name: &str,
    tx: &watch::Sender<ScraperTargetConfig>,
) -> Result<bool> {
    let client = redis::Client::open(redis_url)
        .with_context(|| format!("failed to create Redis client for {redis_url}"))?;
    let mut connection = client
        .get_multiplexed_async_connection()
        .await
        .context("failed to connect Redis for initial scraper control")?;

    let cache_key = format!("{CONTROL_KEY_PREFIX}{source_name}");
    let payload: Option<String> = connection
        .get(cache_key.as_str())
        .await
        .with_context(|| format!("failed to fetch cached scraper control from {cache_key}"))?;

    if let Some(payload) = payload {
        if let Some(next_config) = parse_control_payload(&payload, source_name) {
            let _ = tx.send(next_config.clone());
            info!(
                source_name,
                active = next_config.is_active,
                has_ws = next_config.websocket_url.is_some(),
                has_poll = next_config.poll_url.is_some(),
                "loaded cached scraper control configuration"
            );
            return Ok(true);
        }
    }

    Ok(false)
}

pub fn spawn_control_listener(
    redis_url: String,
    source_name: String,
    tx: watch::Sender<ScraperTargetConfig>,
) {
    tokio::spawn(async move {
        loop {
            if let Err(error_value) = listen_once(&redis_url, &source_name, &tx).await {
                error!(error = %error_value, "scraper control listener failed");
                tokio::time::sleep(std::time::Duration::from_secs(2)).await;
            }
        }
    });
}

pub fn spawn_action_listener(
    redis_url: String,
    source_name: String,
    tx: mpsc::UnboundedSender<RuntimeAction>,
) {
    tokio::spawn(async move {
        loop {
            if let Err(error_value) = listen_for_actions_once(&redis_url, &source_name, &tx).await {
                error!(error = %error_value, "scraper action listener failed");
                tokio::time::sleep(std::time::Duration::from_secs(2)).await;
            }
        }
    });
}

async fn listen_once(
    redis_url: &str,
    source_name: &str,
    tx: &watch::Sender<ScraperTargetConfig>,
) -> Result<()> {
    let client = redis::Client::open(redis_url)
        .with_context(|| format!("failed to create Redis client for {redis_url}"))?;
    let mut pubsub = client
        .get_async_pubsub()
        .await
        .context("failed to connect Redis pubsub for scraper controls")?;

    pubsub
        .subscribe(CONTROL_CHANNEL)
        .await
        .with_context(|| format!("failed to subscribe to {CONTROL_CHANNEL}"))?;

    info!(
        channel = CONTROL_CHANNEL,
        source_name, "scraper control listener subscribed"
    );

    let _ = load_initial_control(redis_url, source_name, tx).await;

    loop {
        let message = pubsub
            .on_message()
            .next()
            .await
            .ok_or_else(|| anyhow::anyhow!("scraper control pubsub stream ended"))?;

        let payload: String = message
            .get_payload()
            .context("failed to decode scraper control payload")?;

        if let Some(next_config) = parse_control_payload(&payload, source_name) {
            let _ = tx.send(next_config.clone());
            info!(
                source_name,
                active = next_config.is_active,
                has_ws = next_config.websocket_url.is_some(),
                has_poll = next_config.poll_url.is_some(),
                "applied scraper control update"
            );
        }
    }
}

async fn listen_for_actions_once(
    redis_url: &str,
    source_name: &str,
    tx: &mpsc::UnboundedSender<RuntimeAction>,
) -> Result<()> {
    let client = redis::Client::open(redis_url)
        .with_context(|| format!("failed to create Redis client for {redis_url}"))?;
    let mut pubsub = client
        .get_async_pubsub()
        .await
        .context("failed to connect Redis pubsub for scraper actions")?;

    pubsub
        .subscribe(ACTION_CHANNEL)
        .await
        .with_context(|| format!("failed to subscribe to {ACTION_CHANNEL}"))?;

    info!(channel = ACTION_CHANNEL, source_name, "scraper action listener subscribed");

    loop {
        let message = pubsub
            .on_message()
            .next()
            .await
            .ok_or_else(|| anyhow::anyhow!("scraper action pubsub stream ended"))?;

        let payload: String = message
            .get_payload()
            .context("failed to decode scraper action payload")?;

        if let Some(action) = parse_action_payload(&payload, source_name) {
            let _ = tx.send(action);
        }
    }
}

fn parse_control_payload(payload: &str, source_name: &str) -> Option<ScraperTargetConfig> {
    match serde_json::from_str::<ControlMessage>(payload) {
        Ok(control) if control.source_name == source_name => Some(ScraperTargetConfig {
            websocket_url: trim_to_option(control.ws_url),
            bootstrap_url: trim_to_option(control.bootstrap_url),
            poll_url: trim_to_option(control.poll_url),
            proxy_url: trim_to_option(control.proxy_url),
            is_active: control.is_active && !control.deleted,
        }),
        Ok(_) => None,
        Err(error_value) => {
            warn!(error = %error_value, "dropped malformed scraper control payload");
            None
        }
    }
}

fn trim_to_option(value: Option<String>) -> Option<String> {
    value.and_then(|value| {
        let trimmed = value.trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    })
}

fn parse_action_payload(payload: &str, source_name: &str) -> Option<RuntimeAction> {
    match serde_json::from_str::<ActionMessage>(payload) {
        Ok(action)
            if action.source_name == source_name && action.action == "fetch_match_once" =>
        {
            trim_to_option(action.source_match_id)
                .map(|source_match_id| RuntimeAction::FetchMatchOnce {
                    match_id: trim_to_option(action.match_id),
                    source_match_id,
                })
        }
        Ok(_) => None,
        Err(error_value) => {
            warn!(error = %error_value, "dropped malformed scraper action payload");
            None
        }
    }
}
