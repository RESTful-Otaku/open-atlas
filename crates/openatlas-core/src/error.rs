//! Errors produced by core reducers. Deliberately narrow: every variant maps
//! to a precise, actionable failure that callers can surface unchanged.

use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Error)]
pub enum CoreError {
    #[error("severity_score must be in [0.0, 1.0]")]
    InvalidSeverity,
    #[error("event {0} already exists")]
    DuplicateEventId(Uuid),
    #[error("event {0} not found")]
    EventNotFound(Uuid),
}
