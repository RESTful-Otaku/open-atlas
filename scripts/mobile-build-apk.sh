#!/usr/bin/env bash
# Build OpenAtlas Android APK with baked VITE_* env (CI + local release).
# Usage:
#   OPENATLAS_MOBILE_TARGET=maincloud ./scripts/mobile-build-apk.sh
#   OPENATLAS_MOBILE_VARIANT=release ./scripts/mobile-build-apk.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB="${ROOT}/web"
VARIANT="${OPENATLAS_MOBILE_VARIANT:-debug}"
TARGET="${OPENATLAS_MOBILE_TARGET:-maincloud}"

export OPENATLAS_MOBILE_TARGET="$TARGET"
export MOBILE_ENV_REPO_ROOT="$ROOT"
export MOBILE_ENV_WEB="$WEB"

# Phone / CI / production: Maincloud STDB only (no 10.0.2.2 ingest baked in).
if [[ "$TARGET" == "maincloud" || "$TARGET" == "cloud" ]]; then
  export OPENATLAS_MOBILE_MAINCLOUD_PHYSICAL="${OPENATLAS_MOBILE_MAINCLOUD_PHYSICAL:-1}"
fi

# shellcheck source=scripts/mobile-env.sh
source "${ROOT}/scripts/mobile-env.sh"

log() { printf '%s\n' "$*"; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    log "error: '$1' not found — $2" >&2
    exit 1
  }
}

require_cmd bun "https://bun.sh"
require_cmd java "JDK 21 (see ./dev.sh mobile:doctor)"

# Gradle must not use Java 26 (jlink/androidJdkImage fails). Capacitor requires JDK 21.
# shellcheck source=scripts/mobile-android-toolchain.sh
source "${ROOT}/scripts/mobile-android-toolchain.sh"
mobile_tc_load_env_file
mobile_tc_ensure_java17

mobile_write_env_local
log "wrote ${WEB}/.env.capacitor.local (target=${TARGET}, variant=${VARIANT})"

if [[ -f "${ROOT}/scripts/sync-brand-assets.sh" ]]; then
  bash "${ROOT}/scripts/sync-brand-assets.sh"
fi
if [[ -f "${ROOT}/scripts/generate-android-icons.sh" ]] \
  && { command -v magick >/dev/null 2>&1 || command -v convert >/dev/null 2>&1; }; then
  bash "${ROOT}/scripts/generate-android-icons.sh"
fi

if [[ ! -d "${WEB}/node_modules" ]]; then
  (cd "$WEB" && bun install --frozen-lockfile || bun install)
fi

if [[ ! -d "${WEB}/android" ]]; then
  (cd "$WEB" && bunx cap add android)
fi

if [[ -n "${OPENATLAS_APP_VERSION:-}" ]]; then
  export OPENATLAS_RELEASE_VERSION="${OPENATLAS_APP_VERSION}"
  bash "${ROOT}/scripts/ci/set-native-app-version.sh" 2>/dev/null || true
fi

log "==> Vite production build"
(cd "$WEB" && bun run build:cap)

log "==> Capacitor sync android"
(cd "$WEB" && bunx cap sync android)

chmod +x "${WEB}/android/gradlew" 2>/dev/null || true

case "$VARIANT" in
  release)
    GRADLE_TASK="assembleRelease"
    APK_GLOB="${WEB}/android/app/build/outputs/apk/release/app-release-unsigned.apk"
    OUT_NAME="openatlas-maincloud-release-unsigned.apk"
    ;;
  debug|*)
    GRADLE_TASK="assembleDebug"
    APK_GLOB="${WEB}/android/app/build/outputs/apk/debug/app-debug.apk"
    OUT_NAME="openatlas-${TARGET//+/-}-debug.apk"
    ;;
esac

log "==> Gradle ${GRADLE_TASK}"
(
  cd "${WEB}/android"
  ./gradlew "$GRADLE_TASK" --no-daemon
)

APK_SRC=""
for candidate in \
  "${WEB}/android/app/build/outputs/apk/debug/app-debug.apk" \
  "${WEB}/android/app/build/outputs/apk/release/app-release-unsigned.apk" \
  "${WEB}/android/app/build/outputs/apk/release/app-release.apk"; do
  if [[ -f "$candidate" ]]; then
    APK_SRC="$candidate"
    break
  fi
done
[[ -n "$APK_SRC" ]] || APK_SRC="$(ls -1 ${APK_GLOB} 2>/dev/null | head -1 || true)"
if [[ -z "$APK_SRC" || ! -f "$APK_SRC" ]]; then
  log "error: APK not found after ${GRADLE_TASK}" >&2
  exit 1
fi

DIST="${ROOT}/dist/mobile"
mkdir -p "$DIST"
APK_DEST="${DIST}/${OUT_NAME}"
cp -f "$APK_SRC" "$APK_DEST"

log ""
log "APK ready: ${APK_DEST}"
log "Install on phone (USB debugging): adb install -r ${APK_DEST}"
log "Env baked from: ${WEB}/.env.capacitor.local"
