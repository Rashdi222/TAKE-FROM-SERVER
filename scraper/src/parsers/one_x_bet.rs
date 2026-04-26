use anyhow::{Context, Result};
use serde::Deserialize;
use serde_json::{Map, Value, json};
use tracing::warn;

use crate::normalize::{Envelope, MessageType, now_ms};

use super::{
    ExchangeParser,
    common::{array_field, number_field_as_f64, number_field_as_u64, object_field, string_field},
};

#[derive(Debug, Clone, Deserialize)]
struct OneXBetMarketRow {
    #[serde(default, alias = "id", alias = "market_id")]
    id: Option<Value>,
    #[serde(default, alias = "key", alias = "group_key")]
    key: Option<String>,
    #[serde(default, alias = "name", alias = "market_name")]
    name: Option<String>,
    #[serde(default, alias = "status", alias = "state")]
    status: Option<String>,
    #[serde(default, alias = "selections", alias = "outcomes", alias = "bets")]
    selections: Vec<Value>,
}

#[derive(Debug, Clone, Deserialize)]
struct OneXBetSelectionRow {
    #[serde(default, alias = "id", alias = "selection_id")]
    id: Option<Value>,
    #[serde(default, alias = "key", alias = "label")]
    key: Option<String>,
    #[serde(default, alias = "name", alias = "outcome")]
    name: Option<String>,
    #[serde(default, alias = "status", alias = "state")]
    status: Option<String>,
    #[serde(default, alias = "price", alias = "odds", alias = "value")]
    price: Option<Value>,
}

pub struct OneXBetParser {
    scraper_name: String,
}

impl OneXBetParser {
    pub fn new(scraper_name: String) -> Self {
        Self { scraper_name }
    }

    fn parse_match_id(root: &Value) -> Option<String> {
        string_field(root.get("source_match_id"))
            .or_else(|| string_field(root.get("match_id")))
            .or_else(|| string_field(root.get("event_id")))
            .or_else(|| object_field(root, "match").and_then(|m| string_field(m.get("id"))))
            .or_else(|| object_field(root, "event").and_then(|m| string_field(m.get("id"))))
    }

    fn parse_market_rows(root: &Value) -> Vec<Value> {
        if let Some(rows) = array_field(root, "markets") {
            return rows.clone();
        }

        if let Some(rows) = array_field(root, "bets") {
            return rows.clone();
        }

        if let Some(rows) = object_field(root, "event")
            .and_then(|event| event.get("markets"))
            .and_then(Value::as_array)
        {
            return rows.clone();
        }

        Vec::new()
    }

    fn normalize_market_key(row: &OneXBetMarketRow) -> Option<String> {
        row.key
            .as_ref()
            .map(|value| value.trim().to_owned())
            .filter(|value| !value.is_empty())
            .or_else(|| {
                row.name
                    .as_ref()
                    .map(|value| value.trim().to_lowercase().replace(' ', "_"))
            })
            .or_else(|| {
                row.id
                    .as_ref()
                    .and_then(|value| string_field(Some(value)))
                    .map(|value| format!("market_{value}"))
            })
    }

    fn normalize_selection_key(row: &OneXBetSelectionRow) -> Option<String> {
        row.key
            .as_ref()
            .map(|value| value.trim().to_owned())
            .filter(|value| !value.is_empty())
            .or_else(|| {
                row.name
                    .as_ref()
                    .map(|value| value.trim().to_lowercase().replace(' ', "_"))
            })
            .or_else(|| {
                row.id
                    .as_ref()
                    .and_then(|value| string_field(Some(value)))
                    .map(|value| format!("selection_{value}"))
            })
    }

    fn normalize_status(
        selection_status: Option<&str>,
        market_status: Option<&str>,
    ) -> &'static str {
        let normalized = selection_status
            .or(market_status)
            .unwrap_or_default()
            .trim()
            .to_lowercase();

        match normalized.as_str() {
            "suspended" | "pause" | "paused" | "blocked" => "suspended",
            "closed" | "stopped" | "finished" | "settled" => "closed",
            _ => "active",
        }
    }

    fn parse_sports_short_rows(&self, root: &Value) -> Option<Vec<Envelope>> {
        let value_rows = root.get("Value")?.as_array()?;
        if value_rows.is_empty() {
            return Some(Vec::new());
        }

        Some(Vec::new())
    }

    fn parse_game_zip(&self, root: &Value) -> Option<Vec<Envelope>> {
        let value = root.get("Value")?.as_object()?;
        let source_match_id = string_field(value.get("I"))?;
        let home_team_name = string_field(value.get("O1"))?;
        let away_team_name = string_field(value.get("O2"))?;
        let sport_name = string_field(value.get("SN"))
            .or_else(|| string_field(value.get("SE")))
            .unwrap_or_else(|| "Cricket".to_string());

        if !sport_name.eq_ignore_ascii_case("cricket") {
            return Some(Vec::new());
        }

        let competition_name = string_field(value.get("L"))
            .or_else(|| string_field(value.get("LE")))
            .or_else(|| string_field(value.get("LR")));
        let start_time_ms = number_field_as_u64(value.get("S"))
            .map(|seconds| seconds.saturating_mul(1000))
            .unwrap_or_else(now_ms);

        let mut base_payload = Map::new();
        base_payload.insert(
            "source_match_id".to_string(),
            Value::String(source_match_id.clone()),
        );
        base_payload.insert("sport".to_string(), Value::String("cricket".to_string()));
        base_payload.insert(
            "competition_name".to_string(),
            competition_name
                .clone()
                .map(Value::String)
                .unwrap_or(Value::Null),
        );
        base_payload.insert("start_time_ms".to_string(), json!(start_time_ms));
        base_payload.insert("home_team_name".to_string(), Value::String(home_team_name));
        base_payload.insert("away_team_name".to_string(), Value::String(away_team_name));

        if let Some(home_team_id) = string_field(value.get("O1I")) {
            base_payload.insert("home_team_id".to_string(), Value::String(home_team_id));
        }
        if let Some(away_team_id) = string_field(value.get("O2I")) {
            base_payload.insert("away_team_id".to_string(), Value::String(away_team_id));
        }
        if let Some(competition_id) = string_field(value.get("LI")) {
            base_payload.insert("competition_id".to_string(), Value::String(competition_id));
        }
        if let Some(scoreboard) = value.get("SC") {
            base_payload.insert("scoreboard".to_string(), scoreboard.clone());
        }
        base_payload.insert("raw_match".to_string(), Value::Object(value.clone()));

        let mut envelopes = Vec::new();

        if let Some(groups) = value.get("GE").and_then(Value::as_array) {
            envelopes.extend(self.parse_game_zip_groups(&base_payload, groups, None));
        }

        if let Some(subgames) = value.get("SG").and_then(Value::as_array) {
            for subgame in subgames {
                let Some(subgame_obj) = subgame.as_object() else {
                    warn!(source_match_id = %source_match_id, "1xBet parser dropped malformed subgame row");
                    continue;
                };

                let subgame_scope = json!({
                    "subgame_id": string_field(subgame_obj.get("I")),
                    "subgame_group": string_field(subgame_obj.get("TG")),
                    "subgame_title_id": string_field(subgame_obj.get("TI")),
                    "parent_match_id": string_field(subgame_obj.get("MG"))
                });

                if let Some(groups) = subgame_obj.get("GE").and_then(Value::as_array) {
                    envelopes.extend(self.parse_game_zip_groups(
                        &base_payload,
                        groups,
                        Some((&subgame_scope, subgame)),
                    ));
                }
            }
        }

        Some(envelopes)
    }

    fn parse_game_zip_groups(
        &self,
        base_payload: &Map<String, Value>,
        groups: &[Value],
        scope: Option<(&Value, &Value)>,
    ) -> Vec<Envelope> {
        let source_match_id = base_payload
            .get("source_match_id")
            .and_then(Value::as_str)
            .unwrap_or("unknown");
        let mut envelopes = Vec::new();

        for market_value in groups {
            let Some(market) = market_value.as_object() else {
                warn!(source_match_id = %source_match_id, "1xBet parser dropped non-object market group");
                continue;
            };

            let market_g = string_field(market.get("G"));
            let market_gs = string_field(market.get("GS"));
            let market_key =
                Self::build_market_key(market_g.as_deref(), market_gs.as_deref(), scope);
            let market_name =
                Self::build_market_name(market_g.as_deref(), market_gs.as_deref(), scope);
            let Some(selection_lanes) = market.get("E").and_then(Value::as_array) else {
                continue;
            };

            for (lane_index, lane) in selection_lanes.iter().enumerate() {
                let Some(selections) = lane.as_array() else {
                    warn!(source_match_id = %source_match_id, market_key = %market_key, "1xBet parser dropped malformed selection lane");
                    continue;
                };

                for selection_value in selections {
                    let Some(selection) = selection_value.as_object() else {
                        warn!(source_match_id = %source_match_id, market_key = %market_key, "1xBet parser dropped non-object selection row");
                        continue;
                    };

                    let Some(price) = number_field_as_f64(selection.get("C"))
                        .or_else(|| number_field_as_f64(selection.get("CV")))
                    else {
                        warn!(source_match_id = %source_match_id, market_key = %market_key, "1xBet parser dropped selection without price");
                        continue;
                    };

                    let selection_key = Self::build_selection_key(selection, lane_index, scope);
                    let selection_name =
                        Self::build_selection_name(selection, lane_index, &selection_key);
                    let status = if selection.get("B").and_then(Value::as_bool) == Some(false) {
                        "suspended"
                    } else {
                        "active"
                    };

                    let mut payload = base_payload.clone();
                    payload.insert("market_key".to_string(), Value::String(market_key.clone()));
                    payload.insert(
                        "market_name".to_string(),
                        Value::String(market_name.clone()),
                    );
                    payload.insert(
                        "market_status".to_string(),
                        Value::String(status.to_string()),
                    );
                    payload.insert(
                        "selection_key".to_string(),
                        Value::String(selection_key.clone()),
                    );
                    payload.insert("selection_name".to_string(), Value::String(selection_name));
                    payload.insert("status".to_string(), Value::String(status.to_string()));
                    payload.insert("price".to_string(), json!(price));
                    payload.insert("source_event_time_ms".to_string(), json!(now_ms()));
                    payload.insert("raw_market".to_string(), market_value.clone());
                    payload.insert("raw_selection".to_string(), selection_value.clone());

                    if let Some((subgame_scope, subgame_value)) = scope {
                        payload.insert("market_scope".to_string(), subgame_scope.clone());
                        payload.insert("raw_subgame".to_string(), subgame_value.clone());
                    }

                    envelopes.push(Envelope::new(
                        self.scraper_name.clone(),
                        MessageType::SelectionUpdate,
                        Value::Object(payload),
                    ));
                }
            }
        }

        envelopes
    }

    fn build_market_key(
        market_g: Option<&str>,
        market_gs: Option<&str>,
        scope: Option<(&Value, &Value)>,
    ) -> String {
        let mut parts = Vec::new();
        if let Some((subgame_scope, _)) = scope {
            if let Some(subgame_id) = string_field(subgame_scope.get("subgame_id")) {
                parts.push(format!("sg_{subgame_id}"));
            }
        }
        if let Some(value) = market_g {
            parts.push(format!("g_{value}"));
        }
        if let Some(value) = market_gs {
            parts.push(format!("gs_{value}"));
        }
        if parts.is_empty() {
            "market_unknown".to_string()
        } else {
            parts.join("_")
        }
    }

    fn build_market_name(
        market_g: Option<&str>,
        market_gs: Option<&str>,
        scope: Option<(&Value, &Value)>,
    ) -> String {
        let mut parts = Vec::new();
        if let Some((subgame_scope, _)) = scope {
            if let Some(group) = string_field(subgame_scope.get("subgame_group")) {
                parts.push(group);
            }
        }

        match (market_g, market_gs) {
            (Some(g), Some(gs)) => parts.push(format!("1xBet market {g}/{gs}")),
            (Some(g), None) => parts.push(format!("1xBet market {g}")),
            (None, Some(gs)) => parts.push(format!("1xBet market gs {gs}")),
            (None, None) => parts.push("1xBet market".to_string()),
        }

        parts.join(" - ")
    }

    fn build_selection_key(
        selection: &Map<String, Value>,
        lane_index: usize,
        scope: Option<(&Value, &Value)>,
    ) -> String {
        let mut parts = Vec::new();
        if let Some((subgame_scope, _)) = scope {
            if let Some(subgame_id) = string_field(subgame_scope.get("subgame_id")) {
                parts.push(format!("sg_{subgame_id}"));
            }
        }
        if let Some(t) = string_field(selection.get("T")) {
            parts.push(format!("t_{t}"));
        } else {
            parts.push(format!("lane_{}", lane_index + 1));
        }
        if let Some(price_line) = number_field_as_f64(selection.get("P")) {
            parts.push(format!(
                "p_{}",
                Self::normalize_decimal_component(price_line)
            ));
        }
        if let Some(player_name) = selection
            .get("PL")
            .and_then(Value::as_object)
            .and_then(|player| string_field(player.get("N")))
        {
            parts.push(format!("pl_{}", Self::slug(&player_name)));
        }
        parts.join("_")
    }

    fn build_selection_name(
        selection: &Map<String, Value>,
        lane_index: usize,
        selection_key: &str,
    ) -> String {
        if let Some(player_name) = selection
            .get("PL")
            .and_then(Value::as_object)
            .and_then(|player| string_field(player.get("N")))
        {
            return player_name;
        }

        if let Some(t) = string_field(selection.get("T")) {
            let base = match (t.as_str(), lane_index) {
                ("1", 0) => Some("home"),
                ("2", 1) => Some("draw"),
                ("3", 2) => Some("away"),
                ("13", 0) | ("14", 1) => Some("line"),
                _ => None,
            };

            if let Some(price_line) = number_field_as_f64(selection.get("P")) {
                if let Some(base) = base {
                    return format!("{base} {}", Self::display_decimal(price_line));
                }
            }

            if let Some(base) = base {
                return base.to_string();
            }

            return format!("selection {t}");
        }

        selection_key.to_string()
    }

    fn slug(value: &str) -> String {
        value
            .trim()
            .to_lowercase()
            .chars()
            .map(|char| {
                if char.is_ascii_alphanumeric() {
                    char
                } else {
                    '_'
                }
            })
            .collect::<String>()
            .trim_matches('_')
            .to_string()
    }

    fn normalize_decimal_component(value: f64) -> String {
        Self::display_decimal(value).replace('.', "_")
    }

    fn display_decimal(value: f64) -> String {
        let mut rendered = format!("{value:.6}");
        while rendered.contains('.') && rendered.ends_with('0') {
            rendered.pop();
        }
        if rendered.ends_with('.') {
            rendered.pop();
        }
        rendered
    }
}

impl ExchangeParser for OneXBetParser {
    fn source_name(&self) -> &'static str {
        "one_x_bet"
    }

    fn supports_message(&self, value: &Value) -> bool {
        if value.get("Value").is_some() && value.get("Success").is_some() {
            return true;
        }

        value.get("event_id").is_some()
            || value.get("match_id").is_some()
            || value.get("markets").is_some()
            || value.get("bets").is_some()
            || object_field(value, "event").is_some()
    }

    fn parse_frame(&self, raw_text: &str) -> Result<Vec<Envelope>> {
        let root =
            serde_json::from_str::<Value>(raw_text).context("1xBet parser expected valid json")?;

        if !self.supports_message(&root) {
            return Ok(Vec::new());
        }

        if let Some(envelopes) = self.parse_game_zip(&root) {
            return Ok(envelopes);
        }

        if let Some(envelopes) = self.parse_sports_short_rows(&root) {
            if !envelopes.is_empty() {
                return Ok(envelopes);
            }
        }

        let source_match_id = match Self::parse_match_id(&root) {
            Some(value) => value,
            None => {
                warn!("1xBet parser dropped frame without source_match_id");
                return Ok(Vec::new());
            }
        };

        let sport = string_field(root.get("sport")).unwrap_or_else(|| "football".to_string());
        let competition_name = string_field(root.get("competition_name"))
            .or_else(|| {
                object_field(&root, "competition")
                    .and_then(|competition| string_field(competition.get("name")))
            })
            .or_else(|| {
                object_field(&root, "league").and_then(|league| string_field(league.get("name")))
            });
        let start_time_ms = number_field_as_u64(root.get("start_time_ms"))
            .or_else(|| number_field_as_u64(root.get("kickoff_at_ms")))
            .or_else(|| number_field_as_u64(root.get("ts")))
            .unwrap_or_else(now_ms);
        let home_team_name = string_field(root.get("home_team_name"))
            .or_else(|| {
                object_field(&root, "home_team").and_then(|team| string_field(team.get("name")))
            })
            .or_else(|| {
                object_field(&root, "event")
                    .and_then(|event| event.get("home"))
                    .and_then(Value::as_object)
                    .and_then(|team| string_field(team.get("name")))
            });
        let away_team_name = string_field(root.get("away_team_name"))
            .or_else(|| {
                object_field(&root, "away_team").and_then(|team| string_field(team.get("name")))
            })
            .or_else(|| {
                object_field(&root, "event")
                    .and_then(|event| event.get("away"))
                    .and_then(Value::as_object)
                    .and_then(|team| string_field(team.get("name")))
            });

        let mut envelopes = Vec::new();

        for market_value in Self::parse_market_rows(&root) {
            let market: OneXBetMarketRow = match serde_json::from_value(market_value.clone()) {
                Ok(parsed) => parsed,
                Err(error_value) => {
                    warn!(error = %error_value, "1xBet parser dropped malformed market row");
                    continue;
                }
            };

            let Some(market_key) = Self::normalize_market_key(&market) else {
                warn!("1xBet parser dropped market without normalized key");
                continue;
            };

            for selection_value in market.selections {
                let selection: OneXBetSelectionRow = match serde_json::from_value(
                    selection_value.clone(),
                ) {
                    Ok(parsed) => parsed,
                    Err(error_value) => {
                        warn!(error = %error_value, market_key = %market_key, "1xBet parser dropped malformed selection row");
                        continue;
                    }
                };

                let Some(selection_key) = Self::normalize_selection_key(&selection) else {
                    warn!(market_key = %market_key, "1xBet parser dropped selection without normalized key");
                    continue;
                };

                let Some(price) = number_field_as_f64(selection.price.as_ref()) else {
                    warn!(market_key = %market_key, selection_key = %selection_key, "1xBet parser dropped selection without price");
                    continue;
                };

                let payload = json!({
                    "source_match_id": source_match_id.clone(),
                    "sport": sport.clone(),
                    "competition_name": competition_name.clone(),
                    "start_time_ms": start_time_ms,
                    "home_team_name": home_team_name.clone(),
                    "away_team_name": away_team_name.clone(),
                    "market_key": market_key.clone(),
                    "market_name": market.name.clone(),
                    "market_status": Self::normalize_status(None, market.status.as_deref()),
                    "selection_key": selection_key.clone(),
                    "selection_name": selection.name.clone(),
                    "selection_id": selection.id.and_then(|value| string_field(Some(&value))),
                    "status": Self::normalize_status(selection.status.as_deref(), market.status.as_deref()),
                    "price": price,
                    "source_event_time_ms": start_time_ms,
                    "raw_market": market_value,
                    "raw_selection": selection_value
                });

                envelopes.push(Envelope::new(
                    self.scraper_name.clone(),
                    MessageType::SelectionUpdate,
                    payload,
                ));
            }
        }

        Ok(envelopes)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_get_game_zip_cricket_payload() {
        let parser = OneXBetParser::new("one_x_bet_worker".to_string());
        let raw = r#"
        {
          "Success": true,
          "Value": {
            "I": 710120640,
            "LI": 2659024,
            "L": "Navi Mumbai Premier League",
            "O1": "Sanpada Scorpions",
            "O2": "Ambernath Avengers",
            "O1I": 7407405,
            "O2I": 7404097,
            "S": 1775449800,
            "SN": "Cricket",
            "SC": {"S": [{"Key": "Team2Scores", "Value": "92/2"}]},
            "GE": [
              {
                "G": 1,
                "GS": 1,
                "E": [
                  [{"B": true, "C": 1.55, "CV": "1.55", "T": 1}],
                  [{"B": true, "C": 25, "CV": "25", "T": 2}],
                  [{"B": true, "C": 2.41, "CV": "2.41", "T": 3}]
                ]
              },
              {
                "G": 62,
                "GS": 6,
                "E": [
                  [{"B": true, "C": 1.47, "CV": "1.47", "P": 166.5, "T": 13}],
                  [{"B": true, "C": 2.42, "CV": "2.42", "P": 166.5, "T": 14}]
                ]
              }
            ],
            "SG": [
              {
                "I": 710120718,
                "MG": 710120640,
                "TG": "Quick events",
                "TI": 43,
                "GE": [
                  {
                    "G": 10697,
                    "GS": 542,
                    "E": [
                      [{"C": 1.87, "CV": "1.87", "P": 13, "T": 2074}],
                      [{"C": 1.87, "CV": "1.87", "P": 13, "T": 2075}]
                    ]
                  }
                ]
              }
            ]
          }
        }
        "#;

        let envelopes = parser.parse_frame(raw).expect("parse succeeds");
        assert_eq!(envelopes.len(), 7);

        let payload = envelopes[0].payload.as_object().expect("payload object");
        assert_eq!(
            payload.get("source_match_id").and_then(Value::as_str),
            Some("710120640")
        );
        assert_eq!(
            payload.get("sport").and_then(Value::as_str),
            Some("cricket")
        );
        assert_eq!(
            payload.get("competition_name").and_then(Value::as_str),
            Some("Navi Mumbai Premier League")
        );
        assert_eq!(
            payload.get("home_team_name").and_then(Value::as_str),
            Some("Sanpada Scorpions")
        );
        assert_eq!(
            payload.get("away_team_name").and_then(Value::as_str),
            Some("Ambernath Avengers")
        );

        assert!(envelopes.iter().any(|envelope| {
            envelope.payload.get("market_scope").is_some()
                && envelope
                    .payload
                    .get("selection_key")
                    .and_then(Value::as_str)
                    .is_some_and(|key| key.contains("sg_710120718"))
        }));
    }
}
