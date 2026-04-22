//! Shared, clone-cheap runtime state for the ingest service.
//!
//! With SpacetimeDB as the authoritative store the ingest service is now
//! a stateless pusher: it tracks only its own lifecycle (started_at) and
//! per-feed health for `/status`. Everything domain-related lives in the
//! SpacetimeDB module.

use std::{collections::HashMap, sync::Arc};

use chrono::{DateTime, Utc};
use tokio::sync::RwLock;

use crate::{health::FeedHealth, stdb::StdbClient};

/// Service-wide state handed to every feed worker, simulator, and
/// HTTP handler. Cheap to clone (all fields are `Arc` or `Copy`).
#[derive(Clone)]
pub(crate) struct AppState {
    pub(crate) started_at: DateTime<Utc>,
    pub(crate) feed_runtime: Arc<RwLock<HashMap<String, FeedHealth>>>,
    pub(crate) stdb: StdbClient,
}
