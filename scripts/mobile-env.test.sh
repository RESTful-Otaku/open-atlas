#!/usr/bin/env bash
# Quick checks for scripts/mobile-env.sh target wiring.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB="${ROOT}/web"
TMP_WEB="${ROOT}/.dev/mobile-env-test-web"
rm -rf "$TMP_WEB"
mkdir -p "$TMP_WEB"

# shellcheck source=scripts/mobile-env.sh
source "${ROOT}/scripts/mobile-env.sh"

MOBILE_ENV_WEB="$TMP_WEB"

assert_file_contains() {
  local file="$1"
  local needle="$2"
  grep -qF "$needle" "$file" || {
    echo "FAIL: expected '$needle' in $file" >&2
    cat "$file" >&2
    exit 1
  }
}

OPENATLAS_MOBILE_TARGET=maincloud-emulator
mobile_write_env_local
assert_file_contains "${TMP_WEB}/.env.capacitor.local" "wss://maincloud.spacetimedb.com"
assert_file_contains "${TMP_WEB}/.env.capacitor.local" "VITE_INGEST_BASE=http://10.0.2.2:8080"
assert_file_contains "${TMP_WEB}/.env.capacitor.local" "VITE_NATIVE_DEFAULT_LLM=gemini"

OPENATLAS_MOBILE_TARGET=emulator
mobile_write_env_local
assert_file_contains "${TMP_WEB}/.env.capacitor.local" "ws://10.0.2.2:3000"

OPENATLAS_MOBILE_TARGET=maincloud
export OPENATLAS_MOBILE_MAINCLOUD_PHYSICAL=1
mobile_write_env_local
assert_file_contains "${TMP_WEB}/.env.capacitor.local" "wss://maincloud.spacetimedb.com"
if grep -q 'VITE_INGEST_BASE' "${TMP_WEB}/.env.capacitor.local" 2>/dev/null; then
  echo "FAIL: physical maincloud must not bake ingest base" >&2
  exit 1
fi

rm -rf "$TMP_WEB"
echo "mobile-env.test.sh: ok"
