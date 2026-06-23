//! `openatlas-core` — the reactive world-model kernel.

pub mod domain;
pub mod error;
pub mod event;
pub mod graph;
pub mod inference;

pub use domain::Domain;
pub use error::CoreError;
pub use event::{
    CausalEdge, EntityNode, Location, Prediction, QueryFilters, Signal, WorldEvent, WorldState,
};
pub use graph::WorldGraph;
pub use inference::{InferenceEngine, ThresholdInferenceEngine};
