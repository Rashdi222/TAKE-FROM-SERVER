use std::{collections::BTreeSet, time::Duration};

use anyhow::{Context, Result};
use rand::Rng;
use serde_json::Value;
use tokio::sync::{mpsc, watch};
use tracing::{error, info, warn};
use url::Url;

use crate::{
    browser::{BrowserSession, PollResponse},
    config::{AppConfig, ScraperTargetConfig},
    control::RuntimeAction,
    parsers,
    parsers::common::{number_field_as_u64, string_field},
    redis_out::RedisPublisher,
};

const MIN_POLL_DELAY_MS: u64 = 800;
const MAX_POLL_DELAY_MS: u64 = 1_800;
const SESSION_COOLDOWN: Duration = Duration::from_secs(10);
const ONE_X_BET_DISCOVERY_LIMIT: usize = 24;

pub async fn run(
    config: AppConfig,
    browser: BrowserSession,
    publisher: RedisPublisher,
    mut target_rx: watch::Receiver<ScraperTargetConfig>,
    mut action_rx: mpsc::UnboundedReceiver<RuntimeAction>,
) -> Result<()> {
    let parser = parsers::parser_for(&config);
    let mut target = target_rx.borrow().clone();

    loop {
        if !target.is_active || target.poll_url.is_none() {
            info!(
                source_name = %config.scraper_name,
                active = target.is_active,
                has_poll = target.poll_url.is_some(),
                "polling scraper waiting for an active runtime configuration"
            );
            target_rx
                .changed()
                .await
                .context("scraper config watch channel closed")?;
            target = target_rx.borrow().clone();
            continue;
        }

        if let Err(error_value) = browser.bootstrap(&target).await {
            error!(error = %error_value, "bootstrap failed before polling loop");
            let _ = browser.clear_session(&target);
            tokio::time::sleep(SESSION_COOLDOWN).await;
            continue;
        }

        match poll_once(
            &config,
            &browser,
            &publisher,
            &*parser,
            &target,
            &mut target_rx,
            &mut action_rx,
        )
        .await
        {
            Ok(Some(next_target)) => {
                info!("polling scraper runtime configuration changed, restarting loop");
                target = next_target;
            }
            Ok(None) => {}
            Err(error_value) => {
                error!(error = %error_value, "polling scraper loop failed");
                tokio::time::sleep(Duration::from_secs(2)).await;
            }
        }
    }
}

async fn poll_once(
    config: &AppConfig,
    browser: &BrowserSession,
    publisher: &RedisPublisher,
    parser: &dyn parsers::ExchangeParser,
    target: &ScraperTargetConfig,
    target_rx: &mut watch::Receiver<ScraperTargetConfig>,
    action_rx: &mut mpsc::UnboundedReceiver<RuntimeAction>,
) -> Result<Option<ScraperTargetConfig>> {
    let poll_url = target
        .poll_url
        .as_ref()
        .ok_or_else(|| anyhow::anyhow!("poll URL missing for active polling scraper"))?;

    loop {
        let sleep_for = random_poll_delay();

        tokio::select! {
            _ = tokio::time::sleep(sleep_for) => {
                info!(
                    poll_url = %poll_url,
                    delay_ms = sleep_for.as_millis() as u64,
                    "starting polling tick"
                );
                let response = browser
                    .poll(target, poll_url)
                    .await
                    .with_context(|| format!("poll request failed for {poll_url}"))?;

                if should_reset_session(&response) {
                    warn!(
                        poll_url = %poll_url,
                        status = %response.status,
                        content_type = response.content_type.as_deref().unwrap_or("unknown"),
                        "polling session degraded, clearing session and re-bootstrapping"
                    );
                    browser.clear_session(target)?;
                    tokio::time::sleep(SESSION_COOLDOWN).await;
                    browser.bootstrap(target).await?;
                    continue;
                }

                if is_one_x_bet_discovery(config, poll_url) {
                    let discovery =
                        discover_one_x_bet_event_ids_from_discovery(browser, target, poll_url, &response.body)
                            .await?;
                    let discovered_event_ids = discovery.event_ids;

                    if discovered_event_ids.is_empty() {
                        info!(
                            poll_url = %poll_url,
                            direct_event_count = discovery.direct_event_count,
                            champ_count = discovery.champ_count,
                            champ_fetch_count = discovery.champ_fetch_count,
                            champ_fetch_with_events_count = discovery.champ_fetch_with_events_count,
                            "1xBet discovery tick found no cricket event ids"
                        );
                        continue;
                    }

                    let mut published_envelopes = 0usize;
                    let discovered_event_count = discovered_event_ids.len();
                    for event_id in discovered_event_ids {
                        let game_url = match build_one_x_bet_game_url(target, poll_url, event_id) {
                            Some(url) => url,
                            None => continue,
                        };

                        tokio::select! {
                            changed = target_rx.changed() => {
                                changed.context("scraper config watch channel closed")?;
                                let next_target = target_rx.borrow().clone();
                                if next_target != *target {
                                    return Ok(Some(next_target));
                                }
                            }
                            _ = tokio::time::sleep(random_poll_delay()) => {}
                        }

                        let game_response = browser
                            .poll(target, &game_url)
                            .await
                            .with_context(|| format!("poll request failed for {game_url}"))?;

                        if should_reset_session(&game_response) {
                            warn!(
                                poll_url = %game_url,
                                status = %game_response.status,
                                content_type = game_response.content_type.as_deref().unwrap_or("unknown"),
                                "event polling session degraded, clearing session and re-bootstrapping"
                            );
                            browser.clear_session(target)?;
                            tokio::time::sleep(SESSION_COOLDOWN).await;
                            browser.bootstrap(target).await?;
                            break;
                        }

                        published_envelopes += publish_parsed_response(publisher, parser, &game_response.body, &game_url).await?;
                    }

                    info!(
                        poll_url = %poll_url,
                        direct_event_count = discovery.direct_event_count,
                        champ_count = discovery.champ_count,
                        champ_fetch_count = discovery.champ_fetch_count,
                        champ_fetch_with_events_count = discovery.champ_fetch_with_events_count,
                        discovered_event_count,
                        published_envelopes,
                        delay_ms = sleep_for.as_millis() as u64,
                        "completed 1xBet discovery poll cycle"
                    );
                    continue;
                }

                let envelope_count = publish_parsed_response(publisher, parser, &response.body, poll_url).await?;
                if envelope_count == 0 {
                    info!(poll_url = %poll_url, "polling tick returned no envelopes");
                    continue;
                }

                info!(poll_url = %poll_url, envelope_count, delay_ms = sleep_for.as_millis() as u64, "pushed polled JSON to Redis");
            }
            changed = target_rx.changed() => {
                changed.context("scraper config watch channel closed")?;
                let next_target = target_rx.borrow().clone();
                if next_target != *target {
                    return Ok(Some(next_target));
                }
            }
            action = action_rx.recv() => {
                if let Some(action) = action {
                    handle_runtime_action(config, browser, publisher, parser, target, action).await?;
                }
            }
        }
    }
}

async fn handle_runtime_action(
    config: &AppConfig,
    browser: &BrowserSession,
    publisher: &RedisPublisher,
    parser: &dyn parsers::ExchangeParser,
    target: &ScraperTargetConfig,
    action: RuntimeAction,
) -> Result<()> {
    match action {
        RuntimeAction::FetchMatchOnce {
            match_id,
            source_match_id,
        } => {
            fetch_one_x_bet_match_once(
                config,
                browser,
                publisher,
                parser,
                target,
                match_id.as_deref(),
                &source_match_id,
            )
            .await
        }
    }
}

async fn fetch_one_x_bet_match_once(
    config: &AppConfig,
    browser: &BrowserSession,
    publisher: &RedisPublisher,
    parser: &dyn parsers::ExchangeParser,
    target: &ScraperTargetConfig,
    match_id: Option<&str>,
    source_match_id: &str,
) -> Result<()> {
    if !target.is_active || target.poll_url.is_none() {
        warn!(source_match_id, "ignored one-shot fetch because polling target is inactive");
        publish_action_result(
            &config.redis_url,
            match_id,
            source_match_id,
            "ignored",
            "polling target is inactive",
            0,
        )
        .await?;
        return Ok(());
    }

    let event_id = match source_match_id.parse::<u64>() {
        Ok(event_id) => event_id,
        Err(_) => {
            warn!(source_match_id, "ignored one-shot fetch because source match id is not numeric");
            publish_action_result(
                &config.redis_url,
                match_id,
                source_match_id,
                "failed",
                "source match id is not numeric",
                0,
            )
            .await?;
            return Ok(());
        }
    };

    let discovery_url = match target.poll_url.as_deref() {
        Some(url) => url,
        None => return Ok(()),
    };

    let game_url = match build_one_x_bet_game_url(target, discovery_url, event_id) {
        Some(url) => url,
        None => {
            warn!(source_match_id, "ignored one-shot fetch because game URL could not be built");
            publish_action_result(
                &config.redis_url,
                match_id,
                source_match_id,
                "failed",
                "game URL could not be built",
                0,
            )
            .await?;
            return Ok(());
        }
    };

    if let Err(error_value) = browser.bootstrap(target).await {
        warn!(error = %error_value, source_match_id, "one-shot fetch bootstrap failed");
    }

    let response = browser
        .poll(target, &game_url)
        .await
        .with_context(|| format!("one-shot poll request failed for {game_url}"))?;

    if should_reset_session(&response) {
        warn!(
            source_match_id,
            status = %response.status,
            content_type = response.content_type.as_deref().unwrap_or("unknown"),
            "one-shot fetch received degraded session response"
        );
        browser.clear_session(target)?;
        tokio::time::sleep(SESSION_COOLDOWN).await;
        browser.bootstrap(target).await?;
        publish_action_result(
            &config.redis_url,
            match_id,
            source_match_id,
            "degraded",
            "session degraded during one-shot fetch",
            0,
        )
        .await?;
        return Ok(());
    }

    let envelope_count = publish_parsed_response(publisher, parser, &response.body, &game_url).await?;
    info!(source_match_id, envelope_count, "completed one-shot source fetch");
    if is_one_x_bet_discovery(config, discovery_url) && envelope_count == 0 {
        warn!(source_match_id, "one-shot source fetch returned zero envelopes");
    }
    publish_action_result(
        &config.redis_url,
        match_id,
        source_match_id,
        "completed",
        "one-shot source fetch completed",
        envelope_count,
    )
    .await?;
    Ok(())
}

async fn publish_action_result(
    redis_url: &str,
    match_id: Option<&str>,
    source_match_id: &str,
    status: &str,
    message: &str,
    published_envelopes: usize,
) -> Result<()> {
    let client = redis::Client::open(redis_url)
        .with_context(|| format!("failed to create Redis client for {redis_url}"))?;
    let mut connection = client
        .get_multiplexed_async_connection()
        .await
        .context("failed to connect Redis for scraper action result")?;

    let payload = serde_json::json!({
        "match_id": match_id,
        "source_name": "one_x_bet_worker",
        "source_match_id": source_match_id,
        "status": status,
        "message": message,
        "published_envelopes": published_envelopes
    });

    let encoded = serde_json::to_string(&payload).context("failed to serialize scraper action result payload")?;
    let _: usize = redis::AsyncCommands::publish(&mut connection, "control:scraper-action-results", encoded)
        .await
        .context("failed to publish scraper action result")?;
    Ok(())
}

async fn publish_parsed_response(
    publisher: &RedisPublisher,
    parser: &dyn parsers::ExchangeParser,
    body: &str,
    poll_url: &str,
) -> Result<usize> {
    let envelopes = match parser.parse_frame(body) {
        Ok(envelopes) => envelopes,
        Err(error_value) => {
            warn!(error = %error_value, parser = parser.source_name(), poll_url = %poll_url, "poll parser rejected response");
            return Ok(0);
        }
    };

    let envelope_count = envelopes.len();
    for envelope in envelopes {
        let serialized =
            serde_json::to_string(&envelope).context("failed to serialize polling envelope")?;
        publisher.publish(serialized).await?;
    }

    Ok(envelope_count)
}

fn is_one_x_bet_discovery(config: &AppConfig, poll_url: &str) -> bool {
    matches!(config.parser_name.as_str(), "one_x_bet" | "1xbet") && !poll_url.contains("GetGameZip")
}

#[derive(Debug, Default)]
struct OneXBetDiscoveryResult {
    event_ids: Vec<u64>,
    direct_event_count: usize,
    champ_count: usize,
    champ_fetch_count: usize,
    champ_fetch_with_events_count: usize,
}

async fn discover_one_x_bet_event_ids_from_discovery(
    browser: &BrowserSession,
    target: &ScraperTargetConfig,
    discovery_url: &str,
    body: &str,
) -> Result<OneXBetDiscoveryResult> {
    let direct_event_ids = discover_one_x_bet_event_ids(body);
    if !direct_event_ids.is_empty() {
        return Ok(OneXBetDiscoveryResult {
            direct_event_count: direct_event_ids.len(),
            event_ids: direct_event_ids,
            ..OneXBetDiscoveryResult::default()
        });
    }

    let champ_ids = discover_one_x_bet_champ_ids(body);
    if champ_ids.is_empty() {
        return Ok(OneXBetDiscoveryResult::default());
    }

    let mut event_ids = BTreeSet::new();
    let mut champ_fetch_count = 0usize;
    let mut champ_fetch_with_events_count = 0usize;

    let champ_count = champ_ids.len();

    for champ_id in champ_ids {
        let champ_game_urls = build_one_x_bet_champ_games_urls(target, discovery_url, champ_id);
        if champ_game_urls.is_empty() {
            continue;
        }

        let mut champ_has_events = false;

        for champ_games_url in champ_game_urls {
            champ_fetch_count += 1;

            let response = browser
                .poll(target, &champ_games_url)
                .await
                .with_context(|| format!("champ games poll request failed for {champ_games_url}"))?;

            if should_reset_session(&response) {
                warn!(
                    poll_url = %champ_games_url,
                    champ_id,
                    status = %response.status,
                    content_type = response.content_type.as_deref().unwrap_or("unknown"),
                    "1xBet champ game discovery received degraded session response"
                );
                continue;
            }

            let champ_game_ids = discover_one_x_bet_event_ids(&response.body);
            if !champ_game_ids.is_empty() {
                champ_has_events = true;
                for event_id in champ_game_ids {
                    event_ids.insert(event_id);
                }
                break;
            }
        }

        if champ_has_events {
            champ_fetch_with_events_count += 1;
        }

        if event_ids.len() >= ONE_X_BET_DISCOVERY_LIMIT {
            break;
        }
    }

    Ok(OneXBetDiscoveryResult {
        event_ids: event_ids
            .into_iter()
            .take(ONE_X_BET_DISCOVERY_LIMIT)
            .collect(),
        direct_event_count: 0,
        champ_count,
        champ_fetch_count,
        champ_fetch_with_events_count,
    })
}

fn discover_one_x_bet_event_ids(body: &str) -> Vec<u64> {
    let Ok(root) = serde_json::from_str::<Value>(body) else {
        return Vec::new();
    };

    let mut ids = BTreeSet::new();
    collect_one_x_bet_event_ids(&root, &mut ids);
    ids.into_iter().take(ONE_X_BET_DISCOVERY_LIMIT).collect()
}

fn discover_one_x_bet_champ_ids(body: &str) -> Vec<u64> {
    let Ok(root) = serde_json::from_str::<Value>(body) else {
        return Vec::new();
    };

    let mut ids = BTreeSet::new();
    collect_one_x_bet_champ_ids(&root, &mut ids);
    ids.into_iter().take(ONE_X_BET_DISCOVERY_LIMIT).collect()
}

fn collect_one_x_bet_event_ids(value: &Value, ids: &mut BTreeSet<u64>) {
    match value {
        Value::Array(items) => {
            for item in items {
                collect_one_x_bet_event_ids(item, ids);
            }
        }
        Value::Object(map) => {
            if looks_like_one_x_bet_cricket_event(map) {
                if let Some(event_id) = number_field_as_u64(map.get("I")) {
                    ids.insert(event_id);
                }
            }

            for nested in map.values() {
                collect_one_x_bet_event_ids(nested, ids);
            }
        }
        _ => {}
    }
}

fn collect_one_x_bet_champ_ids(value: &Value, ids: &mut BTreeSet<u64>) {
    match value {
        Value::Array(items) => {
            for item in items {
                collect_one_x_bet_champ_ids(item, ids);
            }
        }
        Value::Object(map) => {
            if looks_like_one_x_bet_cricket_champ(map) {
                if let Some(champ_id) =
                    number_field_as_u64(map.get("LI")).or_else(|| number_field_as_u64(map.get("CI")))
                {
                    ids.insert(champ_id);
                }
            }

            for nested in map.values() {
                collect_one_x_bet_champ_ids(nested, ids);
            }
        }
        _ => {}
    }
}

fn looks_like_one_x_bet_cricket_event(map: &serde_json::Map<String, Value>) -> bool {
    let sport_is_cricket = number_field_as_u64(map.get("SI")) == Some(66)
        || string_field(map.get("SN"))
            .map(|value| value.eq_ignore_ascii_case("cricket"))
            .unwrap_or(false)
        || string_field(map.get("SE"))
            .map(|value| value.eq_ignore_ascii_case("cricket"))
            .unwrap_or(false);

    let has_teams = string_field(map.get("O1")).is_some() && string_field(map.get("O2")).is_some();
    let has_event_id = number_field_as_u64(map.get("I")).is_some();

    sport_is_cricket && has_teams && has_event_id
}

fn looks_like_one_x_bet_cricket_champ(map: &serde_json::Map<String, Value>) -> bool {
    let sport_is_cricket = number_field_as_u64(map.get("SI")) == Some(66)
        || string_field(map.get("SN"))
            .map(|value| value.eq_ignore_ascii_case("cricket"))
            .unwrap_or(false)
        || string_field(map.get("SE"))
            .map(|value| value.eq_ignore_ascii_case("cricket"))
            .unwrap_or(false);

    let has_champ_id =
        number_field_as_u64(map.get("LI")).is_some() || number_field_as_u64(map.get("CI")).is_some();
    let has_name = string_field(map.get("L"))
        .or_else(|| string_field(map.get("LE")))
        .or_else(|| string_field(map.get("LR")))
        .or_else(|| string_field(map.get("N")))
        .is_some();
    let has_teams = string_field(map.get("O1")).is_some() || string_field(map.get("O2")).is_some();

    sport_is_cricket && has_champ_id && has_name && !has_teams
}

fn build_one_x_bet_game_url(
    target: &ScraperTargetConfig,
    discovery_url: &str,
    event_id: u64,
) -> Option<String> {
    let base = Url::parse(discovery_url).ok().or_else(|| {
        target
            .bootstrap_url
            .as_deref()
            .and_then(|value| Url::parse(value).ok())
    })?;

    let mut url = base;
    url.set_path("/service-api/LiveFeed/GetGameZip");
    url.set_query(None);

    {
        let mut pairs = url.query_pairs_mut();
        pairs.append_pair("id", &event_id.to_string());
        pairs.append_pair("lng", "en");
        pairs.append_pair("isSubGames", "true");
        pairs.append_pair("GroupEvents", "true");
        pairs.append_pair("countevents", "250");
        pairs.append_pair("grMode", "4");
        pairs.append_pair("topGroups", "");
        pairs.append_pair("country", "141");
        pairs.append_pair("marketType", "1");
        pairs.append_pair("isNewBuilder", "true");
    }

    Some(url.to_string())
}

fn build_one_x_bet_champ_games_urls(
    target: &ScraperTargetConfig,
    discovery_url: &str,
    champ_id: u64,
) -> Vec<String> {
    let base = Url::parse(discovery_url).ok().or_else(|| {
        target
            .bootstrap_url
            .as_deref()
            .and_then(|value| Url::parse(value).ok())
    });

    let Some(base) = base else {
        return Vec::new();
    };

    let variants: [&[(&str, &str)]; 4] = [
        &[("lng", "en"), ("country", "141")],
        &[("lng", "en"), ("country", "141"), ("sport", "66")],
        &[("lng", "en"), ("country", "141"), ("gr", "520")],
        &[
            ("lng", "en"),
            ("country", "141"),
            ("sport", "66"),
            ("gr", "520"),
        ],
    ];

    let mut urls = Vec::new();
    for variant in variants {
        let mut url = base.clone();
        url.set_path("/service-api/LiveFeed/GetChampZip");
        url.set_query(None);

        {
            let mut pairs = url.query_pairs_mut();
            pairs.append_pair("champ", &champ_id.to_string());
            for (key, value) in variant {
                pairs.append_pair(key, value);
            }
        }

        let rendered = url.to_string();
        if !urls.contains(&rendered) {
            urls.push(rendered);
        }
    }

    urls
}

fn random_poll_delay() -> Duration {
    let delay_ms = rand::rng().random_range(MIN_POLL_DELAY_MS..=MAX_POLL_DELAY_MS);
    Duration::from_millis(delay_ms)
}

fn should_reset_session(response: &PollResponse) -> bool {
    if !response.status.is_success() {
        return true;
    }

    if response
        .content_type
        .as_deref()
        .map(|value| value.to_ascii_lowercase().contains("text/html"))
        .unwrap_or(false)
    {
        return true;
    }

    let trimmed = response.body.trim_start().to_ascii_lowercase();
    trimmed.starts_with("<!doctype html") || trimmed.starts_with("<html")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn discovers_cricket_event_ids_recursively() {
        let raw = r#"
        {
          "Success": true,
          "Value": [
            {"I": 1, "SI": 1, "O1": "A", "O2": "B"},
            {
              "nested": {
                "I": 710120640,
                "SI": 66,
                "O1": "Sanpada Scorpions",
                "O2": "Ambernath Avengers"
              }
            },
            {
              "items": [
                {"I": 710120641, "SN": "Cricket", "O1": "X", "O2": "Y"},
                {"I": 710120640, "SE": "Cricket", "O1": "Dup", "O2": "Dup"}
              ]
            }
          ]
        }
        "#;

        let ids = discover_one_x_bet_event_ids(raw);
        assert_eq!(ids, vec![710120640, 710120641]);
    }

    #[test]
    fn discovers_cricket_champ_ids_recursively() {
        let raw = r#"
        {
          "Success": true,
          "Value": [
            {"LI": 10, "SI": 1, "L": "Football League"},
            {
              "nested": {
                "LI": 2659024,
                "SI": 66,
                "L": "Navi Mumbai Premier League"
              }
            },
            {
              "items": [
                {"LI": 2659025, "SN": "Cricket", "LE": "Indian Premier League"},
                {"LI": 2659024, "SE": "Cricket", "LR": "Dup"}
              ]
            }
          ]
        }
        "#;

        let ids = discover_one_x_bet_champ_ids(raw);
        assert_eq!(ids, vec![2659024, 2659025]);
    }

    #[test]
    fn builds_one_x_bet_game_url() {
        let target = ScraperTargetConfig {
            websocket_url: None,
            bootstrap_url: Some("https://pk.1x-bet.mobi/en/top-sports/cricket".to_string()),
            poll_url: Some(
                "https://pk.1x-bet.mobi/service-api/LiveFeed/GetSportsZip?sports=66".to_string(),
            ),
            proxy_url: None,
            is_active: true,
        };

        let url = build_one_x_bet_game_url(&target, target.poll_url.as_deref().unwrap(), 710120640)
            .expect("game url");
        assert!(url.contains("/service-api/LiveFeed/GetGameZip"));
        assert!(url.contains("id=710120640"));
        assert!(url.contains("country=141"));
    }

    #[test]
    fn builds_one_x_bet_champ_events_url() {
        let target = ScraperTargetConfig {
            websocket_url: None,
            bootstrap_url: Some("https://pk.1x-bet.mobi/en/top-sports/cricket".to_string()),
            poll_url: Some(
                "https://pk.1x-bet.mobi/service-api/LiveFeed/GetSportsZip?sports=66".to_string(),
            ),
            proxy_url: None,
            is_active: true,
        };

        let urls =
            build_one_x_bet_champ_games_urls(&target, target.poll_url.as_deref().unwrap(), 2659024);
        let url = urls.first().expect("champ games url");
        assert!(url.contains("/service-api/LiveFeed/GetChampZip"));
        assert!(url.contains("champ=2659024"));
        assert!(url.contains("country=141"));
    }
}
