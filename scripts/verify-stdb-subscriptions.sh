#!/usr/bin/env bash
# Verify dashboard subscription SQL is accepted by SpacetimeDB (no ORDER BY).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STDB="${OPENATLAS_STDB_URI:-http://127.0.0.1:3000}"
DB="${OPENATLAS_STDB_DB:-openatlas}"

fail=0
check_sql() {
  local label="$1"
  local sql="$2"
  echo "==> $label"
  if spacetime sql -s "$STDB" -y "$DB" "$sql" >/dev/null 2>&1; then
    echo "    OK"
  else
    echo "    FAIL: $sql" >&2
    fail=1
  fi
}

check_sql "event (full ring)" "SELECT * FROM event LIMIT 3"
check_sql "signal" "SELECT * FROM signal LIMIT 3"
check_sql "causal_edge" "SELECT * FROM causal_edge LIMIT 3"
check_sql "world_state" "SELECT * FROM world_state"
check_sql "domain_insight" "SELECT * FROM domain_insight"
check_sql "event_narrative (HTTP SQL)" "SELECT * FROM event_narrative LIMIT 3"
check_sql "event_narrative (subscription shape)" "SELECT * FROM event_narrative"

echo "==> LIMIT on event_narrative must fail in subscriptions (browser SDK)"
echo "    (HTTP SQL above may still accept LIMIT — that is not the subscription API)"

echo "==> ORDER BY must fail (expected)"
if spacetime sql -s "$STDB" -y "$DB" "SELECT * FROM event ORDER BY ordinal DESC LIMIT 3" >/dev/null 2>&1; then
  echo "    UNEXPECTED: ORDER BY was accepted" >&2
  fail=1
else
  echo "    rejected as expected"
fi

if [[ "$fail" -ne 0 ]]; then
  exit 1
fi
echo "Subscription SQL checks passed."
