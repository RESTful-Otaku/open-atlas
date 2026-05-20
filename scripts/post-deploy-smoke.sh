#!/usr/bin/env bash
# Post-deploy smoke: HTTP health on ingest + optional SpacetimeDB ping.
# Safe to run from CI after artifact upload or on a staging host (no secrets required).
#
# Usage:
#   ./scripts/post-deploy-smoke.sh
#   INGEST_BASE=https://staging.example ./scripts/post-deploy-smoke.sh
#   OPENATLAS_STDB_URI=https://maincloud.spacetimedb.com ./scripts/post-deploy-smoke.sh --stdb
#   ./scripts/post-deploy-smoke.sh --ws-stub   # documents WS path (curl-only today)
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

INGEST="${INGEST_BASE:-http://127.0.0.1:8080}"
STDB="${OPENATLAS_STDB_URI:-http://127.0.0.1:3000}"
CHECK_STDB=0
WS_STUB=0

for a in "$@"; do
  case "$a" in
    --stdb) CHECK_STDB=1 ;;
    --ws-stub) WS_STUB=1 ;;
    -h | --help)
      sed -n '2,9p' "$0"
      exit 0
      ;;
    *) echo "post-deploy-smoke: unknown arg: $a" >&2; exit 2 ;;
  esac
done

die() { echo "post-deploy-smoke: ✘ $*" >&2; exit 1; }
ok() { echo "post-deploy-smoke: ✔ $*"; }
section() { echo ""; echo "=== $* ==="; }

command -v curl >/dev/null || die "curl required"

section "Ingest (${INGEST})"
curl -sf "${INGEST%/}/health" | grep -q '^ok$' || die "/health did not return ok"
ok "/health"

READY_CODE="$(curl -s -o /dev/null -w '%{http_code}' "${INGEST%/}/ready")"
[[ "$READY_CODE" == "200" || "$READY_CODE" == "503" ]] || die "/ready unexpected HTTP ${READY_CODE}"
ok "/ready (HTTP ${READY_CODE})"

if curl -sf "${INGEST%/}/metrics" >/dev/null 2>&1; then
  METRICS="$(curl -sf "${INGEST%/}/metrics")"
  echo "$METRICS" | grep -q 'openatlas_ingest_' || die "/metrics missing openatlas_ingest_* series"
  ok "/metrics (Prometheus text)"
else
  echo "post-deploy-smoke: (skip) /metrics not exposed on this build"
fi

STATUS="$(curl -sf "${INGEST%/}/status" 2>/dev/null || true)"
if [[ -n "$STATUS" ]]; then
  echo "$STATUS" | grep -q '"ingest_mode"' || die "/status JSON missing ingest_mode"
  ok "/status JSON"
fi

if [[ "$CHECK_STDB" -eq 1 ]]; then
  section "SpacetimeDB (${STDB})"
  curl -sf "${STDB%/}/v1/ping" >/dev/null || die "STDB ping failed"
  ok "v1/ping"
fi

if [[ "$WS_STUB" -eq 1 ]]; then
  section "WebSocket subscribe (stub)"
  echo "  Browser clients subscribe via SpacetimeDB SDK WebSocket — not curl."
  echo "  After deploy: open app without ?demo=1, confirm Ops strip shows Live, or run:"
  echo "    ./scripts/verify-runtime.sh"
  echo "    ./scripts/verify-stdb-subscriptions.sh  (requires spacetime CLI)"
  ok "documented WS path"
fi

echo ""
echo "post-deploy-smoke: PASS"
