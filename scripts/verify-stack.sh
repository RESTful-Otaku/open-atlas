#!/usr/bin/env bash
# Quick stack verification: compile gates, subscription SQL, ingest/STDB health.
#
# Usage:
#   ./scripts/verify-stack.sh           # fast (no full e2e boot)
#   ./scripts/verify-stack.sh --full    # + prove-live + prove-llm when possible
#   ./scripts/verify-stack.sh --quick   # compile only (same as dev.sh check)
#
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

FULL=0
QUICK=0
for a in "$@"; do
  case "$a" in
    --full) FULL=1 ;;
    --quick) QUICK=1 ;;
  esac
done

die() { echo "verify-stack: $*" >&2; exit 1; }
ok() { echo "verify-stack: ✔ $*"; }

section() { echo ""; echo "=== $* ==="; }

section "Compile gates (fmt, clippy, test)"
./dev.sh check

if [[ "$QUICK" -eq 1 ]]; then
  ok "quick verify done"
  exit 0
fi

section "Subscription SQL (no ORDER BY)"
command -v spacetime >/dev/null || die "spacetime CLI required"
./scripts/verify-stdb-subscriptions.sh

STDB="${OPENATLAS_STDB_URI:-http://127.0.0.1:3000}"
INGEST="${INGEST_BASE:-http://127.0.0.1:8080}"

if curl -sf "${STDB%/}/v1/ping" >/dev/null 2>&1; then
  ok "SpacetimeDB ping OK ($STDB)"
else
  echo "verify-stack: ○ SpacetimeDB not running (skip runtime checks)"
  if [[ "$FULL" -eq 1 ]]; then
    die "use ./dev.sh up before --full"
  fi
  ok "static verify done (start stack for runtime: ./dev.sh up)"
  exit 0
fi

if curl -sf "${INGEST}/health" >/dev/null 2>&1; then
  ok "ingest /health OK"
  if command -v jq >/dev/null 2>&1; then
    STATUS="$(curl -sf "${INGEST}/status")"
    MODE="$(echo "$STATUS" | jq -r '.ingest_mode')"
    COUNT="$(echo "$STATUS" | jq -r '.stdb_event_count // "?"')"
    REACH="$(echo "$STATUS" | jq -r '.stdb_reachable')"
    echo "verify-stack:   ingest_mode=$MODE stdb_reachable=$REACH stdb_event_count=$COUNT"
    if [[ "$REACH" != "true" ]]; then
      die "ingest cannot reach SpacetimeDB"
    fi
    if [[ "$COUNT" != "?" && "$COUNT" != "null" && "${COUNT:-0}" -lt 1 ]]; then
      die "no events in SpacetimeDB — wait for ingest or use ./dev.sh up:sim"
    fi
  fi
else
  echo "verify-stack: ○ ingest not running (skip /status)"
fi

if [[ "$FULL" -eq 1 ]]; then
  section "Live pipeline proof"
  ./scripts/prove-live-stack.sh || die "prove-live failed"
  if curl -sf "http://127.0.0.1:3847/health" >/dev/null 2>&1; then
    section "LLM bridge proof"
    ./scripts/prove-llm-stack.sh || echo "verify-stack: ○ prove-llm skipped (Ollama may be down)"
  else
    echo "verify-stack: ○ LLM bridge not up (optional: ollama serve && ./dev.sh llm:start)"
  fi
fi

ok "STACK VERIFY OK"
