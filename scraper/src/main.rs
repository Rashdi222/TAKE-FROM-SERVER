mod browser;
mod config;
mod control;
mod normalize;
mod parsers;
mod polling;
mod redis_out;
mod ws;

use anyhow::Result;
use tokio::sync::{mpsc, watch};
use tracing_subscriber::EnvFilter;

use crate::{
    browser::BrowserSession,
    config::{AppConfig, ScraperTransport},
    redis_out::RedisPublisher,
};

#[tokio::main]
async fn main() -> Result<()> {
    let _ = rustls::crypto::aws_lc_rs::default_provider().install_default();

    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("info,scraper=debug")),
        )
        .with_target(false)
        .compact()
        .init();

    let config = AppConfig::from_env()?;
    let browser = BrowserSession::new(&config)?;
    let publisher =
        RedisPublisher::new(config.redis_url.clone(), config.redis_channel.clone()).await?;
    let (target_tx, target_rx) = watch::channel(config.initial_target.clone());
    let (action_tx, action_rx) = mpsc::unbounded_channel();

    if let Err(error_value) =
        control::load_initial_control(&config.redis_url, &config.scraper_name, &target_tx).await
    {
        tracing::warn!(error = %error_value, "failed to load cached scraper control configuration");
    }

    control::spawn_control_listener(
        config.redis_url.clone(),
        config.scraper_name.clone(),
        target_tx,
    );
    control::spawn_action_listener(
        config.redis_url.clone(),
        config.scraper_name.clone(),
        action_tx,
    );

    match config.transport {
        ScraperTransport::Websocket => ws::run(config, browser, publisher, target_rx).await,
        ScraperTransport::Polling => polling::run(config, browser, publisher, target_rx, action_rx).await,
    }
}
