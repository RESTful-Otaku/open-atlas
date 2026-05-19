#!/usr/bin/env bash
# Prove the live-data stack: open APIs → ingest → SpacetimeDB → queryable events.
#
# Usage:
#   ./scripts/prove-live-stack.sh          # expects stack up or starts ingest live
#   ./scripts/prove-live-stack.sh --boot   # spacetime + publish + live ingest first
#
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

BOOT=0
for a in "$@"; do
  [[ "$a" == "--boot" ]] && BOOT=1
done

STDB="${OPENATLAS_STDB_URI:-http://127.0.0.1:3000}"
DB="${OPENATLAS_STDB_DB:-openatlas}"
INGEST="${INGEST_BASE:-http://127.0.0.1:8080}"
FEED_WAIT="${FEED_VERIFY_TIMEOUT:-200}"

die() { echo "prove-live: $*" >&2; exit 1; }
ok() { echo "prove-live: ✔ $*"; }

command -v jq >/dev/null || die "jq required"
command -v curl >/dev/null || die "curl required"
command -v spacetime >/dev/null || die "spacetime CLI required"

if [[ "$BOOT" -eq 1 ]]; then
  echo "prove-live: bootstrapping SpacetimeDB + live ingest…"
  ./dev.sh spacetime:start
  ./dev.sh spacetime:publish
  ./dev.sh stop 2>/dev/null || true
  ./dev.sh start
fi

curl -sf "${STDB%/}/v1/ping" >/dev/null || die "SpacetimeDB not up at $STDB"
curl -sf "${INGEST}/ready" >/dev/null || die "ingest not ready at $INGEST — run: ./dev.sh start"

STATUS="$(curl -sf "${INGEST}/status")"
MODE="$(echo "$STATUS" | jq -r '.ingest_mode')"
[[ "$MODE" == "live" ]] || die "ingest_mode must be 'live' (got '$MODE'). Run: ./dev.sh stop && ./dev.sh start"

LIVE="$(echo "$STATUS" | jq -r '.live_feeds_enabled')"
[[ "$LIVE" == "true" ]] || die "live_feeds_enabled is false"

echo ""
echo "=== Feed health (waiting up to ${FEED_WAIT}s for successes) ==="
deadline=$(( $(date +%s) + FEED_WAIT ))
while (( $(date +%s) < deadline )); do
  STATUS="$(curl -sf "${INGEST}/status")"
  pending="$(echo "$STATUS" | jq '[.feeds[] | select(.enabled == true and .success_count == 0)] | length')"
  failed="$(echo "$STATUS" | jq '[.feeds[] | select(.enabled == true and .failure_count > 0 and .success_count == 0)] | length')"
  if [[ "$pending" -eq 0 ]]; then
    break
  fi
  printf "  … %s feeds still waiting (%s with errors only)\n" "$pending" "$failed"
  sleep 5
done

printf "  %-14s %8s %8s %s\n" "feed" "success" "fail" "last_error"
while IFS= read -r row; do
  name="$(echo "$row" | jq -r '.name')"
  en="$(echo "$row" | jq -r '.enabled')"
  okc="$(echo "$row" | jq -r '.success_count')"
  fail="$(echo "$row" | jq -r '.failure_count')"
  err="$(echo "$row" | jq -r '.last_error // ""' | head -c 50)"
  if [[ "$en" != "true" ]]; then
    printf "  %-14s %8s %8s %s\n" "$name" "-" "-" "dormant"
  else
    printf "  %-14s %8s %8s %s\n" "$name" "$okc" "$fail" "$err"
  fi
done < <(echo "$STATUS" | jq -c '.feeds[]')

bad="$(echo "$STATUS" | jq '[.feeds[] | select(.enabled == true and .success_count == 0)] | length')"
if [[ "$bad" -gt 0 ]]; then
  die "$bad enabled feed(s) never succeeded"
fi
ok "all enabled live feeds reported success"

count_events() {
  spacetime sql -s "$STDB" -y "$DB" "SELECT COUNT(*) AS c FROM event" 2>/dev/null | tail -1 | tr -d ' \r' | grep -E '^[0-9]+$' || echo 0
}

COUNT_BEFORE="$(count_events)"
echo ""
echo "=== SpacetimeDB growth (45s window) ==="
sleep 45
COUNT_AFTER="$(count_events)"
echo "  event count: $COUNT_BEFORE → $COUNT_AFTER"

if [[ "$COUNT_BEFORE" -lt 50000 ]]; then
  if [[ "$COUNT_AFTER" -le "$COUNT_BEFORE" ]]; then
    die "event count did not increase — live ingest may not be writing"
  fi
  ok "event table growing"
else
  echo "  (ring at 50k cap — checking domain_insight source labels instead)"
  live_sources="$(spacetime sql -s "$STDB" -y "$DB" \
    "SELECT dominant_source FROM domain_insight" 2>/dev/null \
    | tr -d '"\r' \
    | tr ' ' '\n' \
    | grep -E '^(usgs|open-meteo|coingecko|nasa-eonet|opensky|gdelt|world-bank)$' \
    | sort -u | wc -l | tr -d ' ')"
  echo "  distinct live feed labels in domain_insight: $live_sources"
  if [[ "${live_sources:-0}" -lt 3 ]]; then
    die "expected multiple live dominant_source labels in domain_insight (got $live_sources)"
  fi
  ok "domain insights tagged with live feed sources"
fi

echo ""
echo "=== Domain insights (live source labels) ==="
spacetime sql -s "$STDB" -y "$DB" \
  "SELECT domain, dominant_source, narrative FROM domain_insight LIMIT 14" 2>/dev/null | head -20 || true

echo ""
echo "=== Recent events (CLI) ==="
cargo run -p openatlas-cli --quiet -- view events --limit 8 2>/dev/null || true

echo ""
ok "LIVE STACK VERIFIED"
echo ""
echo "Next: ./dev.sh web   → open http://localhost:5173 (not web:demo)"
echo "      Settings → confirm demo mode is OFF; pill should show Live · N events"
