#!/usr/bin/env bash
# Build OpenAtlas iOS app (Capacitor) with baked VITE_* env — Maincloud by default.
#
# Usage:
#   OPENATLAS_MOBILE_TARGET=maincloud ./scripts/mobile-build-ios.sh
#   OPENATLAS_MOBILE_VARIANT=release ./scripts/mobile-build-ios.sh   # archive + IPA (needs signing)
#
# Requires macOS + Xcode for xcodebuild. On Linux, only web build + cap sync ios (no .ipa).
# Signed IPA export needs IOS_* secrets — see docs/GITHUB_SECRETS.md
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB="${ROOT}/web"
VARIANT="${OPENATLAS_MOBILE_VARIANT:-debug}"
TARGET="${OPENATLAS_MOBILE_TARGET:-maincloud}"
SCHEME="${OPENATLAS_IOS_SCHEME:-App}"
DIST="${ROOT}/dist/mobile"
ARCHIVE_PATH="${WEB}/ios/build/OpenAtlas.xcarchive"
EXPORT_DIR="${WEB}/ios/build/export"
OUT_IPA="${DIST}/openatlas-maincloud-ios.ipa"
OUT_SIM_ZIP="${DIST}/openatlas-maincloud-ios-simulator.zip"

export OPENATLAS_MOBILE_TARGET="$TARGET"
export MOBILE_ENV_REPO_ROOT="$ROOT"
export MOBILE_ENV_WEB="$WEB"

if [[ "$TARGET" == "maincloud" || "$TARGET" == "cloud" ]]; then
  export OPENATLAS_MOBILE_MAINCLOUD_PHYSICAL="${OPENATLAS_MOBILE_MAINCLOUD_PHYSICAL:-1}"
fi

# shellcheck source=scripts/mobile-env.sh
source "${ROOT}/scripts/mobile-env.sh"

log() { printf '%s\n' "$*"; }
die() { log "error: $*" >&2; exit 1; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "'$1' not found — $2"
}

require_cmd bun "https://bun.sh"

mobile_write_env_local
log "wrote ${WEB}/.env.local (target=${TARGET}, variant=${VARIANT})"
log "LLM on device: Settings → Gemini API key (VITE_NATIVE_DEFAULT_LLM); ingest via Maincloud STDB rows"

if [[ -f "${ROOT}/scripts/sync-brand-assets.sh" ]]; then
  bash "${ROOT}/scripts/sync-brand-assets.sh"
fi

if [[ ! -d "${WEB}/node_modules" ]]; then
  (cd "$WEB" && bun install --frozen-lockfile || bun install)
fi

if [[ ! -d "${WEB}/ios" ]]; then
  log "==> Capacitor add ios (first run)"
  (cd "$WEB" && bunx cap add ios)
fi

if [[ -n "${OPENATLAS_APP_VERSION:-}" ]]; then
  export OPENATLAS_RELEASE_VERSION="${OPENATLAS_APP_VERSION}"
  bash "${ROOT}/scripts/ci/set-native-app-version.sh" 2>/dev/null || true
fi

log "==> Web unit tests"
(cd "$WEB" && bun test src/lib)

log "==> Vite production build"
(cd "$WEB" && bun run build)

log "==> Capacitor sync ios"
(cd "$WEB" && bunx cap sync ios)

if [[ "$(uname -s)" != "Darwin" ]]; then
  log ""
  log "Linux: web bundle synced to web/ios/ — open on a Mac for Xcode archive."
  log "  OPENATLAS_MOBILE_TARGET=maincloud ./scripts/mobile-build-ios.sh  # on macOS"
  exit 0
fi

require_cmd xcodebuild "Xcode CLI tools"
require_cmd xcrun "Xcode"

find_workspace() {
  local w
  w="$(find "${WEB}/ios" -maxdepth 4 -name '*.xcworkspace' 2>/dev/null | head -1 || true)"
  [[ -n "$w" ]] || die "no .xcworkspace under ${WEB}/ios — run: cd web && bunx cap add ios"
  printf '%s' "$w"
}

WORKSPACE="$(find_workspace)"
log "==> Xcode workspace: ${WORKSPACE}"

mkdir -p "$DIST" "${WEB}/ios/build"

log "==> Simulator Release build (compile gate)"
xcodebuild \
  -workspace "$WORKSPACE" \
  -scheme "$SCHEME" \
  -configuration Release \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath "${WEB}/ios/build/DerivedData" \
  CODE_SIGNING_ALLOWED=NO \
  build

SIM_APP="$(find "${WEB}/ios/build/DerivedData" -path '*/Build/Products/Release-iphonesimulator/*.app' -maxdepth 6 2>/dev/null | head -1 || true)"
if [[ -n "$SIM_APP" && -d "$SIM_APP" ]]; then
  (cd "$(dirname "$SIM_APP")" && zip -qr "$OUT_SIM_ZIP" "$(basename "$SIM_APP")")
  log "Simulator .app zip: ${OUT_SIM_ZIP}"
fi

if [[ "$VARIANT" != "release" ]]; then
  log ""
  log "iOS simulator build OK. For device IPA: OPENATLAS_MOBILE_VARIANT=release + iOS signing secrets"
  exit 0
fi

if [[ -z "${IOS_BUILD_CERTIFICATE_BASE64:-}" || -z "${IOS_BUILD_PROVISION_PROFILE_BASE64:-}" ]]; then
  log ""
  log "release variant: no IOS_* signing secrets — simulator build only (see docs/GITHUB_SECRETS.md)"
  exit 0
fi

# shellcheck source=scripts/ci/install-ios-codesign.sh
source "${ROOT}/scripts/ci/install-ios-codesign.sh"

EXPORT_PLIST="${WEB}/ios/build/ExportOptions.plist"
sed "s/__TEAM_ID__/${IOS_TEAM_ID}/g" "${ROOT}/scripts/ci/ios-ExportOptions.plist.template" >"$EXPORT_PLIST"

log "==> Archive (device)"
xcodebuild \
  -workspace "$WORKSPACE" \
  -scheme "$SCHEME" \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE_PATH" \
  DEVELOPMENT_TEAM="$IOS_TEAM_ID" \
  CODE_SIGN_STYLE=Manual \
  PROVISIONING_PROFILE_SPECIFIER="${IOS_PROVISIONING_PROFILE_UUID:-}" \
  archive

log "==> Export IPA"
rm -rf "$EXPORT_DIR"
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportPath "$EXPORT_DIR" \
  -exportOptionsPlist "$EXPORT_PLIST"

IPA_SRC="$(find "$EXPORT_DIR" -maxdepth 2 -name '*.ipa' 2>/dev/null | head -1 || true)"
[[ -n "$IPA_SRC" && -f "$IPA_SRC" ]] || die "IPA not found under ${EXPORT_DIR}"
cp -f "$IPA_SRC" "$OUT_IPA"

log ""
log "IPA ready: ${OUT_IPA}"
log "Install: Apple Configurator / Xcode Devices, or TestFlight after App Store Connect upload"
log "Env baked from: ${WEB}/.env.local"
