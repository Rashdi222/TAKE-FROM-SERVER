use std::{sync::Arc, time::Duration};

use anyhow::{Context, Result};
use futures_util::{SinkExt, StreamExt};
use rand::Rng;
use tokio::sync::{mpsc, watch};
use tokio_tungstenite::{Connector, connect_async_tls_with_config, tungstenite::protocol::Message};
use tracing::{debug, error, info, warn};

use crate::{
    browser::BrowserSession,
    config::{AppConfig, ScraperTargetConfig},
    parsers,
    redis_out::RedisPublisher,
};

enum LoopState {
    Reconnect,
    Reconfigured(ScraperTargetConfig),
}

pub async fn run(
    config: AppConfig,
    browser: BrowserSession,
    publisher: RedisPublisher,
    mut target_rx: watch::Receiver<ScraperTargetConfig>,
) -> Result<()> {
    let mut attempt: u32 = 0;
    let mut target = target_rx.borrow().clone();

    loop {
        if !target.is_active || target.websocket_url.is_none() {
            info!(
                source_name = %config.scraper_name,
                active = target.is_active,
                has_ws = target.websocket_url.is_some(),
                "scraper waiting for an active runtime configuration"
            );
            target_rx
                .changed()
                .await
                .context("scraper config watch channel closed")?;
            target = target_rx.borrow().clone();
            attempt = 0;
            continue;
        }

        if let Err(error_value) = browser.bootstrap(&target).await {
            error!(error = %error_value, "bootstrap failed before websocket connect");
        }

        match connect_once(&config, &browser, &publisher, &target, &mut target_rx).await {
            Ok(LoopState::Reconnect) => {
                warn!("websocket loop ended cleanly, reconnecting");
                attempt = 0;
            }
            Ok(LoopState::Reconfigured(next_target)) => {
                info!("scraper runtime configuration changed, reconnecting immediately");
                target = next_target;
                attempt = 0;
                continue;
            }
            Err(error_value) => {
                error!(error = %error_value, "websocket loop failed");
                attempt = attempt.saturating_add(1);
            }
        }

        let sleep_for = backoff_delay(config.min_backoff, config.max_backoff, attempt);
        warn!(
            backoff_ms = sleep_for.as_millis() as u64,
            attempt, "reconnecting websocket after backoff"
        );
        tokio::time::sleep(sleep_for).await;
    }
}

async fn connect_once(
    config: &AppConfig,
    browser: &BrowserSession,
    publisher: &RedisPublisher,
    target: &ScraperTargetConfig,
    target_rx: &mut watch::Receiver<ScraperTargetConfig>,
) -> Result<LoopState> {
    let websocket_url = target
        .websocket_url
        .as_ref()
        .ok_or_else(|| anyhow::anyhow!("websocket URL missing for active scraper"))?;
    let request = browser.websocket_request(websocket_url)?;
    let connector = Connector::Rustls(browser_rustls_connector());
    let (ws_stream, response) =
        connect_async_tls_with_config(request, None, false, Some(connector))
            .await
            .with_context(|| format!("failed websocket connect to {websocket_url}"))?;

    info!(status = ?response.status(), "websocket connected");

    let (mut writer, mut reader) = ws_stream.split();
    let (heartbeat_tx, mut heartbeat_rx) = mpsc::channel::<Message>(64);
    let ping_interval = config.ping_interval;
    let read_timeout = config.read_timeout;
    let parser = parsers::parser_for(config);

    tokio::spawn(async move {
        let mut ticker = tokio::time::interval(ping_interval);
        loop {
            ticker.tick().await;
            if heartbeat_tx
                .send(Message::Ping(Vec::new().into()))
                .await
                .is_err()
            {
                break;
            }
        }
    });

    loop {
        tokio::select! {
            Some(outgoing) = heartbeat_rx.recv() => {
                writer.send(outgoing).await.context("failed websocket heartbeat send")?;
            }
            _ = tokio::time::sleep(read_timeout) => {
                warn!(timeout_sec = read_timeout.as_secs(), "websocket read timeout reached, forcing reconnect");
                let _ = writer.send(Message::Close(None)).await;
                anyhow::bail!("websocket read timeout");
            }
            changed = target_rx.changed() => {
                changed.context("scraper config watch channel closed")?;
                let next_target = target_rx.borrow().clone();
                if next_target != *target {
                    let _ = writer.send(Message::Close(None)).await;
                    return Ok(LoopState::Reconfigured(next_target));
                }
            }
            maybe_message = reader.next() => {
                let message = match maybe_message {
                    Some(Ok(message)) => message,
                    Some(Err(error_value)) => return Err(error_value).context("websocket read failed"),
                    None => anyhow::bail!("websocket stream ended by peer"),
                };

                match message {
                    Message::Text(text) => {
                        debug!(bytes = text.len(), "received text frame");
                        publish_parsed_frame(&*parser, publisher, &text).await?;
                    }
                    Message::Binary(bytes) => {
                        if let Ok(text) = String::from_utf8(bytes.to_vec()) {
                            publish_parsed_frame(&*parser, publisher, &text).await?;
                        } else {
                            debug!("skipping non-utf8 binary frame");
                        }
                    }
                    Message::Ping(payload) => {
                        writer.send(Message::Pong(payload)).await.context("failed websocket pong send")?;
                    }
                    Message::Pong(_) => {
                        debug!("received pong from upstream websocket");
                    }
                    Message::Close(frame) => {
                        warn!(?frame, "websocket closed by upstream");
                        return Ok(LoopState::Reconnect);
                    }
                    Message::Frame(_) => {}
                }
            }
        }
    }
}

async fn publish_parsed_frame(
    parser: &dyn parsers::ExchangeParser,
    publisher: &RedisPublisher,
    raw_text: &str,
) -> Result<()> {
    let envelopes = match parser.parse_frame(raw_text) {
        Ok(envelopes) => envelopes,
        Err(error_value) => {
            warn!(error = %error_value, parser = parser.source_name(), "parser rejected frame");
            return Ok(());
        }
    };

    for envelope in envelopes {
        let serialized =
            serde_json::to_string(&envelope).context("failed to serialize parser envelope")?;
        publisher.publish(serialized).await?;
    }

    Ok(())
}

fn backoff_delay(min_backoff: Duration, max_backoff: Duration, attempt: u32) -> Duration {
    let exp = min_backoff.as_millis() as u64 * 2u64.saturating_pow(attempt.min(8));
    let capped = exp.min(max_backoff.as_millis() as u64);
    let jitter = rand::rng().random_range(0..=250_u64);
    Duration::from_millis(capped.saturating_add(jitter))
}

fn browser_rustls_connector() -> Arc<rustls::ClientConfig> {
    let mut roots = rustls::RootCertStore::empty();
    roots.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());

    let mut config = rustls::ClientConfig::builder()
        .with_root_certificates(roots)
        .with_no_client_auth();
    config.alpn_protocols = vec![b"h2".to_vec(), b"http/1.1".to_vec()];
    Arc::new(config)
}
