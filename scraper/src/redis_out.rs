use anyhow::{Context, Result};
use redis::AsyncCommands;
use tokio::sync::mpsc;
use tracing::{error, info};

#[derive(Debug, Clone)]
pub struct RedisPublisher {
    tx: mpsc::Sender<String>,
}

impl RedisPublisher {
    pub async fn new(redis_url: String, channel: String) -> Result<Self> {
        let (tx, mut rx) = mpsc::channel::<String>(4096);
        let client = redis::Client::open(redis_url.clone())
            .with_context(|| format!("failed to create Redis client for {redis_url}"))?;

        tokio::spawn(async move {
            loop {
                let mut connection = match client.get_multiplexed_async_connection().await {
                    Ok(connection) => {
                        info!(%channel, "connected Redis publisher");
                        connection
                    }
                    Err(error_value) => {
                        error!(error = %error_value, "failed to connect Redis publisher");
                        tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                        continue;
                    }
                };

                while let Some(payload) = rx.recv().await {
                    let publish_result: redis::RedisResult<usize> =
                        connection.publish(channel.as_str(), payload).await;
                    if let Err(error_value) = publish_result {
                        error!(error = %error_value, "Redis publish failed, reconnecting publisher");
                        break;
                    }
                }
            }
        });

        Ok(Self { tx })
    }

    pub async fn publish(&self, payload: String) -> Result<()> {
        self.tx
            .send(payload)
            .await
            .context("Redis publisher channel closed")
    }
}
