use anyhow::Result;
use openatlas_core::{
    CarbonEmissionEvent, EnergyConsumptionEvent, EnergyGenerationEvent, OpenAtlasState,
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
}
