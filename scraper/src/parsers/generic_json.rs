use anyhow::{Context, Result};
use serde_json::Value;

use crate::normalize::{Envelope, MessageType};

use super::{
    ExchangeParser,
    common::{number_field_as_u64, string_field},
};

pub struct GenericJsonParser {
    scraper_name: String,
}

impl GenericJsonParser {
    pub fn new(scraper_name: String) -> Self {
        Self { scraper_name }
    }
}

impl ExchangeParser for GenericJsonParser {
    fn source_name(&self) -> &'static str {
        "generic_json"
    }

    fn supports_message(&self, value: &Value) -> bool {
        value.is_object() || value.is_array()
    }

    fn parse_frame(&self, raw_text: &str) -> Result<Vec<Envelope>> {
        let payload = serde_json::from_str::<Value>(raw_text)
            .context("generic parser expected valid json")?;
        let message_type = if payload.is_object() || payload.is_array() {
            MessageType::JsonFrame
        } else {
            MessageType::TextFrame
        };

        let source_match_id = string_field(payload.get("source_match_id"))
            .or_else(|| string_field(payload.get("match_id")))
            .or_else(|| string_field(payload.get("fixture_id")))
            .or_else(|| string_field(payload.get("event_id")));

        let normalized_payload = match payload {
            Value::Object(mut object) => {
                if let Some(match_id) = source_match_id {
                    object.insert("source_match_id".to_string(), Value::String(match_id));
                }

                if !object.contains_key("observed_at_ms") {
                    if let Some(value) = number_field_as_u64(object.get("source_event_time_ms")) {
                        object.insert("observed_at_ms".to_string(), Value::from(value));
                    }
                }

                Value::Object(object)
            }
            other => other,
        };

        Ok(vec![Envelope::new(
            self.scraper_name.clone(),
            message_type,
            normalized_payload,
        )])
    }
}
