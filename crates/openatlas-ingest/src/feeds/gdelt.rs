//! GDELT 2.0 DOC API — global conflict/protest/disaster news firehose.
//!
//! The `timespan` parameter must be ≥ 15 minutes per the GDELT docs
//! (<https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts>). We use 1 hour
//! to produce a rich but bounded result set. GDELT occasionally returns
//! plain-text errors or HTML; we detect and surface these cleanly.

use std::time::Duration;

use anyhow::Context;
use chrono::{DateTime, NaiveDateTime, Utc};
use openatlas_core::{Domain, WorldEvent};
use reqwest::Client;
use serde::Deserialize;
use serde_json::json;

use super::{adapter::FeedDescriptor, deterministic_event_id};

const POLL_INTERVAL: Duration = Duration::from_secs(180);
const SOURCE_URL: &str = "https://www.gdeltproject.org/";

pub(super) const DESCRIPTOR: FeedDescriptor = FeedDescriptor {
    name: "gdelt",
    source_url: SOURCE_URL,
    poll_interval: POLL_INTERVAL,
    requires_env: None,
    fetch: |client| Box::pin(fetch(client)),
};

const MAX_RECORDS: usize = 25;

#[derive(Debug, Deserialize)]
struct Response {
    #[serde(default)]
    articles: Vec<Article>,
}

#[derive(Debug, Deserialize)]
struct Article {
    url: String,
    title: Option<String>,
    seendate: Option<String>,
    sourcecountry: Option<String>,
    domain: Option<String>,
    language: Option<String>,
    #[serde(default)]
    tone: Option<f64>,
}

async fn fetch(client: Client) -> anyhow::Result<Vec<WorldEvent>> {
    let url = "https://api.gdeltproject.org/api/v2/doc/doc?\
        query=(conflict%20OR%20protest%20OR%20war%20OR%20disaster%20OR%20outbreak)\
        &mode=ArtList&format=json&timespan=1h&maxrecords=25&sort=DateDesc";

    let response = client
        .get(url)
        .send()
        .await?
        .error_for_status()?
        .text()
        .await?;

    let trimmed = response.trim_start();
    if !trimmed.starts_with('{') {
        anyhow::bail!(
            "gdelt returned non-json response: {}",
            trimmed.chars().take(120).collect::<String>()
        );
    }
    let parsed: Response = serde_json::from_str(&response)
        .context("gdelt response was not valid JSON (may be rate limited)")?;

    let mut events = Vec::new();
    for article in parsed.articles.into_iter().take(MAX_RECORDS) {
        let timestamp = article
            .seendate
            .as_deref()
            .and_then(parse_seendate)
            .unwrap_or_else(Utc::now);

        // Tone (if present) ranges roughly [-10, 10]; more negative = worse.
        let severity_score = article
            .tone
            .map(|tone| ((-tone + 5.0) / 15.0).clamp(0.1, 1.0))
            .unwrap_or(0.5);

        events.push(WorldEvent {
            id: deterministic_event_id("gdelt", &article.url),
            timestamp,
            domain: Domain::Geopolitics,
            location: None,
            severity_score,
            payload: json!({
                "source": "gdelt",
                "source_url": SOURCE_URL,
                "article_url": article.url,
                "title": article.title,
                "source_country": article.sourcecountry,
                "source_domain": article.domain,
                "language": article.language,
                "tone": article.tone
            }),
        });
    }
    Ok(events)
}

/// GDELT's `seendate` uses compact ISO-8601 basic format `YYYYMMDDTHHMMSSZ`.
fn parse_seendate(raw: &str) -> Option<DateTime<Utc>> {
    let trimmed = raw.trim_end_matches('Z');
    let naive = NaiveDateTime::parse_from_str(trimmed, "%Y%m%dT%H%M%S").ok()?;
    Some(DateTime::from_naive_utc_and_offset(naive, Utc))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn date_parser_handles_compact_iso() {
        let parsed = parse_seendate("20240115T123045Z").expect("date should parse");
        assert_eq!(
            parsed.format("%Y-%m-%d %H:%M:%S").to_string(),
            "2024-01-15 12:30:45"
        );
        assert!(parse_seendate("not-a-date").is_none());
    }
}
