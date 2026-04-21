use anyhow::Result;
use openatlas_core::{
    CarbonEmissionEvent, EnergyConsumptionEvent, EnergyGenerationEvent, GridRegionId,
    OpenAtlasState, SourceReference,
};
use openatlas_reducers::{ingest_carbon_event, ingest_consumption_event, ingest_generation_event};

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
    }
}
