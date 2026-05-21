#!/usr/bin/env bash
# OpenAtlas Android toolchain bootstrap — detect, install, configure SDK/JDK/AVD.
# Sourced by dev.sh (do not run standalone unless debugging: ./scripts/mobile-android-toolchain.sh doctor)
#
# Environment:
#   OPENATLAS_AVD_NAME          AVD name (default: OpenAtlas_Pixel_9_Pro)
#   OPENATLAS_ANDROID_AUTO_INSTALL=1  Try to install missing OS packages (default: 1)
#   OPENATLAS_ANDROID_DEVICE_ID   avdmanager device id (default: pixel_9_pro)
#   OPENATLAS_ANDROID_API_LEVEL   System image API (default: 36)
set -euo pipefail

[[ -n "${OPENATLAS_MOBILE_TOOLCHAIN_LOADED:-}" ]] && return 0
OPENATLAS_MOBILE_TOOLCHAIN_LOADED=1

: "${OPENATLAS_AVD_NAME:=OpenAtlas_Pixel_9_Pro}"
: "${OPENATLAS_ANDROID_DEVICE_ID:=pixel_9_pro}"
: "${OPENATLAS_ANDROID_API_LEVEL:=36}"
: "${OPENATLAS_ANDROID_AUTO_INSTALL:=1}"

MOBILE_TC_REPO_ROOT="${MOBILE_TC_REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
MOBILE_TC_ENV_FILE="${MOBILE_TC_REPO_ROOT}/.dev/android.env"
MOBILE_TC_FRONTEND="${MOBILE_TC_REPO_ROOT}/web"

# Logging — use dev.sh helpers when sourced, else plain echo.
_mtc_log() { printf '%s\n' "$*"; }
_mtc_ok()  { printf '✔ %s\n' "$*"; }
_mtc_warn(){ printf '⚠ %s\n' "$*" >&2; }
_mtc_err() { printf '✖ %s\n' "$*" >&2; }
_mtc_header() { printf '\n== %s ==\n\n' "$*"; }

if declare -F style_ok >/dev/null 2>&1; then
  _mtc_log()  { style_muted "$@"; }
  _mtc_ok()   { style_ok "$@"; }
  _mtc_warn() { style_warn "$@"; }
  _mtc_err()  { style_err "$@"; }
  _mtc_header() { style_header "$@"; }
fi

_mtc_has_sudo() { command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; }

_mtc_detect_os() {
  if [[ -f /etc/os-release ]]; then
    # shellcheck source=/dev/null
    . /etc/os-release
    printf '%s' "${ID:-unknown}"
  elif [[ "$(uname -s)" == "Darwin" ]]; then
    printf 'darwin'
  else
    printf 'unknown'
  fi
}

_mtc_find_avd_home() {
  local d
  for d in \
    "${ANDROID_AVD_HOME:-}" \
    "${HOME}/.config/.android/avd" \
    "${HOME}/.android/avd" \
    "${XDG_CONFIG_HOME:-}/.android/avd"; do
    [[ -n "$d" && -d "$d" ]] || continue
    if compgen -G "${d}"/*.ini >/dev/null 2>&1 || compgen -G "${d}/*.ini" >/dev/null 2>&1; then
      printf '%s' "$d"
      return 0
    fi
  done
  # Default location for new AVDs when none exist yet
  printf '%s' "${HOME}/.config/.android/avd"
}

_mtc_find_android_sdk() {
  local d
  for d in \
    "${ANDROID_HOME:-}" \
    "${ANDROID_SDK_ROOT:-}" \
    "${HOME}/Android/Sdk" \
    /opt/android-sdk \
    /usr/lib/android-sdk \
    /usr/local/share/android-sdk; do
    [[ -n "$d" && -d "$d" ]] || continue
    if [[ -d "${d}/platform-tools" || -d "${d}/cmdline-tools" ]]; then
      printf '%s' "$d"
      return 0
    fi
  done
  return 1
}

_mtc_java_major() {
  local java_bin="$1"
  local ver_line major=""
  ver_line="$("$java_bin" -version 2>&1 | head -n1 || true)"
  if [[ "$ver_line" =~ version\ \"([0-9]+) ]]; then
    major="${BASH_REMATCH[1]}"
  elif [[ "$ver_line" =~ version\ \"1\.([0-9]+) ]]; then
    major="${BASH_REMATCH[1]}"
  fi
  printf '%s' "$major"
}

_mtc_find_java_home() {
  # Capacitor 7 compiles with --release 21; Java 26 breaks Gradle jlink. JDK 17 is too old.
  local candidate major=""
  if [[ -n "${JAVA_HOME:-}" && -x "${JAVA_HOME}/bin/java" ]]; then
    major="$(_mtc_java_major "${JAVA_HOME}/bin/java")"
    if [[ "$major" == "21" ]]; then
      printf '%s' "$JAVA_HOME"
      return 0
    fi
  fi
  for candidate in \
    /usr/lib/jvm/java-21-openjdk \
    /usr/lib/jvm/zulu-21 \
    /usr/lib/jvm/jdk-21; do
    [[ -n "$candidate" && -x "${candidate}/bin/java" ]] || continue
    major="$(_mtc_java_major "${candidate}/bin/java")"
    [[ "$major" == "21" ]] && printf '%s' "$candidate" && return 0
  done
  for candidate in /usr/lib/jvm/java-21-* /usr/lib/jvm/zulu-21*; do
    [[ -d "$candidate" && -x "${candidate}/bin/java" ]] || continue
    major="$(_mtc_java_major "${candidate}/bin/java")"
    [[ "$major" == "21" ]] && printf '%s' "$candidate" && return 0
  done
  return 1
}

_mtc_install_os_packages() {
  local os="$1"
  shift
  local pkgs=("$@")
  [[ "${OPENATLAS_ANDROID_AUTO_INSTALL}" == "1" ]] || return 1
  [[ ${#pkgs[@]} -gt 0 ]] || return 0

  _mtc_header "Installing OS packages: ${pkgs[*]}"
  case "$os" in
    arch|manjaro|endeavouros|cachyos|garuda)
      if _mtc_has_sudo; then
        sudo pacman -S --needed --noconfirm "${pkgs[@]}"
      else
        _mtc_warn "Need sudo for: pacman -S --needed ${pkgs[*]}"
        return 1
      fi
      ;;
    debian|ubuntu|pop|linuxmint)
      if _mtc_has_sudo; then
        sudo apt-get update -qq
        sudo DEBIAN_FRONTEND=noninteractive apt-get install -y "${pkgs[@]}"
      else
        _mtc_warn "Need sudo for: apt install ${pkgs[*]}"
        return 1
      fi
      ;;
    fedora|rhel|centos)
      if _mtc_has_sudo; then
        sudo dnf install -y "${pkgs[@]}"
      else
        _mtc_warn "Need sudo for: dnf install ${pkgs[*]}"
        return 1
      fi
      ;;
    darwin)
      if command -v brew >/dev/null 2>&1; then
        brew install "${pkgs[@]}"
      else
        _mtc_warn "Install Homebrew, then: brew install ${pkgs[*]}"
        return 1
      fi
      ;;
    *)
      _mtc_warn "Unknown OS ($os) — install manually: ${pkgs[*]}"
      return 1
      ;;
  esac
}

mobile_tc_ensure_java17() {
  local home
  home="$(_mtc_find_java_home || true)"
  if [[ -z "$home" ]]; then
    local os
    os="$(_mtc_detect_os)"
    case "$os" in
      arch|manjaro|endeavouros|cachyos|garuda)
        _mtc_install_os_packages "$os" jdk21-openjdk jdk17-openjdk || true
        ;;
      debian|ubuntu|pop|linuxmint)
        _mtc_install_os_packages "$os" openjdk-21-jdk openjdk-17-jdk || true
        ;;
      fedora|rhel|centos)
        _mtc_install_os_packages "$os" java-21-openjdk-devel java-17-openjdk-devel || true
        ;;
      darwin)
        _mtc_install_os_packages "$os" openjdk@21 openjdk@17 || true
        ;;
    esac
    home="$(_mtc_find_java_home || true)"
  fi
  if [[ -z "$home" ]]; then
    _mtc_err "JDK 21 required for Capacitor/Android (Java 17 too old; Java 26 breaks Gradle)"
    _mtc_log "Arch:   sudo pacman -S jdk21-openjdk"
    _mtc_log "Debian: sudo apt install openjdk-21-jdk"
    _mtc_log "Then:   export JAVA_HOME=/usr/lib/jvm/java-21-openjdk"
    return 1
  fi
  export JAVA_HOME="$home"
  export PATH="${JAVA_HOME}/bin:${PATH}"
  _mtc_ok "JAVA_HOME=${JAVA_HOME} ($("${JAVA_HOME}/bin/java" -version 2>&1 | head -n1))"
}

mobile_tc_ensure_android_sdk() {
  local sdk
  sdk="$(_mtc_find_android_sdk || true)"
  if [[ -z "$sdk" ]]; then
    local os
    os="$(_mtc_detect_os)"
    case "$os" in
      arch|manjaro|endeavouros|cachyos|garuda)
        # adb + sdkmanager stack on Arch
        _mtc_install_os_packages "$os" android-tools android-sdk android-sdk-platform-tools android-sdk-build-tools || true
        ;;
      debian|ubuntu|pop|linuxmint)
        _mtc_install_os_packages "$os" adb sdkmanager || true
        ;;
    esac
    sdk="$(_mtc_find_android_sdk || true)"
  fi
  if [[ -z "$sdk" ]]; then
    _mtc_err "Android SDK not found — install Android Studio or Arch android-sdk package"
    _mtc_log "Set ANDROID_HOME to your SDK root (contains platform-tools/, emulator/)"
    return 1
  fi
  export ANDROID_HOME="$sdk"
  export ANDROID_SDK_ROOT="$sdk"
  export ANDROID_AVD_HOME="$(_mtc_find_avd_home)"
  export ANDROID_SDK_HOME="${ANDROID_SDK_HOME:-${HOME}/.config/.android}"

  local path_add=()
  [[ -d "${sdk}/platform-tools" ]] && path_add+=("${sdk}/platform-tools")
  [[ -d "${sdk}/emulator" ]] && path_add+=("${sdk}/emulator")
  local ct
  for ct in "${sdk}/cmdline-tools/latest/bin" "${sdk}/cmdline-tools/bin" \
    /opt/android-sdk/cmdline-tools/latest/bin; do
    [[ -d "$ct" ]] && path_add+=("$ct") && break
  done
  local p
  for p in "${path_add[@]}"; do
    case ":${PATH}:" in
      *":${p}:"*) ;;
      *) export PATH="${p}:${PATH}" ;;
    esac
  done
  _mtc_ok "ANDROID_HOME=${ANDROID_HOME}"
}

mobile_tc_sdkmanager_bin() {
  if command -v sdkmanager >/dev/null 2>&1; then
    command -v sdkmanager
    return 0
  fi
  local sdk="${ANDROID_HOME:-}"
  for candidate in \
    "${sdk}/cmdline-tools/latest/bin/sdkmanager" \
    "${sdk}/cmdline-tools/bin/sdkmanager"; do
    if [[ -x "$candidate" ]]; then
      printf '%s' "$candidate"
      return 0
    fi
  done
  return 1
}

mobile_tc_avdmanager_bin() {
  if command -v avdmanager >/dev/null 2>&1; then
    command -v avdmanager
    return 0
  fi
  local sdk="${ANDROID_HOME:-}"
  for candidate in \
    "${sdk}/cmdline-tools/latest/bin/avdmanager" \
    "${sdk}/cmdline-tools/bin/avdmanager"; do
    if [[ -x "$candidate" ]]; then
      printf '%s' "$candidate"
      return 0
    fi
  done
  return 1
}

mobile_tc_accept_licenses() {
  local sm
  sm="$(mobile_tc_sdkmanager_bin || true)"
  [[ -n "$sm" ]] || return 0
  _mtc_log "Accepting Android SDK licenses (if needed)…"
  yes 2>/dev/null | "$sm" --licenses >/dev/null 2>&1 || true
}

mobile_tc_ensure_sdk_packages() {
  local sm api img pkg
  sm="$(mobile_tc_sdkmanager_bin || true)"
  if [[ -z "$sm" ]]; then
    _mtc_warn "sdkmanager not found — skipping SDK package install"
    return 0
  fi
  api="${OPENATLAS_ANDROID_API_LEVEL}"
  img="system-images;android-${api};google_apis;x86_64"
  mobile_tc_accept_licenses
  _mtc_header "Ensuring SDK packages (API ${api})"
  local pkgs=(
    "platform-tools"
    "emulator"
    "platforms;android-35"
    "build-tools;35.0.0"
    "${img}"
  )
  for pkg in "${pkgs[@]}"; do
    if "$sm" --list_installed 2>/dev/null | grep -Fq "$pkg"; then
      _mtc_log "  installed: ${pkg}"
    else
      _mtc_log "  installing: ${pkg}"
      yes 2>/dev/null | "$sm" --install "$pkg" || "$sm" --install "$pkg"
    fi
  done
  _mtc_ok "SDK packages ready"
}

mobile_tc_avd_exists() {
  local name="$1"
  [[ -n "${ANDROID_AVD_HOME:-}" ]] || export ANDROID_AVD_HOME="$(_mtc_find_avd_home)"
  emulator -list-avds 2>/dev/null | grep -Fxq "$name"
}

mobile_tc_ensure_pixel_avd() {
  local avd="${OPENATLAS_AVD_NAME}"
  local avdm img device_id
  if mobile_tc_avd_exists "$avd"; then
    _mtc_ok "AVD exists: ${avd}"
    return 0
  fi
  avdm="$(mobile_tc_avdmanager_bin || true)"
  if [[ -z "$avdm" ]]; then
    _mtc_err "avdmanager not found — cannot create ${avd}"
    return 1
  fi
  device_id="${OPENATLAS_ANDROID_DEVICE_ID}"
  img="system-images;android-${OPENATLAS_ANDROID_API_LEVEL};google_apis;x86_64"
  _mtc_header "Creating AVD ${avd} (${device_id}, ${img})"
  # Ensure system image exists before create
  mobile_tc_ensure_sdk_packages
  echo no | "$avdm" create avd \
    -n "$avd" \
    -k "$img" \
    -d "$device_id" \
    --force
  _mtc_ok "Created AVD: ${avd}"
}

mobile_tc_write_env_file() {
  mkdir -p "$(dirname "$MOBILE_TC_ENV_FILE")"
  cat >"$MOBILE_TC_ENV_FILE" <<EOF
# Generated by scripts/mobile-android-toolchain.sh — safe to regenerate.
export JAVA_HOME="${JAVA_HOME:-}"
export ANDROID_HOME="${ANDROID_HOME:-}"
export ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-$ANDROID_HOME}"
export OPENATLAS_AVD_NAME="${OPENATLAS_AVD_NAME}"
export ANDROID_AVD_HOME="${ANDROID_AVD_HOME:-}"
export ANDROID_SDK_HOME="${ANDROID_SDK_HOME:-}"
export PATH="${JAVA_HOME:+$JAVA_HOME/bin:}${ANDROID_HOME:+$ANDROID_HOME/platform-tools:}${ANDROID_HOME:+$ANDROID_HOME/emulator:}${ANDROID_HOME:+$ANDROID_HOME/cmdline-tools/latest/bin:}${PATH}"
EOF
  _mtc_ok "Wrote ${MOBILE_TC_ENV_FILE}"
}

mobile_tc_load_env_file() {
  if [[ -f "$MOBILE_TC_ENV_FILE" ]]; then
    # shellcheck source=/dev/null
    source "$MOBILE_TC_ENV_FILE"
  fi
}

mobile_android_bootstrap() {
  _mtc_header "Android toolchain bootstrap"
  mobile_tc_load_env_file
  mobile_tc_ensure_java17
  mobile_tc_ensure_android_sdk
  command -v adb >/dev/null 2>&1 || {
    _mtc_err "adb not on PATH — install platform-tools"
    return 1
  }
  command -v emulator >/dev/null 2>&1 || {
    _mtc_err "emulator not on PATH — install Android emulator package"
    return 1
  }
  mobile_tc_ensure_sdk_packages
  mobile_tc_ensure_pixel_avd
  mobile_tc_write_env_file
  _mtc_ok "Android toolchain ready (AVD: ${OPENATLAS_AVD_NAME})"
}

mobile_android_doctor() {
  _mtc_header "Android toolchain doctor"
  local ok=0
  mobile_tc_load_env_file
  if mobile_tc_ensure_java17; then :; else ok=1; fi
  if mobile_tc_ensure_android_sdk; then :; else ok=1; fi
  for cmd in adb emulator java; do
    if command -v "$cmd" >/dev/null 2>&1; then
      _mtc_ok "command: $cmd ($(command -v "$cmd"))"
    else
      _mtc_err "missing: $cmd"
      ok=1
    fi
  done
  if mobile_tc_sdkmanager_bin >/dev/null 2>&1; then
    _mtc_ok "sdkmanager: $(mobile_tc_sdkmanager_bin)"
  else
    _mtc_warn "sdkmanager not found"
  fi
  _mtc_log "AVDs:"
  emulator -list-avds 2>/dev/null | sed 's/^/  /' || _mtc_warn "  (none)"
  if mobile_tc_avd_exists "${OPENATLAS_AVD_NAME}"; then
    _mtc_ok "target AVD: ${OPENATLAS_AVD_NAME}"
  else
    _mtc_warn "target AVD missing: ${OPENATLAS_AVD_NAME} (run ./dev.sh run-android)"
    ok=1
  fi
  adb devices 2>/dev/null | tail -n +2 | sed 's/^/  /' || true
  return "$ok"
}

# Allow: ./scripts/mobile-android-toolchain.sh doctor|bootstrap
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  case "${1:-doctor}" in
    bootstrap) mobile_android_bootstrap ;;
    doctor|*)  mobile_android_doctor; exit $? ;;
    *) echo "Usage: $0 {bootstrap|doctor}" >&2; exit 2 ;;
  esac
fi
