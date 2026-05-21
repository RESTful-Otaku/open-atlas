#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VER="${OPENATLAS_RELEASE_VERSION:?OPENATLAS_RELEASE_VERSION required}"

# shellcheck source=scripts/ci/version-lib.sh
source "${ROOT}/scripts/ci/version-lib.sh"
BUILD_CODE="$(version_build_code "$VER")"

GRADLE="${ROOT}/web/android/app/build.gradle"
if [[ -f "$GRADLE" ]]; then
  sed -i "s/versionName \"[^\"]*\"/versionName \"${VER}\"/" "$GRADLE"
  sed -i "s/versionCode [0-9]*/versionCode ${BUILD_CODE}/" "$GRADLE"
fi

PBX="${ROOT}/web/ios/App/App.xcodeproj/project.pbxproj"
if [[ -f "$PBX" ]]; then
  sed -i "s/MARKETING_VERSION = [^;]*/MARKETING_VERSION = \"${VER}\";/" "$PBX"
  sed -i "s/CURRENT_PROJECT_VERSION = [^;]*/CURRENT_PROJECT_VERSION = ${BUILD_CODE};/" "$PBX"
fi

printf 'Native app version: %s (build %s)\n' "$VER" "$BUILD_CODE"
