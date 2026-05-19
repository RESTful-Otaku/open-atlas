#!/usr/bin/env bash
# End-to-end health: SpacetimeDB, ingest, feed pushes, and optional web STDB URI.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

STDB="${OPENATLAS_STDB_URI:-http://127.0.0.1:3000}"
DB="${OPENATLAS_STDB_DB:-openatlas}"
INGEST="${INGEST_BASE:-http://127.0.0.1:8080}"

echo "=== SpacetimeDB ==="
if curl -sf "${STDB%/}/v1/ping" >/dev/null; then
  echo "  ping: OK ($STDB)"
else
  echo "  ping: FAIL — start with ./dev.sh spacetime:start"
  exit 1
fi

if command -v spacetime >/dev/null 2>&1; then
  count="$(spacetime sql -s "$STDB" -y "$DB" "SELECT COUNT(*) AS c FROM event" 2>/dev/null | tail -1 | tr -d ' \r' || echo "?")"
  echo "  event rows: $count"
fi

echo ""
echo "=== Ingest ==="
if ! curl -sf "${INGEST}/ready" >/dev/null; then
  echo "  not ready — run ./dev.sh start"
  exit 1
fi
echo "  ready: OK"
STATUS="$(curl -sf "${INGEST}/status")"
echo "$STATUS" | jq '{
  ingest_mode,
  stdb_reachable,
  stdb_event_count,
  data_plane,
  feeds: [.feeds[] | {name, enabled, success_count, failure_count, last_error}]
}'

echo ""
echo "=== Sample feed test (usgs) ==="
TEST="$(curl -sS -X POST "${INGEST}/feeds/usgs/test" || true)"
echo "$TEST" | jq . 2>/dev/null || echo "$TEST"

echo ""
echo "=== Duplicate idempotency (ingest_event) ==="
echo "  Re-pushing the same logical event should count as duplicate, not error."
echo "  Check ingest logs for 'duplicate event id' at debug, not ERROR push failed."

echo ""
echo "Done. Restart ingest after code changes: ./dev.sh stop && ./dev.sh start"
