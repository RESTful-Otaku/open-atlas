#!/usr/bin/env bash
# Start OpenAtlas AVD (default: Pixel 9 Pro), wait for boot, optionally install debug APK.
#
# Usage:
#   ./scripts/mobile-android-emulator.sh              # boot + install APK if present
#   ./scripts/mobile-android-emulator.sh --no-install # boot only (mobile:run)
#   OPENATLAS_AVD_NAME=MyAvd ./scripts/mobile-android-emulator.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
APK="${REPO_ROOT}/web/android/app/build/outputs/apk/debug/app-debug.apk"
SKIP_INSTALL=0
: "${OPENATLAS_AVD_NAME:=OpenAtlas_Pixel_9_Pro}"

for arg in "$@"; do
  case "$arg" in
    --no-install) SKIP_INSTALL=1 ;;
    -h|--help)
      echo "Usage: $0 [--no-install]"
      echo "  OPENATLAS_AVD_NAME  (default: OpenAtlas_Pixel_9_Pro)"
      exit 0
      ;;
  esac
done

# Load persisted toolchain env when present
if [[ -f "${REPO_ROOT}/.dev/android.env" ]]; then
  # shellcheck source=/dev/null
  source "${REPO_ROOT}/.dev/android.env"
fi
# AVDs may live under ~/.config/.android on Linux (not only ~/.android)
: "${ANDROID_AVD_HOME:=${HOME}/.config/.android/avd}"
: "${ANDROID_SDK_HOME:=${HOME}/.config/.android}"
export ANDROID_AVD_HOME ANDROID_SDK_HOME

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "missing: $1 — run: ./dev.sh mobile:doctor" >&2
    exit 1
  }
}

adb_device_ready() {
  adb devices 2>/dev/null | awk 'NR>1 && $2=="device" { found=1 } END { exit !found }'
}

pick_avd() {
  if emulator -list-avds 2>/dev/null | grep -Fxq "$OPENATLAS_AVD_NAME"; then
    printf '%s' "$OPENATLAS_AVD_NAME"
    return 0
  fi
  # Prefer any Pixel 9* AVD, then first available
  local avd
  avd="$(emulator -list-avds 2>/dev/null | grep -E 'Pixel_9|pixel_9|OpenAtlas' | head -n1 || true)"
  if [[ -n "$avd" ]]; then
    printf '%s' "$avd"
    return 0
  fi
  emulator -list-avds 2>/dev/null | head -n1 || true
}

require_cmd emulator
require_cmd adb

if adb_device_ready; then
  echo "Device already connected — skipping emulator start."
  exit 0
fi

AVD="$(pick_avd)"
if [[ -z "$AVD" ]]; then
  echo "No AVD found." >&2
  echo "Run: ./dev.sh run-android   (creates ${OPENATLAS_AVD_NAME})" >&2
  echo "Or:  ./scripts/mobile-android-toolchain.sh bootstrap" >&2
  exit 1
fi

if [[ "$AVD" != "$OPENATLAS_AVD_NAME" ]]; then
  echo "Note: using AVD '${AVD}' (preferred '${OPENATLAS_AVD_NAME}' not found)"
fi

EMU_ARGS=(-avd "$AVD" -no-snapshot-load)
# GPU / KVM when available (Linux)
if [[ "$(uname -s)" == "Linux" ]]; then
  if [[ -r /dev/kvm ]]; then
    EMU_ARGS+=(-gpu host -accel on)
  else
    EMU_ARGS+=(-gpu swiftshader_indirect)
  fi
fi

echo "Starting emulator: $AVD"
emulator "${EMU_ARGS[@]}" >/dev/null 2>&1 &
EMU_PID=$!

cleanup() {
  kill "$EMU_PID" 2>/dev/null || true
}
trap cleanup INT TERM

echo "Waiting for device..."
adb wait-for-device
boot=""
for _ in $(seq 1 180); do
  boot="$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)"
  [[ "$boot" == "1" ]] && break
  sleep 1
done

if [[ "$boot" != "1" ]]; then
  echo "Emulator did not finish booting within 180s" >&2
  kill "$EMU_PID" 2>/dev/null || true
  exit 1
fi

trap - INT TERM
echo "Emulator ready (${AVD})."

if (( SKIP_INSTALL )); then
  exit 0
fi

if [[ -f "$APK" ]]; then
  echo "Installing $APK"
  adb install -r "$APK"
else
  echo "APK not found — run: ./dev.sh run-android"
  echo "  expected: $APK"
fi
