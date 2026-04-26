use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Envelope {
    pub source: String,
    pub stream: &'static str,
    pub observed_at_ms: u64,
    pub message_type: MessageType,
    pub payload: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MessageType {
    TextFrame,
    JsonFrame,
    SelectionUpdate,
}

impl Envelope {
    pub fn new(source: impl Into<String>, message_type: MessageType, payload: Value) -> Self {
        Self {
            source: source.into(),
            stream: "odds_raw_stream",
            observed_at_ms: now_ms(),
            message_type,
            payload,
        }
    }
}

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}
