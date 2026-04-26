pub mod common;
pub mod generic_json;
pub mod one_x_bet;

use anyhow::Result;
use serde_json::Value;

use crate::{config::AppConfig, normalize::Envelope};

pub trait ExchangeParser: Send + Sync {
    fn source_name(&self) -> &'static str;
    fn supports_message(&self, value: &Value) -> bool;
    fn parse_frame(&self, raw_text: &str) -> Result<Vec<Envelope>>;
}

pub fn parser_for(config: &AppConfig) -> Box<dyn ExchangeParser> {
    match config.parser_name.as_str() {
        "one_x_bet" | "1xbet" => {
            Box::new(one_x_bet::OneXBetParser::new(config.scraper_name.clone()))
        }
        _ => Box::new(generic_json::GenericJsonParser::new(
            config.scraper_name.clone(),
        )),
    }
}
