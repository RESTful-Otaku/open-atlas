

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
    #[error("invalid config: {0}")]
    InvalidConfig(String),
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    #[test]
    fn invalid_severity_display() {
        let err = CoreError::InvalidSeverity;
        assert_eq!(err.to_string(), "severity_score must be in [0.0, 1.0]");
    }

    #[test]
    fn duplicate_event_id_display() {
        let id = Uuid::parse_str("550e8400-e29b-41d4-a716-446655440000").unwrap();
        let err = CoreError::DuplicateEventId(id);
        assert!(err.to_string().contains("already exists"));
        assert!(err.to_string().contains(&id.to_string()));
    }

    #[test]
    fn event_not_found_display() {
        let id = Uuid::parse_str("550e8400-e29b-41d4-a716-446655440001").unwrap();
        let err = CoreError::EventNotFound(id);
        assert!(err.to_string().contains("not found"));
        assert!(err.to_string().contains(&id.to_string()));
    }

    #[test]
    fn error_is_debug() {
        let err = CoreError::InvalidSeverity;
        assert!(!format!("{err:?}").is_empty());
    }
}
