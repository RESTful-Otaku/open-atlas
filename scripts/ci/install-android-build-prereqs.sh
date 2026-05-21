#!/usr/bin/env bash
# Document Android CI prerequisites. Workflows use actions/setup-java + setup-android;
# this script verifies JDK 21 is active (Capacitor 7 requires --release 21).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/mobile-android-toolchain.sh
source "${ROOT}/scripts/mobile-android-toolchain.sh"
mobile_tc_load_env_file
mobile_tc_ensure_java17

major=""
if [[ -n "${JAVA_HOME:-}" && -x "${JAVA_HOME}/bin/java" ]]; then
  major="$("${JAVA_HOME}/bin/java" -version 2>&1 | head -n1)"
fi
echo "Android build JDK: JAVA_HOME=${JAVA_HOME:-} ($major)"

if [[ ! "${JAVA_HOME:-}" =~ 21 ]]; then
  echo "error: JDK 21 required (Capacitor android --release 21)" >&2
  exit 1
fi
