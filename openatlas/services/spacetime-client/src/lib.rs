use anyhow::Result;
use chrono::{DateTime, Utc};
use openatlas_core::{
    CarbonEmissionEvent, CountryCode, EnergyConsumptionEvent, EnergyGenerationEvent, GridRegionId,
    OpenAtlasState, SourceReference,
};
use openatlas_reducers::{ingest_carbon_event, ingest_consumption_event, ingest_generation_event};
use std::collections::BTreeMap;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Freshness {
    Fresh,
    Aging,
    Stale,
}

#[derive(Debug, Clone)]
pub struct SourceSummaryRow {
    pub source_id: String,
    pub publisher: String,
    pub dataset_name: String,
    pub source_url: String,
    pub event_count: usize,
    pub total_generated_mwh: f64,
    pub last_event_time: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct EvidenceFeedRow {
    pub event_time: DateTime<Utc>,
    pub region_id: GridRegionId,
    pub generated_mwh: f64,
    pub source_id: String,
    pub publisher: String,
    pub dataset_name: String,
    pub source_url: String,
    pub methodology_url: Option<String>,
    pub freshness: Freshness,
}

#[derive(Default)]
pub struct SpacetimeGateway {
    pub state: OpenAtlasState,
}

impl SpacetimeGateway {
    pub fn submit_generation(&mut self, event: EnergyGenerationEvent) -> Result<()> {
        ingest_generation_event(&mut self.state, event)
    }

    pub fn submit_consumption(&mut self, event: EnergyConsumptionEvent) -> Result<()> {
        ingest_consumption_event(&mut self.state, event)
    }

    pub fn submit_carbon(&mut self, event: CarbonEmissionEvent) -> Result<()> {
        ingest_carbon_event(&mut self.state, event)
    }

    pub fn region_generation_sources(
        &self,
        region_id: &GridRegionId,
    ) -> Vec<(f64, SourceReference)> {
        self.state
            .generation_events
            .iter()
            .filter(|event| &event.region_id == region_id)
            .map(|event| (event.generated_mwh, event.source_reference.clone()))
            .collect()
    }

    pub fn region_source_summary(&self, region_id: &GridRegionId) -> Vec<SourceSummaryRow> {
        let mut by_source: BTreeMap<String, SourceSummaryRow> = BTreeMap::new();

        for event in self
            .state
            .generation_events
            .iter()
            .filter(|event| &event.region_id == region_id)
        {
            if let Some(source) = self
                .state
                .source_registry
                .get(&event.source_reference.source_id)
            {
                by_source
                    .entry(source.source_id.clone())
                    .and_modify(|row| {
                        row.event_count += 1;
                        row.total_generated_mwh += event.generated_mwh;
                        if event.event_time > row.last_event_time {
                            row.last_event_time = event.event_time;
                        }
                    })
                    .or_insert_with(|| SourceSummaryRow {
                        source_id: source.source_id.clone(),
                        publisher: source.publisher.clone(),
                        dataset_name: source.dataset_name.clone(),
                        source_url: source.source_url.clone(),
                        event_count: 1,
                        total_generated_mwh: event.generated_mwh,
                        last_event_time: event.event_time,
                    });
            }
        }

        by_source.into_values().collect()
    }

    pub fn country_source_summary(&self, country_code: &CountryCode) -> Vec<SourceSummaryRow> {
        let region_ids: Vec<GridRegionId> = self
            .state
            .regions
            .values()
            .filter(|region| &region.country_code == country_code)
            .map(|region| region.id.clone())
            .collect();
        let mut aggregated: BTreeMap<String, SourceSummaryRow> = BTreeMap::new();

        for region_id in region_ids {
            for row in self.region_source_summary(&region_id) {
                aggregated
                    .entry(row.source_id.clone())
                    .and_modify(|acc| {
                        acc.event_count += row.event_count;
                        acc.total_generated_mwh += row.total_generated_mwh;
                        if row.last_event_time > acc.last_event_time {
                            acc.last_event_time = row.last_event_time;
                        }
                    })
                    .or_insert(row);
            }
        }

        aggregated.into_values().collect()
    }

    pub fn region_evidence_feed(
        &self,
        region_id: &GridRegionId,
        now: DateTime<Utc>,
    ) -> Vec<EvidenceFeedRow> {
        let mut rows = Vec::new();
        for event in self
            .state
            .generation_events
            .iter()
            .filter(|event| &event.region_id == region_id)
        {
            if let Some(source) = self
                .state
                .source_registry
                .get(&event.source_reference.source_id)
            {
                rows.push(EvidenceFeedRow {
                    event_time: event.event_time,
                    region_id: event.region_id.clone(),
                    generated_mwh: event.generated_mwh,
                    source_id: source.source_id.clone(),
                    publisher: source.publisher.clone(),
                    dataset_name: source.dataset_name.clone(),
                    source_url: source.source_url.clone(),
                    methodology_url: event.source_reference.methodology_url.clone(),
                    freshness: classify_freshness(event.event_time, now),
                });
            }
        }
        rows.sort_by_key(|row| std::cmp::Reverse(row.event_time));
        rows
    }
}

fn classify_freshness(event_time: DateTime<Utc>, now: DateTime<Utc>) -> Freshness {
    let age_hours = (now - event_time).num_hours();
    if age_hours <= 24 {
        Freshness::Fresh
    } else if age_hours <= 24 * 7 {
        Freshness::Aging
    } else {
        Freshness::Stale
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;
    use openatlas_core::{
        Country, CountryCode, DataSource, EnergyAssetId, GridRegion, SourceCredibility,
    };
    use uuid::Uuid;

    #[test]
    fn region_projection_includes_source_links() {
        let mut gateway = SpacetimeGateway::default();
        gateway.state.countries.insert(
            CountryCode("DE".into()),
            Country {
                code: CountryCode("DE".into()),
                name: "Germany".into(),
            },
        );
        gateway.state.regions.insert(
            GridRegionId("de-central".into()),
            GridRegion {
                id: GridRegionId("de-central".into()),
                country_code: CountryCode("DE".into()),
                name: "Germany Central".into(),
            },
        );
        gateway.state.source_registry.insert(
            "source-test".into(),
            DataSource {
                source_id: "source-test".into(),
                publisher: "Publisher".into(),
                dataset_name: "Dataset".into(),
                source_url: "https://example.org/open-energy-dataset".into(),
                license: "CC-BY-4.0".into(),
                credibility: SourceCredibility::OfficialBody,
            },
        );

        gateway
            .submit_generation(EnergyGenerationEvent {
                event_id: Uuid::new_v4(),
                asset_id: EnergyAssetId("asset-1".into()),
                region_id: GridRegionId("de-central".into()),
                generated_mwh: 10.0,
                event_time: Utc::now(),
                source: "test".into(),
                ingest_batch_id: "b1".into(),
                ingested_at: Utc::now(),
                source_reference: SourceReference {
                    source_id: "source-test".into(),
                    source_url: "https://example.org/open-energy-dataset".into(),
                    methodology_url: Some("https://example.org/method".into()),
                },
            })
            .expect("event should be accepted");

        let rows = gateway.region_generation_sources(&GridRegionId("de-central".into()));
        assert_eq!(rows.len(), 1);
        assert_eq!(
            rows[0].1.source_url,
            "https://example.org/open-energy-dataset"
        );

        let summary = gateway.region_source_summary(&GridRegionId("de-central".into()));
        assert_eq!(summary.len(), 1);
        assert_eq!(summary[0].publisher, "Publisher");
        assert_eq!(summary[0].event_count, 1);
        assert_eq!(summary[0].total_generated_mwh, 10.0);
    }

    #[test]
    fn country_summary_aggregates_across_regions() {
        let mut gateway = SpacetimeGateway::default();
        gateway.state.countries.insert(
            CountryCode("DE".into()),
            Country {
                code: CountryCode("DE".into()),
                name: "Germany".into(),
            },
        );
        gateway.state.regions.insert(
            GridRegionId("de-central".into()),
            GridRegion {
                id: GridRegionId("de-central".into()),
                country_code: CountryCode("DE".into()),
                name: "Germany Central".into(),
            },
        );
        gateway.state.regions.insert(
            GridRegionId("de-north".into()),
            GridRegion {
                id: GridRegionId("de-north".into()),
                country_code: CountryCode("DE".into()),
                name: "Germany North".into(),
            },
        );
        gateway.state.source_registry.insert(
            "source-test".into(),
            DataSource {
                source_id: "source-test".into(),
                publisher: "Publisher".into(),
                dataset_name: "Dataset".into(),
                source_url: "https://example.org/open-energy-dataset".into(),
                license: "CC-BY-4.0".into(),
                credibility: SourceCredibility::OfficialBody,
            },
        );
        for (region, value) in [("de-central", 12.0), ("de-north", 18.0)] {
            gateway
                .submit_generation(EnergyGenerationEvent {
                    event_id: Uuid::new_v4(),
                    asset_id: EnergyAssetId(format!("asset-{region}")),
                    region_id: GridRegionId(region.to_string()),
                    generated_mwh: value,
                    event_time: Utc::now(),
                    source: "test".into(),
                    ingest_batch_id: "b1".into(),
                    ingested_at: Utc::now(),
                    source_reference: SourceReference {
                        source_id: "source-test".into(),
                        source_url: "https://example.org/open-energy-dataset".into(),
                        methodology_url: None,
                    },
                })
                .expect("event should be accepted");
        }

        let country = gateway.country_source_summary(&CountryCode("DE".into()));
        assert_eq!(country.len(), 1);
        assert_eq!(country[0].event_count, 2);
        assert_eq!(country[0].total_generated_mwh, 30.0);
    }

    #[test]
    fn evidence_feed_is_sorted_and_contains_freshness_and_links() {
        let mut gateway = SpacetimeGateway::default();
        gateway.state.countries.insert(
            CountryCode("DE".into()),
            Country {
                code: CountryCode("DE".into()),
                name: "Germany".into(),
            },
        );
        gateway.state.regions.insert(
            GridRegionId("de-central".into()),
            GridRegion {
                id: GridRegionId("de-central".into()),
                country_code: CountryCode("DE".into()),
                name: "Germany Central".into(),
            },
        );
        gateway.state.source_registry.insert(
            "source-test".into(),
            DataSource {
                source_id: "source-test".into(),
                publisher: "Publisher".into(),
                dataset_name: "Dataset".into(),
                source_url: "https://example.org/open-energy-dataset".into(),
                license: "CC-BY-4.0".into(),
                credibility: SourceCredibility::OfficialBody,
            },
        );

        let now = Utc::now();
        for (hours_old, value) in [(2, 10.0), (48, 11.0), (24 * 10, 12.0)] {
            gateway
                .submit_generation(EnergyGenerationEvent {
                    event_id: Uuid::new_v4(),
                    asset_id: EnergyAssetId(format!("asset-{hours_old}")),
                    region_id: GridRegionId("de-central".into()),
                    generated_mwh: value,
                    event_time: now - chrono::Duration::hours(hours_old),
                    source: "test".into(),
                    ingest_batch_id: "b1".into(),
                    ingested_at: now,
                    source_reference: SourceReference {
                        source_id: "source-test".into(),
                        source_url: "https://example.org/open-energy-dataset".into(),
                        methodology_url: Some("https://example.org/method".into()),
                    },
                })
                .expect("event should be accepted");
        }

        let feed = gateway.region_evidence_feed(&GridRegionId("de-central".into()), now);
        assert_eq!(feed.len(), 3);
        assert!(feed[0].event_time >= feed[1].event_time);
        assert!(feed[1].event_time >= feed[2].event_time);
        assert_eq!(feed[0].freshness, Freshness::Fresh);
        assert_eq!(feed[1].freshness, Freshness::Aging);
        assert_eq!(feed[2].freshness, Freshness::Stale);
        assert_eq!(
            feed[0].source_url,
            "https://example.org/open-energy-dataset"
        );
    }
}
