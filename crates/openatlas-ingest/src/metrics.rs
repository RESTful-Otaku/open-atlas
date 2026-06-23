//! Process-local ingest counters, exposed on `/status`.

use std::sync::atomic::{AtomicU64, Ordering};

#[derive(Debug, Default)]
pub struct IngestMetrics {
    pub events_fetched: AtomicU64,
    pub events_accepted: AtomicU64,
    pub events_duplicate: AtomicU64,
    pub events_rejected: AtomicU64,
    pub events_transport_error: AtomicU64,
    pub batch_calls: AtomicU64,
    pub batch_fallback_calls: AtomicU64,
}

impl IngestMetrics {
    pub fn record_fetch(&self, count: usize) {
        self.events_fetched
            .fetch_add(count as u64, Ordering::Relaxed);
    }

    pub fn record_batch_push(&self, result: &crate::pipeline::BatchPushResult) {
        self.batch_calls.fetch_add(1, Ordering::Relaxed);
        self.events_accepted
            .fetch_add(result.accepted as u64, Ordering::Relaxed);
        self.events_duplicate
            .fetch_add(result.duplicates as u64, Ordering::Relaxed);
        self.events_rejected
            .fetch_add(result.rejected as u64, Ordering::Relaxed);
        self.events_transport_error
            .fetch_add(result.transport_errors as u64, Ordering::Relaxed);
    }

    pub fn record_batch_fallback(&self) {
        self.batch_fallback_calls.fetch_add(1, Ordering::Relaxed);
    }

    pub fn snapshot(&self) -> IngestMetricsSnapshot {
        IngestMetricsSnapshot {
            events_fetched: self.events_fetched.load(Ordering::Relaxed),
            events_accepted: self.events_accepted.load(Ordering::Relaxed),
            events_duplicate: self.events_duplicate.load(Ordering::Relaxed),
            events_rejected: self.events_rejected.load(Ordering::Relaxed),
            events_transport_error: self.events_transport_error.load(Ordering::Relaxed),
            batch_calls: self.batch_calls.load(Ordering::Relaxed),
            batch_fallback_calls: self.batch_fallback_calls.load(Ordering::Relaxed),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn snapshot_reflects_recorded_counters() {
        let m = IngestMetrics::default();
        m.record_fetch(10);
        m.record_batch_push(&crate::pipeline::BatchPushResult {
            accepted: 7,
            duplicates: 2,
            rejected: 1,
            transport_errors: 0,
        });
        m.record_batch_fallback();
        let snap = m.snapshot();
        assert_eq!(snap.events_fetched, 10);
        assert_eq!(snap.events_accepted, 7);
        assert_eq!(snap.events_duplicate, 2);
        assert_eq!(snap.events_rejected, 1);
        assert_eq!(snap.batch_calls, 1);
        assert_eq!(snap.batch_fallback_calls, 1);
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct IngestMetricsSnapshot {
    pub events_fetched: u64,
    pub events_accepted: u64,
    pub events_duplicate: u64,
    pub events_rejected: u64,
    pub events_transport_error: u64,
    pub batch_calls: u64,
    pub batch_fallback_calls: u64,
}

impl IngestMetricsSnapshot {
    pub fn to_prometheus_text(&self) -> String {
        let mut out = String::new();
        append_counter(
            &mut out,
            "openatlas_ingest_events_fetched_total",
            self.events_fetched,
        );
        append_counter(
            &mut out,
            "openatlas_ingest_events_accepted_total",
            self.events_accepted,
        );
        append_counter(
            &mut out,
            "openatlas_ingest_events_duplicate_total",
            self.events_duplicate,
        );
        append_counter(
            &mut out,
            "openatlas_ingest_events_rejected_total",
            self.events_rejected,
        );
        append_counter(
            &mut out,
            "openatlas_ingest_events_transport_error_total",
            self.events_transport_error,
        );
        append_counter(
            &mut out,
            "openatlas_ingest_batch_calls_total",
            self.batch_calls,
        );
        append_counter(
            &mut out,
            "openatlas_ingest_batch_fallback_calls_total",
            self.batch_fallback_calls,
        );
        out
    }
}

fn append_counter(out: &mut String, name: &str, value: u64) {
    use std::fmt::Write;
    let _ = writeln!(out, "# TYPE {name} counter");
    let _ = writeln!(out, "{name} {value}");
}

#[cfg(test)]
mod prometheus_tests {
    use super::*;

    #[test]
    fn prometheus_text_includes_all_series() {
        let snap = IngestMetrics::default().snapshot();
        let text = snap.to_prometheus_text();
        assert!(text.contains("openatlas_ingest_events_fetched_total"));
        assert!(text.contains("openatlas_ingest_batch_fallback_calls_total"));
        assert!(text.contains("# TYPE openatlas_ingest_events_accepted_total counter"));
    }
}
