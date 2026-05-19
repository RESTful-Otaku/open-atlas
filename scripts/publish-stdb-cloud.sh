#!/usr/bin/env bash
# Publish openatlas module to SpacetimeDB Cloud (Maincloud).
# Prereq: spacetime login (https://spacetimedb.com/docs/deploying/maincloud)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

STDB_SERVER="${STDB_CLOUD_SERVER:-https://maincloud.spacetimedb.com}"
STDB_DB="${STDB_CLOUD_DB:-openatlas}"
MODULE_PATH="${STDB_MODULE_DIR:-crates/openatlas-stdb-module}"

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "error: '$1' not found — $2" >&2
    exit 1
  }
}

require_cmd spacetime "https://spacetimedb.com/install"

echo "==> SpacetimeDB Cloud publish"
echo "    server:  $STDB_SERVER"
echo "    database: $STDB_DB"
echo "    module:  $MODULE_PATH"
echo ""

if ! spacetime login show >/dev/null 2>&1; then
  echo "Not logged in. Run:"
  echo "  spacetime login"
  exit 1
fi

echo "==> build wasm module"
spacetime build --module-path "$MODULE_PATH"

echo "==> publish (creates or updates database on Maincloud)"
spacetime publish \
  --server "$STDB_SERVER" \
  --module-path "$MODULE_PATH" \
  --yes \
  "$STDB_DB"

echo ""
echo "==> done"
echo ""
echo "Browser (Vite dev) — create web/.env.local with:"
echo "  VITE_STDB_URI=wss://maincloud.spacetimedb.com"
echo "  VITE_STDB_DB=$STDB_DB"
echo ""
echo "Ingest (optional, from any host):"
echo "  export OPENATLAS_STDB_URI=$STDB_SERVER"
echo "  export OPENATLAS_STDB_DB=$STDB_DB"
echo "  export OPENATLAS_INGEST_MODE=sim"
echo "  cargo run -p openatlas-ingest"
echo ""
echo "Then restart: cd web && bun run dev"
echo "Open dashboard without ?demo=1 and use Settings → reconnect if needed."
