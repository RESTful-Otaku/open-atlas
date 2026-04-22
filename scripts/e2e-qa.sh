#!/usr/bin/env bash
# End-to-end build, test, and smoke verification for OpenAtlas in a
# production-like layout: Rust workspace, SpacetimeDB module, Svelte
# static bundle, ingest serving web/dist, data flowing into stdb.
#
# Prereqs: cargo, bun, spacetime CLI, curl, local SpacetimeDB
#          reachable at OPENATLAS_STDB_URI (default http://127.0.0.1:3000)
#
# Usage:
#   ./scripts/e2e-qa.sh           # full gates + start ingest if :8080 free
#   ./scripts/e2e-qa.sh --quick   # skip starting long-running services
#
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"
: "${DEV_DIR:=$ROOT/.dev}"
mkdir -p "$DEV_DIR"

: "${CARGO_HOME:=$ROOT/.cargo-local}"
export CARGO_HOME
STDB="${OPENATLAS_STDB_URI:-http://127.0.0.1:3000}"
DB_NAME="${OPENATLAS_STDB_DB:-openatlas}"
INGEST_URL="${INGEST_BASE:-http://127.0.0.1:8080}"
QUICK=0
for a in "$@"; do
  if [[ "$a" == "--quick" ]]; then QUICK=1; fi
done

die() { echo "e2e-qa: $*" >&2; exit 1; }

section() { echo ""; echo "=== $* ==="; }

section "Rust: fmt, clippy, test"
command -v cargo >/dev/null || die "cargo not found"
cargo fmt --all -- --check
cargo clippy --workspace --exclude openatlas-ui-wasm --no-deps -- -D warnings
cargo test --workspace --exclude openatlas-ui-wasm

section "Web: svelte-check + Vite build (bun)"
command -v bun >/dev/null || die "bun not found (https://bun.sh)"
if [[ -d web/node_modules ]]; then
  (cd web && bun run build)
else
  (cd web && bun install && bun run build)
fi

section "SpacetimeDB module: wasm build"
command -v spacetime >/dev/null || die "spacetime CLI not found (https://spacetimedb.com/install)"
spacetime build --module-path crates/openatlas-stdb-module

if [[ "$QUICK" -eq 1 ]]; then
  section "Quick mode: skipping live stack smoke (SpacetimeDB + ingest)"
  echo "e2e-qa: all compile-time gates passed."
  exit 0
fi

section "SpacetimeDB: ping / publish"
PING_URL="${STDB%/}/v1/ping"
if ! curl -sf "$PING_URL" >/dev/null; then
  die "SpacetimeDB not up at $PING_URL — run: ./dev.sh spacetime:start"
fi
spacetime publish --server "$STDB" --module-path crates/openatlas-stdb-module --yes "$DB_NAME"

# Last line of `spacetime sql` output is the numeric cell (whitespace-padded)
count_events() {
  spacetime sql -s "$STDB" -y "$DB_NAME" "SELECT COUNT(*) AS c FROM event" 2>/dev/null | tail -1 | tr -d ' \r' | grep -E '^[0-9]+$' || echo 0
}
EV_BEFORE="$(count_events)"

section "Ingest: start if :8080 is free"
if curl -sf "${INGEST_URL}/health" >/dev/null 2>&1; then
  echo "ingest already running at $INGEST_URL (skipping start)"
  STARTED_INGEST=0
else
  export RUST_LOG="${RUST_LOG:-openatlas_ingest=info,info}"
  export OPENATLAS_STDB_URI="$STDB"
  export OPENATLAS_STDB_DB="$DB_NAME"
  # Release binary matches production deploys; falls back to same flags as `cargo run`.
  nohup cargo run --release -p openatlas-ingest --quiet >>"$DEV_DIR/e2e-ingest.log" 2>&1 &
  E2E_PID=$!
  echo "started openatlas-ingest pid=$E2E_PID (logs: $DEV_DIR/e2e-ingest.log)"
  STARTED_INGEST=1
  for _ in $(seq 1 45); do
    if curl -sf "${INGEST_URL}/ready" >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
  curl -sf "${INGEST_URL}/ready" >/dev/null || die "ingest /ready not OK after 45s — see $DEV_DIR/e2e-ingest.log"
fi

section "Smoke: health, status, static UI, event growth"
curl -sf "${INGEST_URL}/health" | grep -q . || die "/health failed"
curl -sf "${INGEST_URL}/ready" | grep -q ready || die "/ready failed"
curl -sf "${INGEST_URL}/status" | grep -q stdb || die "/status failed"
curl -sf "${INGEST_URL}/" | grep -q "<!doctype html" || die "ingest should serve web/dist (build frontend first)"

sleep 4
EV_AFTER="$(count_events)"
echo "event count before/after: $EV_BEFORE -> $EV_AFTER"
if [[ "$STARTED_INGEST" -eq 1 ]]; then
  if [[ "$EV_AFTER" -le "$EV_BEFORE" ]]; then
    die "expected event count to increase after starting ingest (simulators). check $DEV_DIR/e2e-ingest.log and stdb."
  fi
fi

if [[ "$STARTED_INGEST" -eq 1 ]]; then
  echo "Stopping ingest we started (pid $E2E_PID)…"
  kill "$E2E_PID" 2>/dev/null || true
  sleep 1
  kill -9 "$E2E_PID" 2>/dev/null || true
fi

section "Optional: LLM bridge (Ollama)"
if curl -sf "http://127.0.0.1:3847/health" >/dev/null 2>&1; then
  echo "openatlas-llm-bridge health OK on :3847"
else
  echo "(skip) openatlas-llm-bridge not on :3847 — optional for Ollama-backed hub analysis"
fi

echo ""
echo "e2e-qa: PASS (compile gates + live stack smoke). For interactive UI: 'cd web && bun run dev' (or ./dev.sh dev:frontend) or open $INGEST_URL with ingest + web/dist."
