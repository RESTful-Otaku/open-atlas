use anyhow::Result;
use chrono::{DateTime, Utc};
use openatlas_core::{
    CarbonEmissionEvent, CountryCode, EnergyConsumptionEvent, EnergyGenerationEvent, GridRegionId,
    OpenAtlasState, SourceReference,
};
use openatlas_reducers::{ingest_carbon_event, ingest_consumption_event, ingest_generation_event};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Freshness {
    Fresh,
    Aging,
    Stale,
}

impl Freshness {
    fn as_str(&self) -> &'static str {
        match self {
            Freshness::Fresh => "fresh",
            Freshness::Aging => "aging",
            Freshness::Stale => "stale",
        }
    }
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceSummaryDto {
    pub source_id: String,
    pub publisher: String,
    pub dataset_name: String,
    pub source_url: String,
    pub event_count: usize,
    pub total_generated_mwh: f64,
    pub last_event_time: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EvidenceFeedDto {
    pub event_time: String,
    pub region_id: String,
    pub generated_mwh: f64,
    pub source_id: String,
    pub publisher: String,
    pub dataset_name: String,
    pub source_url: String,
    pub methodology_url: Option<String>,
    pub freshness: String,
}

#[derive(Default)]
pub struct SpacetimeGateway {
    pub state: OpenAtlasState,
    projection_events: Vec<ProjectionSubscriptionEvent>,
}

pub trait ProjectionQueryService {
    fn region_source_summary_dto(&self, region_id: &GridRegionId) -> Vec<SourceSummaryDto>;
    fn country_source_summary_dto(&self, country_code: &CountryCode) -> Vec<SourceSummaryDto>;
    fn region_evidence_feed_dto(
        &self,
        region_id: &GridRegionId,
        now: DateTime<Utc>,
    ) -> Vec<EvidenceFeedDto>;
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ProjectionSubscriptionEvent {
    RegionEvidenceUpdated { region_id: String },
    RegionSourceSummaryUpdated { region_id: String },
    CountrySourceSummaryUpdated { country_code: String },
}

pub trait ProjectionSubscriptionService {
    fn subscribe_region_projections(
        &self,
        region_id: &GridRegionId,
    ) -> Vec<ProjectionSubscriptionEvent>;
    fn subscribe_country_projections(
        &self,
        country_code: &CountryCode,
    ) -> Vec<ProjectionSubscriptionEvent>;
}

impl SpacetimeGateway {
    pub fn submit_generation(&mut self, event: EnergyGenerationEvent) -> Result<()> {
        let region_id = event.region_id.clone();
        ingest_generation_event(&mut self.state, event)?;
        self.emit_region_projection_events(&region_id);
        Ok(())
    }

    pub fn submit_consumption(&mut self, event: EnergyConsumptionEvent) -> Result<()> {
        let region_id = event.region_id.clone();
        ingest_consumption_event(&mut self.state, event)?;
        self.emit_region_projection_events(&region_id);
        Ok(())
    }

    pub fn submit_carbon(&mut self, event: CarbonEmissionEvent) -> Result<()> {
        let region_id = event.region_id.clone();
        ingest_carbon_event(&mut self.state, event)?;
        self.emit_region_projection_events(&region_id);
        Ok(())
    }

    pub fn drain_projection_events(&mut self) -> Vec<ProjectionSubscriptionEvent> {
        std::mem::take(&mut self.projection_events)
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

    fn region_source_summary_dto_impl(&self, region_id: &GridRegionId) -> Vec<SourceSummaryDto> {
        self.region_source_summary(region_id)
            .into_iter()
            .map(|row| SourceSummaryDto {
                source_id: row.source_id,
                publisher: row.publisher,
                dataset_name: row.dataset_name,
                source_url: row.source_url,
                event_count: row.event_count,
                total_generated_mwh: row.total_generated_mwh,
                last_event_time: row.last_event_time.to_rfc3339(),
            })
            .collect()
    }

    fn country_source_summary_dto_impl(&self, country_code: &CountryCode) -> Vec<SourceSummaryDto> {
        self.country_source_summary(country_code)
            .into_iter()
            .map(|row| SourceSummaryDto {
                source_id: row.source_id,
                publisher: row.publisher,
                dataset_name: row.dataset_name,
                source_url: row.source_url,
                event_count: row.event_count,
                total_generated_mwh: row.total_generated_mwh,
                last_event_time: row.last_event_time.to_rfc3339(),
            })
            .collect()
    }

    fn region_evidence_feed_dto_impl(
        &self,
        region_id: &GridRegionId,
        now: DateTime<Utc>,
    ) -> Vec<EvidenceFeedDto> {
        self.region_evidence_feed(region_id, now)
            .into_iter()
            .map(|row| EvidenceFeedDto {
                event_time: row.event_time.to_rfc3339(),
                region_id: row.region_id.0,
                generated_mwh: row.generated_mwh,
                source_id: row.source_id,
                publisher: row.publisher,
                dataset_name: row.dataset_name,
                source_url: row.source_url,
                methodology_url: row.methodology_url,
                freshness: row.freshness.as_str().to_string(),
            })
            .collect()
    }

    fn emit_region_projection_events(&mut self, region_id: &GridRegionId) {
        self.projection_events
            .extend(self.subscribe_region_projections(region_id));
        if let Some(region) = self.state.regions.get(region_id) {
            self.projection_events
                .extend(self.subscribe_country_projections(&region.country_code));
        }
    }
}

impl ProjectionQueryService for SpacetimeGateway {
    fn region_source_summary_dto(&self, region_id: &GridRegionId) -> Vec<SourceSummaryDto> {
        self.region_source_summary_dto_impl(region_id)
    }

    fn country_source_summary_dto(&self, country_code: &CountryCode) -> Vec<SourceSummaryDto> {
        self.country_source_summary_dto_impl(country_code)
    }

    fn region_evidence_feed_dto(
        &self,
        region_id: &GridRegionId,
        now: DateTime<Utc>,
    ) -> Vec<EvidenceFeedDto> {
        self.region_evidence_feed_dto_impl(region_id, now)
    }
}

impl ProjectionSubscriptionService for SpacetimeGateway {
    fn subscribe_region_projections(
        &self,
        region_id: &GridRegionId,
    ) -> Vec<ProjectionSubscriptionEvent> {
        vec![
            ProjectionSubscriptionEvent::RegionEvidenceUpdated {
                region_id: region_id.0.clone(),
            },
            ProjectionSubscriptionEvent::RegionSourceSummaryUpdated {
                region_id: region_id.0.clone(),
            },
        ]
    }

    fn subscribe_country_projections(
        &self,
        country_code: &CountryCode,
    ) -> Vec<ProjectionSubscriptionEvent> {
        vec![ProjectionSubscriptionEvent::CountrySourceSummaryUpdated {
            country_code: country_code.0.clone(),
        }]
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

        let feed_dto = gateway.region_evidence_feed_dto(&GridRegionId("de-central".into()), now);
        assert_eq!(feed_dto.len(), 3);
        assert_eq!(feed_dto[0].region_id, "de-central");
        assert_eq!(feed_dto[0].freshness, "fresh");
    }

    #[test]
    fn source_summary_dto_uses_stable_string_fields() {
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
                    methodology_url: None,
                },
            })
            .expect("event should be accepted");

        let query: &dyn ProjectionQueryService = &gateway;
        let summary_dto = query.region_source_summary_dto(&GridRegionId("de-central".into()));
        assert_eq!(summary_dto.len(), 1);
        assert_eq!(summary_dto[0].source_id, "source-test");
        assert!(summary_dto[0].last_event_time.contains('T'));
    }

    #[test]
    fn subscription_contract_exposes_mvp_projection_topics() {
        let gateway = SpacetimeGateway::default();
        let subscriptions: &dyn ProjectionSubscriptionService = &gateway;

        let region_topics =
            subscriptions.subscribe_region_projections(&GridRegionId("de-central".into()));
        assert_eq!(region_topics.len(), 2);
        assert!(matches!(
            region_topics[0],
            ProjectionSubscriptionEvent::RegionEvidenceUpdated { .. }
        ));

        let country_topics = subscriptions.subscribe_country_projections(&CountryCode("DE".into()));
        assert_eq!(country_topics.len(), 1);
        assert!(matches!(
            country_topics[0],
            ProjectionSubscriptionEvent::CountrySourceSummaryUpdated { .. }
        ));
    }

    #[test]
    fn reducer_writes_emit_projection_events_for_hub_consumers() {
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
                    methodology_url: None,
                },
            })
            .expect("event should be accepted");

        let events = gateway.drain_projection_events();
        assert_eq!(events.len(), 3);
        assert!(matches!(
            events[0],
            ProjectionSubscriptionEvent::RegionEvidenceUpdated { .. }
        ));
        assert!(matches!(
            events[2],
            ProjectionSubscriptionEvent::CountrySourceSummaryUpdated { .. }
        ));
    }
}
