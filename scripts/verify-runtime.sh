#!/usr/bin/env bash
# Runtime verification: SpacetimeDB, ingest, external APIs, client WebSocket path.
# Does not compile — use ./scripts/verify-stack.sh or ./dev.sh verify for full gates.
#
# Usage:
#   ./scripts/verify-runtime.sh           # fast probes (~30s)
#   ./scripts/verify-runtime.sh --live    # + prove-live-stack (~60s)
#   ./scripts/verify-runtime.sh --feeds   # + Rust live fetch test (~20s)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

STDB="${OPENATLAS_STDB_URI:-http://127.0.0.1:3000}"
DB="${OPENATLAS_STDB_DB:-openatlas}"
INGEST="${INGEST_BASE:-http://127.0.0.1:8080}"
LLM="${OPENATLAS_LLM_BASE:-http://127.0.0.1:3847}"
WEB="${VITE_DEV_URL:-http://127.0.0.1:5173}"

LIVE_PROOF=0
FEEDS_TEST=0
for a in "$@"; do
  case "$a" in
    --live) LIVE_PROOF=1 ;;
    --feeds) FEEDS_TEST=1 ;;
  esac
done

die() { echo "verify-runtime: ✘ $*" >&2; exit 1; }
ok() { echo "verify-runtime: ✔ $*"; }
section() { echo ""; echo "=== $* ==="; }

command -v curl >/dev/null || die "curl required"
command -v jq >/dev/null || die "jq required"

sql_count() {
  local table="$1"
  curl -sf -X POST "${STDB%/}/v1/database/${DB}/sql" \
    -H "Content-Type: text/plain" \
    -d "SELECT COUNT(*) AS c FROM ${table}" \
    | jq -r '.[0].rows[0][0] // empty'
}

section "SpacetimeDB (${STDB})"
curl -sf "${STDB%/}/v1/ping" >/dev/null || die "ping failed — run ./dev.sh spacetime:start"
curl -sf "${STDB%/}/v1/database/${DB}" >/dev/null || die "database '${DB}' not found — ./dev.sh spacetime:publish"
ok "ping + database OK"

EVENTS="$(sql_count event)"
SIGNALS="$(sql_count signal)"
EDGES="$(sql_count causal_edge)"
echo "  event=${EVENTS} signal=${SIGNALS} causal_edge=${EDGES}"
[[ -n "$EVENTS" && "$EVENTS" -ge 1 ]] || die "no events in SpacetimeDB"

command -v spacetime >/dev/null && ./scripts/verify-stdb-subscriptions.sh || echo "  (skip subscription SQL — spacetime CLI missing)"

section "Ingest (${INGEST})"
curl -sf "${INGEST}/health" >/dev/null || die "/health failed — run ./dev.sh ingest or ./dev.sh start"
curl -sf "${INGEST}/ready" >/dev/null || die "/ready failed"
STATUS="$(curl -sf "${INGEST}/status")"
MODE="$(echo "$STATUS" | jq -r '.ingest_mode')"
REACH="$(echo "$STATUS" | jq -r '.stdb_reachable')"
[[ "$REACH" == "true" ]] || die "ingest cannot reach SpacetimeDB"
ok "health/ready OK · mode=${MODE} · stdb_reachable=true"

ENABLED_FAIL="$(echo "$STATUS" | jq '[.feeds[] | select(.enabled == true and .success_count == 0)] | length')"
[[ "$ENABLED_FAIL" -eq 0 ]] || die "${ENABLED_FAIL} enabled feed(s) never succeeded"
echo "$STATUS" | jq -r '.feeds[] | select(.enabled) | "  \(.name): success=\(.success_count) fail=\(.failure_count)"'

section "Vite dev proxy (${WEB})"
if curl -sf -o /dev/null "${WEB}/health" 2>/dev/null; then
  ok "GET ${WEB}/health → ingest"
else
  echo "  ○ web dev server not on ${WEB} (optional)"
fi

section "External open-data APIs"
probe() {
  local name="$1" url="$2"
  local code attempt
  for attempt in 1 2 3; do
    code="$(curl -s -o /dev/null -w "%{http_code}" --max-time 25 "$url" 2>/dev/null || true)"
    [[ -n "$code" ]] || code="ERR"
    [[ "$code" == "200" ]] && break
    sleep 2
  done
  [[ "$code" == "200" ]] || die "${name} HTTP ${code} (after 3 attempts)"
  ok "${name} HTTP 200"
}
probe "USGS" "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson"
probe "NASA EONET" "https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=1"
probe "Open-Meteo" "https://api.open-meteo.com/v1/forecast?latitude=51.5&longitude=-0.1&current=temperature_2m"
probe "CoinGecko" "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd"
probe "GDELT" "https://api.gdeltproject.org/api/v2/doc/doc?query=climate&mode=artlist&maxrecords=1&format=json"
probe "World Bank" "https://api.worldbank.org/v2/country/USA/indicator/NY.GDP.MKTP.KD.ZG?format=json&per_page=1"
probe "OpenSky" "https://opensky-network.org/api/states/all?lamin=50&lomin=-1&lamax=52&lomax=1"

DORMANT="$(echo "$STATUS" | jq -r '[.feeds[] | select(.enabled == false) | .name] | join(", ")')"
[[ -n "$DORMANT" ]] && echo "  dormant (need API keys): ${DORMANT}"

section "Browser WebSocket (SpacetimeDB SDK)"
if command -v bun >/dev/null && [[ -d "$ROOT/web/node_modules" ]]; then
  (
    cd "$ROOT/web"
    bun -e "
      import { DbConnection } from './src/lib/stdb/index.ts';
      import { resolveStdbWebSocketUri } from './src/lib/stdb-endpoint.ts';
      const uri = resolveStdbWebSocketUri('localhost');
      await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('timeout')), 12000);
        DbConnection.builder().withUri(uri).withDatabaseName('${DB}')
          .onConnect((c) => { clearTimeout(t); c.disconnect(); resolve(null); })
          .onConnectError((_, e) => { clearTimeout(t); reject(e); })
          .build();
      });
      console.log('  uri=' + uri);
    "
  ) 2>&1 | tail -3
  ok "SDK connect (localhost → IPv4 loopback)"
else
  echo "  ○ skip SDK test (bun or web/node_modules missing)"
fi

section "LLM bridge (${LLM}) — optional"
if curl -sf "${LLM}/health" >/dev/null 2>&1; then
  ok "bridge /health"
  if curl -sf "${LLM}/v1/ready" >/dev/null 2>&1; then
    ok "Ollama /v1/ready"
  else
    echo "  ○ Ollama not ready (ollama serve)"
  fi
else
  echo "  ○ LLM bridge not running"
fi

if [[ "$LIVE_PROOF" -eq 1 ]]; then
  section "Live pipeline proof"
  FEED_VERIFY_TIMEOUT="${FEED_VERIFY_TIMEOUT:-60}" ./scripts/prove-live-stack.sh
fi

if [[ "$FEEDS_TEST" -eq 1 ]]; then
  section "Rust live feed fetch"
  RUN_LIVE_FEED_TEST=1 cargo test -p openatlas-ingest registry_feeds_fetch_without_error -- --ignored --nocapture
fi

echo ""
ok "RUNTIME VERIFY OK"
