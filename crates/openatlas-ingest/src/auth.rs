//! Admin auth for mutating /feeds routes: fail-closed for non-loopback binds.

use std::net::SocketAddr;

use axum::{
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde::Serialize;

pub const ADMIN_KEY_HEADER: &str = "x-openatlas-key";

const DEFAULT_BIND: &str = "127.0.0.1:8080";

#[derive(Debug, Serialize)]
pub struct ErrorBody {
    pub error: String,
}

pub fn resolve_bind_addr() -> Result<SocketAddr, std::net::AddrParseError> {
    let raw = std::env::var("OPENATLAS_BIND").unwrap_or_else(|_| DEFAULT_BIND.to_owned());
    raw.parse()
}

pub fn is_loopback(addr: &SocketAddr) -> bool {
    match addr.ip() {
        std::net::IpAddr::V4(v4) => v4.is_loopback(),
        std::net::IpAddr::V6(v6) => v6.is_loopback(),
    }
}

fn configured_admin_key() -> Option<String> {
    std::env::var("OPENATLAS_API_KEY")
        .ok()
        .map(|s| s.trim().to_owned())
        .filter(|s| !s.is_empty())
}

pub fn mutations_require_auth(bind: &SocketAddr) -> bool {
    !is_loopback(bind) || configured_admin_key().is_some()
}

#[allow(clippy::result_large_err)]
pub fn check_admin_auth(headers: &HeaderMap, bind: &SocketAddr) -> Result<(), Response> {
    if !mutations_require_auth(bind) {
        return Ok(());
    }

    let Some(expected) = configured_admin_key() else {
        return Err((
            StatusCode::FORBIDDEN,
            Json(ErrorBody {
                error: format!(
                    "OPENATLAS_API_KEY must be set when ingest binds to {} (non-loopback)",
                    bind
                ),
            }),
        )
            .into_response());
    };

    let provided = headers
        .get(ADMIN_KEY_HEADER)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    if provided == expected {
        Ok(())
    } else {
        Err((
            StatusCode::UNAUTHORIZED,
            Json(ErrorBody {
                error: "missing or invalid x-openatlas-key".to_owned(),
            }),
        )
            .into_response())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_bind_is_loopback() {
        let addr = resolve_bind_addr().expect("parse");
        assert!(is_loopback(&addr));
    }

    #[test]
    fn non_loopback_requires_auth_even_without_env_key() {
        let addr: SocketAddr = "0.0.0.0:8080".parse().unwrap();
        assert!(mutations_require_auth(&addr));
    }
}
