//! OpenAtlas ingest library — feed adapters, validation, and SpacetimeDB client.
//!
//! The binary (`main.rs`) is a thin wrapper; integration tests and tools
//! import this crate.

pub mod auth;
pub(crate) mod circuit;
pub mod feed_config;
pub(crate) mod feed_poll;
pub mod feeds;
pub mod fixtures;
pub mod health;
pub mod ingest_mode;
pub mod local_env;
pub mod logging;
pub mod metrics;
pub(crate) mod payload_compact;
pub(crate) mod pipeline;
pub mod rate_limit;
pub mod routes;
pub mod simulator;
pub mod state;
pub mod stdb;
pub mod validate;
