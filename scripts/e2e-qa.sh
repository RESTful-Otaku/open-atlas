#!/usr/bin/env bash
# End-to-end build, test, and smoke verification for OpenAtlas in a
# production-like layout: Rust workspace, SpacetimeDB module, Svelte
# static bundle, ingest serving web/dist, data flowing into stdb.
#
# Prereqs: cargo, bun, spacetime CLI, curl, local SpacetimeDB
#          reachable at OPENATLAS_STDB_URI (default http://127.0.0.1:3000)
#          jq for --verify-feeds
#
# Usage:
#   ./scripts/e2e-qa.sh                    # compile gates + sim ingest smoke
#   ./scripts/e2e-qa.sh --quick            # skip long-running services
#   ./scripts/e2e-qa.sh --ingest-mode=static
#   ./scripts/e2e-qa.sh --verify-feeds     # live APIs (needs network, ~3 min)
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
VERIFY_FEEDS=0
INGEST_MODE="${OPENATLAS_INGEST_MODE:-sim}"
FEED_VERIFY_TIMEOUT="${FEED_VERIFY_TIMEOUT:-200}"

for a in "$@"; do
  case "$a" in
    --quick) QUICK=1 ;;
    --verify-feeds) VERIFY_FEEDS=1; INGEST_MODE=live ;;
    --ingest-mode=*) INGEST_MODE="${a#--ingest-mode=}" ;;
  esac
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

count_events() {
  spacetime sql -s "$STDB" -y "$DB_NAME" "SELECT COUNT(*) AS c FROM event" 2>/dev/null | tail -1 | tr -d ' \r' | grep -E '^[0-9]+$' || echo 0
}

EV_BEFORE="$(count_events)"

ingest_is_running() {
  curl -sf "${INGEST_URL}/health" >/dev/null 2>&1
}

stop_ingest_pid() {
  local pid="$1"
  [[ -n "$pid" ]] || return 0
  kill "$pid" 2>/dev/null || true
  sleep 1
  kill -9 "$pid" 2>/dev/null || true
}

start_ingest() {
  export RUST_LOG="${RUST_LOG:-openatlas_ingest=info,info}"
  export OPENATLAS_STDB_URI="$STDB"
  export OPENATLAS_STDB_DB="$DB_NAME"
  export OPENATLAS_INGEST_MODE="$INGEST_MODE"
  if [[ "$INGEST_MODE" == "live" ]]; then
    export OPENATLAS_ENABLE_LIVE_FEEDS=1
  else
    unset OPENATLAS_ENABLE_LIVE_FEEDS || true
  fi
  nohup cargo run --release -p openatlas-ingest --quiet >>"$DEV_DIR/e2e-ingest.log" 2>&1 &
  echo $!
}

verify_feeds_from_status() {
  command -v jq >/dev/null || die "--verify-feeds requires jq"
  local deadline=$(( $(date +%s) + FEED_VERIFY_TIMEOUT ))
  local status_json
  local failures=0

  echo "feed verification (timeout ${FEED_VERIFY_TIMEOUT}s, mode=live)…"
  printf "  %-14s %-8s %-8s %-8s %s\n" "feed" "enabled" "success" "fail" "note"

  while (( $(date +%s) < deadline )); do
    status_json="$(curl -sf "${INGEST_URL}/status" 2>/dev/null)" || {
      sleep 2
      continue
    }
    local mode
    mode="$(echo "$status_json" | jq -r '.ingest_mode // "?"')"
    [[ "$mode" == "live" ]] || die "ingest must be in live mode for --verify-feeds (got ${mode})"

    failures=0
    local pending=0
    while IFS= read -r row; do
      local name enabled ok fail err
      name="$(echo "$row" | jq -r '.name')"
      enabled="$(echo "$row" | jq -r '.enabled')"
      ok="$(echo "$row" | jq -r '.success_count')"
      fail="$(echo "$row" | jq -r '.failure_count')"
      err="$(echo "$row" | jq -r '.last_error // ""')"
      if [[ "$enabled" != "true" ]]; then
        printf "  %-14s %-8s %-8s %-8s %s\n" "$name" "no" "$ok" "$fail" "dormant (API key or disabled)"
        continue
      fi
      if [[ "$ok" -gt 0 ]]; then
        printf "  %-14s %-8s %-8s %-8s %s\n" "$name" "yes" "$ok" "$fail" "ok"
        continue
      fi
      if [[ "$name" == "gdelt" && ( "$err" == *"429"* || "$err" == *"Connection reset"* ) ]]; then
        printf "  %-14s %-8s %-8s %-8s %s\n" "$name" "yes" "$ok" "$fail" "flaky (rate limit / reset)"
        continue
      fi
      if [[ "$fail" -gt 0 && -n "$err" ]]; then
        printf "  %-14s %-8s %-8s %-8s %s\n" "$name" "yes" "$ok" "$fail" "ERR: ${err:0:60}"
        failures=$((failures + 1))
        continue
      fi
      pending=$((pending + 1))
      printf "  %-14s %-8s %-8s %-8s %s\n" "$name" "yes" "$ok" "$fail" "waiting…"
    done < <(echo "$status_json" | jq -c '.feeds[]')

    if [[ "$pending" -eq 0 && "$failures" -eq 0 ]]; then
      echo "e2e-qa: all required live feeds reported success."
      return 0
    fi
    sleep 5
  done

  die "timed out waiting for live feeds after ${FEED_VERIFY_TIMEOUT}s (see table above)"
}

section "Ingest: start if :8080 is free (mode=${INGEST_MODE})"
STARTED_INGEST=0
E2E_PID=""
if ingest_is_running; then
  echo "ingest already running at $INGEST_URL"
  if [[ "$VERIFY_FEEDS" -eq 1 ]]; then
    current_mode="$(curl -sf "${INGEST_URL}/status" | jq -r '.ingest_mode // "?"' 2>/dev/null || echo "?")"
    if [[ "$current_mode" != "live" ]]; then
      die "ingest already running but not in live mode (${current_mode}). Stop it and re-run with --verify-feeds."
    fi
  fi
else
  E2E_PID="$(start_ingest)"
  STARTED_INGEST=1
  echo "started openatlas-ingest pid=$E2E_PID mode=$INGEST_MODE (logs: $DEV_DIR/e2e-ingest.log)"
  for _ in $(seq 1 45); do
    if curl -sf "${INGEST_URL}/ready" >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
  curl -sf "${INGEST_URL}/ready" >/dev/null || die "ingest /ready not OK after 45s — see $DEV_DIR/e2e-ingest.log"
fi

section "Smoke: health, status, static UI"
curl -sf "${INGEST_URL}/health" | grep -q . || die "/health failed"
curl -sf "${INGEST_URL}/ready" | grep -q ready || die "/ready failed"
STATUS_JSON="$(curl -sf "${INGEST_URL}/status")"
echo "$STATUS_JSON" | grep -q stdb || die "/status failed"
echo "$STATUS_JSON" | grep -q "\"ingest_mode\":\"${INGEST_MODE}\"" || die "/status ingest_mode is not ${INGEST_MODE}"
curl -sf "${INGEST_URL}/" | grep -q "<!doctype html" || die "ingest should serve web/dist (build frontend first)"

if [[ "$VERIFY_FEEDS" -eq 1 ]]; then
  section "Live feed verification"
  verify_feeds_from_status
elif [[ "$INGEST_MODE" == "static" ]]; then
  section "Static fixture mode"
  sleep 2
  STATUS_JSON="$(curl -sf "${INGEST_URL}/status")"
  echo "$STATUS_JSON" | grep -q '"simulators_enabled":false' || die "static mode should disable simulators"
  echo "static ingest status OK"
else
  section "Event growth (simulators or live)"
  sleep 4
  EV_AFTER="$(count_events)"
  echo "event count before/after: $EV_BEFORE -> $EV_AFTER"
  if [[ "$STARTED_INGEST" -eq 1 ]]; then
    if [[ "$EV_BEFORE" -lt 50000 ]]; then
      if [[ "$EV_AFTER" -le "$EV_BEFORE" ]]; then
        die "expected event count to increase after starting ingest ($INGEST_MODE). check $DEV_DIR/e2e-ingest.log"
      fi
    else
      echo "(ring at 50k — count flat is expected; feed verification is the growth signal)"
    fi
  fi
fi

if [[ "$STARTED_INGEST" -eq 1 ]]; then
  echo "Stopping ingest we started (pid $E2E_PID)…"
  stop_ingest_pid "$E2E_PID"
fi

section "Optional: LLM bridge (Ollama)"
if curl -sf "http://127.0.0.1:3847/health" >/dev/null 2>&1; then
  echo "openatlas-llm-bridge health OK on :3847"
else
  echo "(skip) openatlas-llm-bridge not on :3847 — optional for Ollama-backed hub analysis"
fi

section "Optional: live feed unit fetch (network)"
if [[ "${RUN_LIVE_FEED_TEST:-0}" == "1" ]]; then
  cargo test -p openatlas-ingest registry_feeds_fetch -- --ignored --nocapture
else
  echo "(skip) set RUN_LIVE_FEED_TEST=1 to run cargo test registry_feeds_fetch -- --ignored"
fi

echo ""
echo "e2e-qa: PASS (ingest_mode=${INGEST_MODE}). UI: ./dev.sh web with stack running."
