//! GDELT 2.0 DOC API — global conflict/protest/disaster news firehose.

use std::time::Duration;

use chrono::{DateTime, NaiveDateTime, Utc};
use openatlas_core::Domain;
use reqwest::Client;
use serde::Deserialize;

use super::{
    adapter::FeedDescriptor,
    http::{fetch_text, parse_json_value},
    normalize::{drafts_to_events, ObservationDraft},
};

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

async fn fetch(client: Client) -> anyhow::Result<Vec<openatlas_core::WorldEvent>> {
    let url = "https://api.gdeltproject.org/api/v2/doc/doc?\
        query=(conflict%20OR%20protest%20OR%20war%20OR%20disaster%20OR%20outbreak)\
        &mode=ArtList&format=json&timespan=1h&maxrecords=25&sort=DateDesc";

    let body = fetch_text(&client, "gdelt", url).await?;
    let value = parse_json_value(&body, "gdelt")?;
    let parsed: Response = serde_json::from_value(value)?;

    let drafts = parsed
        .articles
        .into_iter()
        .take(MAX_RECORDS)
        .map(|article| {
            let timestamp = article
                .seendate
                .as_deref()
                .and_then(parse_seendate)
                .unwrap_or_else(Utc::now);
            let severity_score = article
                .tone
                .map(|tone| ((-tone + 5.0) / 15.0).clamp(0.1, 1.0))
                .unwrap_or(0.5);
            ObservationDraft::new(article.url.clone(), timestamp, Domain::Geopolitics, severity_score)
                .field("article_url", article.url)
                .field("title", article.title.unwrap_or_default())
                .field("source_country", article.sourcecountry.unwrap_or_default())
                .field("source_domain", article.domain.unwrap_or_default())
                .field("language", article.language.unwrap_or_default())
                .field("tone", article.tone)
        })
        .collect::<Vec<_>>();

    Ok(drafts_to_events("gdelt", SOURCE_URL, drafts))
}

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
