//! Tracing setup: `RUST_LOG` for filters, `OPENATLAS_LOG_JSON=1` for JSON output.

use tracing_subscriber::{fmt, EnvFilter};

pub fn init_tracing() {
    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("openatlas_ingest=info,info"));

    if std::env::var("OPENATLAS_LOG_JSON").ok().as_deref() == Some("1") {
        fmt()
            .json()
            .with_env_filter(filter)
            .with_target(true)
            .with_thread_ids(true)
            .init();
    } else {
        fmt().compact().with_env_filter(filter).init();
    }
}
