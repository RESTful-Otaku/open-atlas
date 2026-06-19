#!/usr/bin/env bash
# OpenAtlas dev harness.
#
# Provides a single entry point for building, running, observing, and tearing
# down the OpenAtlas stack locally. Uses charmbracelet/gum for a polished TUI
# when available and falls back to plain bash output otherwise.
#
# Usage:
#   ./dev.sh                 Short interactive menu (install gum for a nicer TUI)
#   ./dev.sh <command>       Non-interactive: run  up  down  web (partial)  check
#   ./dev.sh help            Command list
#
# All long-running state (PID file, log file) lives under .dev/.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Gitignored .env / .dev/local.env / feed-secrets.json (see docs/CONFIG.md).
# shellcheck source=scripts/load-local-env.sh
source "${SCRIPT_DIR}/scripts/load-local-env.sh"

# ----------------------------------------------------------------------------
# Configuration (override via environment variables before invoking)
# ----------------------------------------------------------------------------
: "${DEV_DIR:=.dev}"
: "${PID_FILE:=${DEV_DIR}/server.pid}"
: "${LOG_FILE:=${DEV_DIR}/server.log}"
: "${HEALTH_URL:=http://localhost:8080/health}"
: "${READY_URL:=http://localhost:8080/ready}"
: "${STATUS_URL:=http://localhost:8080/status}"
: "${DASHBOARD_URL:=http://localhost:5173}"
: "${FRONTEND_DIR:=web}"
: "${FRONTEND_DIST_DIR:=${FRONTEND_DIR}/dist}"
: "${FRONTEND_PID_FILE:=${DEV_DIR}/vite.pid}"
: "${FRONTEND_LOG_FILE:=${DEV_DIR}/vite.log}"
: "${VITE_READY_URL:=http://127.0.0.1:5173/}"
: "${VITE_READY_TIMEOUT_SECS:=90}"
: "${CARGO_HOME_LOCAL:=${SCRIPT_DIR}/.cargo-local}"
: "${READY_TIMEOUT_SECS:=90}"
: "${INGEST_BIN:=${SCRIPT_DIR}/target/debug/openatlas-ingest}"

# SpacetimeDB local-instance configuration. Matches the defaults the
# `spacetime` CLI ships with so `spacetime call` / `spacetime sql` against
# `localhost:3000` works without extra flags.
: "${STDB_MODULE_DIR:=crates/openatlas-stdb-module}"
: "${STDB_DB_NAME:=openatlas}"
: "${STDB_LISTEN_ADDR:=127.0.0.1:3000}"
: "${STDB_PID_FILE:=${DEV_DIR}/spacetime.pid}"
: "${STDB_LOG_FILE:=${DEV_DIR}/spacetime.log}"
: "${STDB_DATA_DIR:=${DEV_DIR}/spacetime-data}"
: "${STDB_READY_TIMEOUT_SECS:=30}"

# SpacetimeDB Cloud (Maincloud) — used when OPENATLAS_STDB_TARGET=cloud
: "${STDB_CLOUD_SERVER:=https://maincloud.spacetimedb.com}"
: "${STDB_CLOUD_WS:=wss://maincloud.spacetimedb.com}"
: "${STDB_CLOUD_DB:=openatlas}"

# `openatlas-llm-bridge` (→ Ollama). Must match Vite's proxy in `web/vite.config.ts`.
# Set OPENATLAS_START_LLM=0 to skip auto-starting the bridge (Settings hub AI
# analysis will be unavailable until you run it manually).
# Set OPENATLAS_START_OLLAMA=0 to skip auto-starting Ollama (bridge still starts).
# CPU-only Ollama (default; set OPENATLAS_OLLAMA_CPU=0 to re-enable GPU).
: "${LLM_LISTEN_ADDR:=127.0.0.1:3847}"
: "${LLM_PID_FILE:=${DEV_DIR}/llm-bridge.pid}"
: "${LLM_LOG_FILE:=${DEV_DIR}/llm-bridge.log}"
: "${LLM_HEALTH_URL:=http://${LLM_LISTEN_ADDR}/health}"
: "${LLM_READY_TIMEOUT_SECS:=90}"
: "${OPENATLAS_START_OLLAMA:=1}"
: "${OPENATLAS_OLLAMA_AUTO_PULL:=1}"
: "${OPENATLAS_OLLAMA_CPU:=1}"
: "${OLLAMA_PID_FILE:=${DEV_DIR}/ollama.pid}"
: "${OLLAMA_LOG_FILE:=${DEV_DIR}/ollama.log}"
: "${OLLAMA_READY_TIMEOUT_SECS:=60}"

mkdir -p "$DEV_DIR"

# Anchor .dev paths to repo root (start_frontend_dev cds into web/ before writing pid/log).
abs_repo_path() {
    local p="$1"
    if [[ "$p" == /* ]]; then
        printf '%s' "$p"
    else
        printf '%s/%s' "$SCRIPT_DIR" "$p"
    fi
}
PID_FILE="$(abs_repo_path "$PID_FILE")"
LOG_FILE="$(abs_repo_path "$LOG_FILE")"
STDB_PID_FILE="$(abs_repo_path "$STDB_PID_FILE")"
STDB_LOG_FILE="$(abs_repo_path "$STDB_LOG_FILE")"
LLM_PID_FILE="$(abs_repo_path "$LLM_PID_FILE")"
LLM_LOG_FILE="$(abs_repo_path "$LLM_LOG_FILE")"
OLLAMA_PID_FILE="$(abs_repo_path "$OLLAMA_PID_FILE")"
OLLAMA_LOG_FILE="$(abs_repo_path "$OLLAMA_LOG_FILE")"
FRONTEND_PID_FILE="$(abs_repo_path "$FRONTEND_PID_FILE")"
FRONTEND_LOG_FILE="$(abs_repo_path "$FRONTEND_LOG_FILE")"

# Route cargo through the workspace-local cache so sandboxed runs do not hit a
# read-only $HOME.
if [[ -z "${CARGO_HOME:-}" ]]; then
    export CARGO_HOME="$CARGO_HOME_LOCAL"
fi

# ----------------------------------------------------------------------------
# Style helpers (gum-aware)
# ----------------------------------------------------------------------------
has_gum() { command -v gum >/dev/null 2>&1; }

if has_gum; then
    style_header() {
        gum style --border double --border-foreground 212 \
            --padding "1 3" --margin "1 0" --bold --foreground 212 "$@"
    }
    style_info()  { gum style --foreground 39  "$@"; }
    style_warn()  { gum style --foreground 214 "$@"; }
    style_err()   { gum style --foreground 196 --bold "$@"; }
    style_ok()    { gum style --foreground 46  --bold "$@"; }
    style_muted() { gum style --faint "$@"; }
    spin() {
        local title="$1"
        shift
        gum spin --spinner dot --title "$title" -- "$@"
    }
    confirm() { gum confirm "$1"; }
    ask()     { gum input --placeholder "$2" --prompt "$1 > "; }
    choose()  { gum choose --height 20 --cursor "▶ " "$@"; }
else
    style_header() { printf "\n\033[1;35m== %s ==\033[0m\n\n" "$*"; }
    style_info()   { printf "\033[36mℹ %s\033[0m\n" "$*"; }
    style_warn()   { printf "\033[33m⚠ %s\033[0m\n" "$*"; }
    style_err()    { printf "\033[1;31m✖ %s\033[0m\n" "$*" >&2; }
    style_ok()     { printf "\033[1;32m✔ %s\033[0m\n" "$*"; }
    style_muted()  { printf "\033[2m%s\033[0m\n" "$*"; }
    spin() {
        local title="$1"
        shift
        printf "... %s\n" "$title"
        "$@"
    }
    confirm() {
        local reply
        read -r -p "$1 [y/N] " reply
        [[ "$reply" =~ ^[Yy]$ ]]
    }
    ask() {
        local reply
        read -r -p "$1 [$2]: " reply
        printf '%s' "$reply"
    }
    choose() {
        local idx=1
        local line
        for line in "$@"; do
            printf '  [%d] %s\n' "$idx" "$line"
            idx=$((idx + 1))
        done
        local reply
        read -r -p "Choose a number: " reply
        if [[ "$reply" =~ ^[0-9]+$ ]] && (( reply >= 1 && reply <= $# )); then
            eval "printf '%s' \"\${$reply}\""
        fi
    }
fi

# ----------------------------------------------------------------------------
# Banner / status
# ----------------------------------------------------------------------------
print_banner() {
    clear
    style_header "🌍 OpenAtlas dev harness"
    style_muted "Real-time planetary intelligence — build, run, observe."
    echo
}

prune_stale_server_pid() {
    [[ -f "$PID_FILE" ]] || return 0
    local pid
    pid="$(cat "$PID_FILE" 2>/dev/null || true)"
    if [[ -n "${pid:-}" ]] && ! kill -0 "$pid" 2>/dev/null; then
        rm -f "$PID_FILE"
    fi
}

ingest_http_ok() {
    require_cmd curl
    curl -sf "$HEALTH_URL" >/dev/null 2>&1
}

ensure_ingest_binary() {
    if [[ -x "$INGEST_BIN" ]]; then
        return 0
    fi
    require_cmd cargo
    style_muted "compiling openatlas-ingest (first run can take ~1–2 min)…"
    cargo build -p openatlas-ingest -q
}

# When a Capacitor build baked a LAN ingest URL, listen on all interfaces for phones.
maybe_enable_ingest_lan_bind() {
    local cap="${FRONTEND_DIR}/.env.capacitor.local"
    [[ -f "$cap" ]] || return 0
    if grep -qE 'VITE_INGEST_BASE=http://(10\.0\.2\.2|[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+):8080' "$cap" 2>/dev/null; then
        export OPENATLAS_INGEST_LAN_BIND=1
        style_muted "Ingest LAN/emulator bind enabled (0.0.0.0:8080 — see .env.capacitor.local)"
    fi
}

# ----------------------------------------------------------------------------
# Deployment profile resolution (mirrors mobile-runtime-config.ts)
# Maps 11 GUI deployment profiles + custom to dev.sh parameters.
# CLI accepts kebab-case or snake_case: local-sim == local_sim
# ----------------------------------------------------------------------------

resolve_profile_id() {
  local p="$1"
  p="${p//-/_}"
  case "$p" in
    demo|cloud_live|cloud_ingest_sim|cloud_ingest_live|cloud_ingest_hybrid|cloud_lan_ingest|local_sim|local_live|local_hybrid|local_lan|local_emulator|custom)
      printf '%s' "$p"
      return 0
      ;;
    *)
      style_err "Unknown deployment profile: $1"
      style_muted "Valid: demo, cloud-live, cloud-ingest-sim, cloud-ingest-live, cloud-ingest-hybrid,"
      style_muted "       local-sim, local-live, local-hybrid, local-lan, local-emulator, custom"
      return 1
      ;;
  esac
}

profile_label() {
  case "$1" in
    demo)                  printf "Demo" ;;
    cloud_live)            printf "Cloud live" ;;
    cloud_ingest_sim)      printf "Cloud + LAN ingest (sim)" ;;
    cloud_ingest_live)     printf "Cloud + LAN ingest (live)" ;;
    cloud_ingest_hybrid)   printf "Cloud + LAN ingest (hybrid)" ;;
    cloud_lan_ingest)      printf "Cloud + LAN ingest (hybrid, old)" ;;
    local_sim)             printf "Local STDB (sim)" ;;
    local_live)            printf "Local STDB (live)" ;;
    local_hybrid)          printf "Local STDB (hybrid)" ;;
    local_lan)             printf "Local STDB (LAN)" ;;
    local_emulator)        printf "Local STDB (emulator)" ;;
    custom)                printf "Custom" ;;
  esac
}

profile_to_params() {
  case "$1" in
    demo)                printf "none none 0" ;;
    cloud_live)          printf "cloud none 0" ;;
    cloud_ingest_sim|cloud_lan_ingest)  printf "cloud sim 1" ;;
    cloud_ingest_live)   printf "cloud live 1" ;;
    cloud_ingest_hybrid) printf "cloud hybrid 1" ;;
    local_sim)           printf "local sim 0" ;;
    local_live)          printf "local live 0" ;;
    local_hybrid)        printf "local hybrid 0" ;;
    local_lan)           printf "local live 1" ;;
    local_emulator)      printf "local hybrid 1" ;;
    custom)              printf "custom custom 0" ;;
  esac
}

do_up_by_profile() {
  local profile
  profile="$(resolve_profile_id "$1")" || return 1
  local -a params
  IFS=' ' read -ra params <<< "$(profile_to_params "$profile")"
  local stdb_target="${params[0]}"
  local ingest_mode="${params[1]}"
  local needs_lan="${params[2]}"

  style_header "Profile: $(profile_label "$profile")"

  if [[ "$needs_lan" == "1" ]]; then
    export OPENATLAS_INGEST_LAN_BIND=1
  fi

  case "$profile" in
    demo)
      do_dev_frontend_demo
      do_open_dashboard
      ;;
    cloud_live)
      cloud_preflight || return 1
      start_frontend_dev cloud || return 1
      do_open_dashboard
      ;;
    custom)
      if [[ -z "${OPENATLAS_STDB_TARGET:-}" ]]; then
        style_err "Custom profile requires OPENATLAS_STDB_TARGET (local|cloud)"
        return 1
      fi
      local mode="${OPENATLAS_INGEST_MODE:-hybrid}"
      ensure_stack_for_run "$OPENATLAS_STDB_TARGET" "$mode"
      start_frontend_dev "$OPENATLAS_STDB_TARGET" || return 1
      do_open_dashboard
      ;;
    *)
      ensure_stack_for_run "$stdb_target" "$ingest_mode"
      start_frontend_dev "$stdb_target" || return 1
      do_open_dashboard
      ;;
  esac
  style_ok "Profile $(profile_label "$profile") running — ${DASHBOARD_URL}"
}

do_start_by_profile() {
  local profile
  profile="$(resolve_profile_id "$1")" || return 1
  local -a params
  IFS=' ' read -ra params <<< "$(profile_to_params "$profile")"
  local stdb_target="${params[0]}"
  local ingest_mode="${params[1]}"
  local needs_lan="${params[2]}"

  if [[ "$needs_lan" == "1" ]]; then
    export OPENATLAS_INGEST_LAN_BIND=1
  fi

  case "$profile" in
    demo)
      style_warn "Demo profile has no backend (run: ./dev.sh web:demo)"
      return 1
      ;;
    cloud_live)
      style_warn "Cloud live profile has no local backend (STDB is on Maincloud)"
      cloud_preflight || return 1
      style_muted "Run: ./dev.sh web:cloud  for the frontend"
      return 0
      ;;
    custom)
      if [[ -z "${OPENATLAS_STDB_TARGET:-}" || -z "${OPENATLAS_INGEST_MODE:-}" ]]; then
        style_err "Custom profile requires OPENATLAS_STDB_TARGET and OPENATLAS_INGEST_MODE"
        return 1
      fi
      start_server "$OPENATLAS_INGEST_MODE" "$OPENATLAS_STDB_TARGET"
      ;;
    *)
      start_server "$ingest_mode" "$stdb_target"
      ;;
  esac
}

server_pid() {
    prune_stale_server_pid
    [[ -f "$PID_FILE" ]] || return 1
    local pid
    pid="$(cat "$PID_FILE" 2>/dev/null || true)"
    [[ -n "${pid:-}" ]] && kill -0 "$pid" 2>/dev/null && printf '%s' "$pid"
}

stdb_pid() {
    [[ -f "$STDB_PID_FILE" ]] || return 1
    local pid
    pid="$(cat "$STDB_PID_FILE" 2>/dev/null || true)"
    [[ -n "${pid:-}" ]] && kill -0 "$pid" 2>/dev/null && printf '%s' "$pid"
}

print_status_line() {
    local pid uri mode
    if pid="$(stdb_pid)"; then
        style_ok "● spacetimedb local (pid=${pid}, ${STDB_LISTEN_ADDR})"
    else
        style_warn "○ spacetimedb local not running"
    fi
    if pid="$(server_pid)" && ingest_http_ok; then
        uri="$(current_ingest_stdb_uri)"
        mode="$(ingest_mode_running)"
        if is_cloud_stdb_uri "$uri"; then
            style_ok "● ingest → cloud ${STDB_CLOUD_DB} (pid=${pid}, mode=${mode:-?})"
        else
            style_ok "● ingest → local ${STDB_DB_NAME} (pid=${pid}, mode=${mode:-?})"
        fi
    elif pid="$(server_pid)"; then
        style_warn "○ ingest pid ${pid} but HTTP unhealthy (./dev.sh start)"
    else
        style_warn "○ ingest not running"
    fi
    if pid="$(frontend_dev_pid)"; then
        style_ok "● vite dev (pid=${pid}, ${DASHBOARD_URL})"
    else
        style_warn "○ vite dev not running"
    fi
    if [[ -d "$FRONTEND_DIST_DIR" ]]; then
        style_muted "  dist/ present (production build)"
    fi
    if ollama_api_ok "$(ollama_host_from_base "${OPENATLAS_OLLAMA_BASE:-http://127.0.0.1:11434}")"; then
        style_ok "● Ollama API (${OPENATLAS_OLLAMA_BASE:-http://127.0.0.1:11434})"
    else
        style_warn "○ Ollama not reachable (./dev.sh ollama:start or ollama serve)"
    fi
    if pid="$(llm_bridge_pid)"; then
        style_ok "● openatlas-llm-bridge running (pid=${pid}, http://${LLM_LISTEN_ADDR})"
    else
        style_warn "○ LLM bridge not running (./dev.sh llm:start or set OPENATLAS_START_LLM=1 with ./dev.sh start)"
    fi
    if has_gum; then
        style_muted "tip: press q inside menus to cancel."
    fi
    echo
}

# ----------------------------------------------------------------------------
# Prerequisite checks
# ----------------------------------------------------------------------------
require_cmd() {
    local cmd="$1"
    local hint="${2:-install it and retry}"
    if ! command -v "$cmd" >/dev/null 2>&1; then
        style_err "missing required command: $cmd ($hint)"
        exit 1
    fi
}

# ----------------------------------------------------------------------------
# Build
# ----------------------------------------------------------------------------
# node_modules/ can exist but be stale (e.g. Capacitor added to package.json later).
frontend_deps_ok() {
    [[ -d "${FRONTEND_DIR}/node_modules/@capacitor/core" ]] \
        && [[ -d "${FRONTEND_DIR}/node_modules/spacetimedb" ]] \
        && [[ -d "${FRONTEND_DIR}/node_modules/svelte" ]]
}

install_frontend_deps() {
    require_cmd bun "install from https://bun.sh"
    spin "bun install (${FRONTEND_DIR})" bash -c "cd '${FRONTEND_DIR}' && bun install --silent"
}

do_build_frontend() {
    require_cmd bun "install from https://bun.sh"
    sync_brand_assets
    style_header "🔨 Building Svelte frontend (bun)"
    if ! frontend_deps_ok; then
        install_frontend_deps
    fi
    spin "bun run build (${FRONTEND_DIR})" bash -c "cd '${FRONTEND_DIR}' && bun run build"
    style_ok "frontend bundle written to ${FRONTEND_DIST_DIR}/"
}

# ----------------------------------------------------------------------------
# Capacitor mobile (Android / iOS)
# ----------------------------------------------------------------------------

# shellcheck source=scripts/mobile-android-toolchain.sh
source "${SCRIPT_DIR}/scripts/mobile-android-toolchain.sh"
# shellcheck source=scripts/mobile-env.sh
source "${SCRIPT_DIR}/scripts/mobile-env.sh"

mobile_ensure_deps() {
    require_cmd bun "install from https://bun.sh"
    if ! frontend_deps_ok; then
        install_frontend_deps
    fi
}

mobile_ensure_android_project() {
    if [[ ! -d "${FRONTEND_DIR}/android" ]]; then
        style_header "📱 Adding Capacitor Android project"
        spin "cap add android" bash -c "cd '${FRONTEND_DIR}' && bunx cap add android"
    fi
}

sync_brand_assets() {
    if [[ -f "${SCRIPT_DIR}/scripts/sync-brand-assets.sh" ]]; then
        bash "${SCRIPT_DIR}/scripts/sync-brand-assets.sh"
    fi
}

mobile_generate_icons() {
    sync_brand_assets
    if [[ -f "${SCRIPT_DIR}/scripts/generate-android-icons.sh" ]]; then
        bash "${SCRIPT_DIR}/scripts/generate-android-icons.sh"
    fi
}

do_mobile_setup() {
    mobile_ensure_deps
    mobile_android_bootstrap
    mobile_ensure_android_project
    mobile_generate_icons
    if [[ -f "${FRONTEND_DIR}/.env.mobile.example" ]] && [[ ! -f "${FRONTEND_DIR}/.env.capacitor.example" ]]; then
        cp "${FRONTEND_DIR}/.env.mobile.example" "${FRONTEND_DIR}/.env.capacitor.example"
        style_muted "created ${FRONTEND_DIR}/.env.capacitor.example — run-android writes .env.capacitor.local automatically"
    fi
    do_mobile_build
    style_ok "mobile setup complete — see docs/MOBILE.md"
}

mobile_cap_build() {
    require_cmd bun "install from https://bun.sh"
    sync_brand_assets
    if ! frontend_deps_ok; then
        install_frontend_deps
    fi
    spin "bun run build:cap (${FRONTEND_DIR})" bash -c "cd '${FRONTEND_DIR}' && bun run build:cap"
    style_ok "Capacitor bundle written to ${FRONTEND_DIST_DIR}/ (mode=capacitor, .env.capacitor.local)"
}

do_mobile_build() {
    mobile_ensure_deps
    mobile_ensure_android_project
    mobile_ensure_env_file
    mobile_cap_build
    spin "cap sync" bash -c "cd '${FRONTEND_DIR}' && bunx cap sync"
    style_ok "Capacitor sync complete (web/dist → native projects)"
}

mobile_print_cap_env_summary() {
    local cap="${FRONTEND_DIR}/.env.capacitor.local"
    [[ -f "$cap" ]] || return 0
    style_muted "Baked into APK (web/.env.capacitor.local):"
    grep -E '^VITE_' "$cap" 2>/dev/null | while IFS= read -r line; do
        style_muted "  ${line}"
    done
}

mobile_ensure_cloud_ingest_running() {
    if curl -sf --max-time 2 "http://127.0.0.1:8080/health" >/dev/null 2>&1; then
        style_ok "Host ingest already running on :8080 (emulator → 10.0.2.2:8080)"
        return 0
    fi
    style_header "Starting Maincloud live ingest (LAN bind for emulator/APK)"
    export OPENATLAS_INGEST_LAN_BIND=1
    export OPENATLAS_STDB_TARGET=cloud
    start_server live cloud || {
        style_err "Could not start ingest — live feeds and ingest probes will fail in the app"
        style_muted "Manual: OPENATLAS_INGEST_LAN_BIND=1 ./dev.sh start:cloud:live"
        return 1
    }
}

mobile_preflight_emulator_ingest() {
    local cap="${FRONTEND_DIR}/.env.capacitor.local"
    [[ -f "$cap" ]] || return 0
    grep -q 'VITE_INGEST_BASE=http://10.0.2.2:8080' "$cap" 2>/dev/null || return 0
    if curl -sf --max-time 2 "http://127.0.0.1:8080/health" >/dev/null 2>&1; then
        style_ok "Host ingest reachable on :8080 (emulator will use 10.0.2.2:8080)"
        return 0
    fi
    style_warn "Host ingest not reachable on :8080 — start Maincloud ingest in another terminal:"
    style_muted "  OPENATLAS_INGEST_LAN_BIND=1 ./dev.sh start:cloud:live"
    style_muted "  (or full stack: ./dev.sh run:cloud:live then re-run this mobile build)"
}

do_mobile_android() {
    mobile_android_bootstrap
    do_mobile_build
    style_header "🤖 Assembling Android debug APK"
    (
        cd "${FRONTEND_DIR}/android"
        chmod +x gradlew 2>/dev/null || true
        ./gradlew assembleDebug
    )
    local apk="${FRONTEND_DIR}/android/app/build/outputs/apk/debug/app-debug.apk"
    style_ok "APK: ${apk}"
    style_muted "Install: adb install -r ${apk}"
    if command -v adb >/dev/null 2>&1; then
        if confirm "Install APK on connected device/emulator now?"; then
            adb install -r "$apk" || style_warn "adb install failed — start an emulator or connect USB"
        fi
    fi
}

do_mobile_android_release() {
    do_mobile_build
    mobile_ensure_java17
    style_header "🤖 Assembling Android release APK (unsigned)"
    (
        cd "${FRONTEND_DIR}/android"
        chmod +x gradlew 2>/dev/null || true
        ./gradlew assembleRelease
    )
    style_ok "Release APK: ${FRONTEND_DIR}/android/app/build/outputs/apk/release/"
    style_muted "Sign with your keystore before Play Store upload — see docs/MOBILE.md"
}

do_mobile_dev() {
    mobile_ensure_deps
    export OPENATLAS_MOBILE_TARGET="${OPENATLAS_MOBILE_TARGET:-maincloud-emulator}"
    mobile_ensure_env_file
    local cap_url="${CAPACITOR_SERVER_URL:-http://10.0.2.2:5173}"
    style_header "📱 Capacitor live reload → ${cap_url}"
    style_muted "Vite --mode capacitor (reads .env.capacitor.local). Physical USB device: CAPACITOR_SERVER_URL=http://$(mobile_lan_ip 2>/dev/null || echo LAN_IP):5173"
    mobile_preflight_emulator_ingest
    (
        cd "${FRONTEND_DIR}"
        export CAPACITOR_SERVER_URL="$cap_url"
        bunx cap sync android
        bun run dev -- --mode capacitor --host
    ) &
    local vite_pid=$!
    sleep 3
    (cd "${FRONTEND_DIR}" && bunx cap run android) \
        || style_warn "cap run android failed — open Android Studio via ./dev.sh mobile:android after build"
    wait "$vite_pid" 2>/dev/null || true
}

mobile_adb_device_ready() {
    adb devices 2>/dev/null | awk 'NR>1 && $2=="device" { found=1 } END { exit !found }'
}

mobile_ensure_java17() {
    mobile_tc_ensure_java17
}

mobile_ensure_android_sdk() {
    mobile_tc_ensure_android_sdk
}

do_mobile_doctor() {
    mobile_android_doctor
}

mobile_ensure_env_file() {
    MOBILE_ENV_REPO_ROOT="$SCRIPT_DIR"
    MOBILE_ENV_WEB="$FRONTEND_DIR"
    local target
    target="$(mobile_resolve_target)"
    style_muted "mobile build target: ${target} (override: OPENATLAS_MOBILE_TARGET=maincloud-emulator|emulator|maincloud|device)"
    mobile_write_env_local
    maybe_enable_ingest_lan_bind
    style_ok "wrote ${FRONTEND_DIR}/.env.capacitor.local for Capacitor bundle"
    mobile_print_cap_env_summary
}

do_mobile_run() {
    local forced_target="${1:-${OPENATLAS_MOBILE_TARGET:-maincloud-emulator}}"
    export OPENATLAS_MOBILE_TARGET="$forced_target"
    style_header "📱 Run Android — target=${forced_target} (bootstrap → test → emulator → env → build → install)"
    mobile_ensure_deps
    mobile_ensure_android_project

    style_header "0/9 Toolchain bootstrap (JDK, SDK, Pixel 9 Pro AVD)"
    mobile_android_bootstrap
    mobile_generate_icons
    if [[ -f "${SCRIPT_DIR}/.dev/android.env" ]]; then
        # shellcheck source=/dev/null
        source "${SCRIPT_DIR}/.dev/android.env"
    fi

    local step=1
    if [[ "${OPENATLAS_MOBILE_SKIP_TESTS:-0}" != "1" ]]; then
        style_header "${step}/9 Unit tests (fail fast)"
        spin "bun test src/lib" bash -c "cd '${FRONTEND_DIR}' && bun test src/lib"
        step=$((step + 1))
    else
        style_muted "Skipping unit tests (OPENATLAS_MOBILE_SKIP_TESTS=1)"
    fi

    style_header "${step}/9 Device / emulator (${OPENATLAS_AVD_NAME})"
    require_cmd adb "install platform-tools (Android SDK)"
    if ! mobile_adb_device_ready; then
        style_muted "No adb device — starting ${OPENATLAS_AVD_NAME}"
        bash "${SCRIPT_DIR}/scripts/mobile-android-emulator.sh" --no-install
    else
        style_ok "adb device connected ($(adb devices 2>/dev/null | awk 'NR>1 && $2=="device" { print $1; exit }'))"
    fi
    step=$((step + 1))

    mobile_ensure_env_file
    mobile_preflight_emulator_ingest

    style_header "${step}/9 Vite Capacitor build (bun run build:cap)"
    mobile_cap_build
    step=$((step + 1))

    style_header "${step}/9 Capacitor sync"
    spin "cap sync android" bash -c "cd '${FRONTEND_DIR}' && bunx cap sync android"
    step=$((step + 1))

    style_header "${step}/9 Gradle assembleDebug"
    mobile_ensure_java17
    (
        cd "${FRONTEND_DIR}/android"
        chmod +x gradlew 2>/dev/null || true
        ./gradlew assembleDebug --no-daemon
    )
    step=$((step + 1))

    local apk="${FRONTEND_DIR}/android/app/build/outputs/apk/debug/app-debug.apk"
    if [[ ! -f "$apk" ]]; then
        style_err "APK missing: ${apk}"
        exit 1
    fi

    style_header "${step}/9 adb install"
    adb install -r "$apk"
    step=$((step + 1))

    style_header "${step}/9 Launch app"
    adb shell am start -n com.openatlas.app/.MainActivity

    style_ok "OpenAtlas running on device — ${apk}"
    style_muted "Env file: ${FRONTEND_DIR}/.env.capacitor.local"
    case "$forced_target" in
        maincloud-emulator|maincloud|maincloud+emulator|qa-emulator)
            style_muted "Maincloud QA: STDB on cloud; ingest/LLM on host :8080/:3847 via 10.0.2.2 (Gemini in Settings)"
            style_muted "Start ingest: OPENATLAS_INGEST_LAN_BIND=1 ./dev.sh start:cloud:live"
            ;;
        emulator)
            style_muted "Local stack: ./dev.sh up then re-run, or OPENATLAS_MOBILE_TARGET=emulator ./dev.sh run-android"
            ;;
        device|lan|physical)
            style_muted "LAN device: laptop must run ./dev.sh up on Wi‑Fi IP baked into .env.capacitor.local"
            ;;
    esac
    style_muted "Production-like phone APK: OPENATLAS_MOBILE_TARGET=maincloud OPENATLAS_MOBILE_MAINCLOUD_PHYSICAL=1 ./scripts/mobile-build-apk.sh"
    style_muted "Doctor: ./dev.sh mobile:doctor"
}

do_mobile_run_maincloud() {
    mobile_ensure_cloud_ingest_running || style_warn "Continuing without host ingest — start manually if feeds fail"
    do_mobile_run maincloud-emulator
}

do_mobile_run_local() {
    do_mobile_run emulator
}

do_mobile_ios() {
    style_header "📱 iOS (Maincloud build + Xcode)"
    mobile_ensure_deps
    export OPENATLAS_MOBILE_TARGET="${OPENATLAS_MOBILE_TARGET:-maincloud}"
    export OPENATLAS_MOBILE_MAINCLOUD_PHYSICAL="${OPENATLAS_MOBILE_MAINCLOUD_PHYSICAL:-1}"
    export OPENATLAS_MOBILE_VARIANT="${OPENATLAS_MOBILE_VARIANT:-debug}"
    export MOBILE_ENV_REPO_ROOT="${SCRIPT_DIR}"
    export MOBILE_ENV_WEB="${FRONTEND_DIR}"
    chmod +x "${SCRIPT_DIR}/scripts/mobile-build-ios.sh" 2>/dev/null || true
    "${SCRIPT_DIR}/scripts/mobile-build-ios.sh"
    local os
    os="$(uname -s)"
    if [[ "$os" != "Darwin" ]]; then
        style_muted "Full IPA / Xcode run requires macOS — web/ios synced above"
        return 0
    fi
    bash -c "cd '${FRONTEND_DIR}' && bunx cap open ios"
    style_ok "Opened Xcode — select simulator or device, then Product → Run (⌘R)"
    style_muted "Maincloud STDB + Gemini in Settings · IPA: OPENATLAS_MOBILE_VARIANT=release ./scripts/mobile-build-ios.sh"
    style_muted "First run: Signing & Capabilities → your Apple team"
}

ensure_frontend_deps() {
    if ! frontend_deps_ok; then
        install_frontend_deps
    fi
}

ensure_web_cloud_env_file() {
    local dest="${FRONTEND_DIR}/.env.local"
    local tmpl="${FRONTEND_DIR}/.env.cloud.example"
    if [[ -f "$dest" ]]; then
        return 0
    fi
    if [[ -f "$tmpl" ]]; then
        cp "$tmpl" "$dest"
        style_muted "created ${dest} (Vite also gets inline VITE_* for this run)"
    fi
}

frontend_dev_pid() {
    [[ -f "$FRONTEND_PID_FILE" ]] || return 1
    local pid
    pid="$(cat "$FRONTEND_PID_FILE" 2>/dev/null || true)"
    [[ -n "${pid:-}" ]] && kill -0 "$pid" 2>/dev/null && printf '%s' "$pid"
}

stop_frontend_dev() {
    local pid
    if ! pid="$(frontend_dev_pid)"; then
        rm -f "$FRONTEND_PID_FILE"
        return 0
    fi
    style_header "⏹  Stopping Vite (pid=${pid})"
    kill "$pid" 2>/dev/null || true
    for _ in 1 2 3 4 5; do
        if ! kill -0 "$pid" 2>/dev/null; then break; fi
        sleep 0.5
    done
    if kill -0 "$pid" 2>/dev/null; then
        style_warn "forcing SIGKILL on Vite"
        kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$FRONTEND_PID_FILE"
    style_ok "vite stopped"
}

wait_for_vite_ready() {
    require_cmd curl
    local deadline=$(( $(date +%s) + VITE_READY_TIMEOUT_SECS ))
    while true; do
        if curl -sf "$VITE_READY_URL" >/dev/null 2>&1; then
            style_ok "Vite ready at ${DASHBOARD_URL}"
            return 0
        fi
        if ! frontend_dev_pid >/dev/null; then
            style_err "Vite exited during startup — see $FRONTEND_LOG_FILE"
            rm -f "$FRONTEND_PID_FILE"
            return 1
        fi
        if (( $(date +%s) > deadline )); then
            style_err "Vite did not become ready within ${VITE_READY_TIMEOUT_SECS}s"
            style_muted "see $FRONTEND_LOG_FILE (port 5173 in use?)"
            return 1
        fi
        sleep 0.5
    done
}

# Background Vite for Run / up (TUI-friendly). Foreground: ./dev.sh web or OPENATLAS_VITE_FOREGROUND=1.
start_frontend_dev() {
    local stdb_target="${1:-local}"
    if frontend_dev_pid >/dev/null; then
        style_warn "Vite already running (pid=$(frontend_dev_pid))"
        return 0
    fi
    ensure_frontend_deps
    web_env_local_strip_mobile || true
    web_vite_dev_env
    : > "$FRONTEND_LOG_FILE"
    case "$stdb_target" in
        cloud|maincloud)
            ensure_web_cloud_env_file
            style_header "⚡ Starting Vite :5173 → Maincloud (${STDB_CLOUD_DB})"
            (
                cd "$FRONTEND_DIR"
                nohup env \
                    VITE_STDB_URI="${STDB_CLOUD_WS}" \
                    VITE_STDB_DB="${STDB_CLOUD_DB}" \
                    VITE_INGEST_BASE= \
                    VITE_LLM_BASE= \
                    VITE_NATIVE_DEFAULT_LLM= \
                    bun run dev >>"$FRONTEND_LOG_FILE" 2>&1 &
                echo $! > "$FRONTEND_PID_FILE"
            )
            ;;
        *)
            style_header "⚡ Starting Vite :5173 → local SpacetimeDB (ws://127.0.0.1:3000)"
            (
                cd "$FRONTEND_DIR"
                nohup env \
                    VITE_STDB_URI="ws://127.0.0.1:3000" \
                    VITE_STDB_DB="${STDB_DB_NAME}" \
                    VITE_INGEST_BASE= \
                    VITE_LLM_BASE= \
                    VITE_NATIVE_DEFAULT_LLM= \
                    bun run dev >>"$FRONTEND_LOG_FILE" 2>&1 &
                echo $! > "$FRONTEND_PID_FILE"
            )
            ;;
    esac
    style_muted "pid $(cat "$FRONTEND_PID_FILE") · logs: $FRONTEND_LOG_FILE"
    sleep 0.5
    wait_for_vite_ready
}

# Vite: command-line VITE_* wins over .env / .env.local (see web/src/lib/stdb-endpoint.ts).
web_vite_dev_env() {
    # CLI overrides beat .env.local — clear mobile APK URLs so /status and /api/llm use Vite proxy.
    export VITE_INGEST_BASE=
    export VITE_LLM_BASE=
    export VITE_NATIVE_DEFAULT_LLM=
}

web_vite_local() {
    ensure_frontend_deps
    web_env_local_strip_mobile || true
    web_vite_dev_env
    style_header "⚡ Vite :5173 → local SpacetimeDB (ws://127.0.0.1:3000)"
    style_muted "Ingest proxy :8080 · no ?demo=1 for live STDB"
    (
        cd "$FRONTEND_DIR"
        env \
            VITE_STDB_URI="ws://127.0.0.1:3000" \
            VITE_STDB_DB="${STDB_DB_NAME}" \
            VITE_INGEST_BASE= \
            VITE_LLM_BASE= \
            VITE_NATIVE_DEFAULT_LLM= \
            bun run dev
    )
}

web_vite_cloud() {
    ensure_frontend_deps
    web_env_local_strip_mobile || true
    web_vite_dev_env
    ensure_web_cloud_env_file
    style_header "⚡ Vite :5173 → Maincloud (${STDB_CLOUD_DB})"
    style_muted "${STDB_CLOUD_WS} · publish: ./dev.sh spacetime:publish:cloud"
    (
        cd "$FRONTEND_DIR"
        env \
            VITE_STDB_URI="${STDB_CLOUD_WS}" \
            VITE_STDB_DB="${STDB_CLOUD_DB}" \
            VITE_INGEST_BASE= \
            VITE_LLM_BASE= \
            VITE_NATIVE_DEFAULT_LLM= \
            bun run dev
    )
}

do_dev_frontend() {
    local stdb_target="${1:-local}"
    case "$stdb_target" in
        cloud|maincloud) web_vite_cloud ;;
        *)               web_vite_local ;;
    esac
}

do_dev_web_only() {
    local stdb_target="${1:-local}"
    local ingest_mode="hybrid"
    case "$stdb_target" in
        cloud|maincloud) ingest_mode="${OPENATLAS_INGEST_MODE:-hybrid}" ;;
    esac
    ensure_stack_for_run "$stdb_target" "$ingest_mode" || return 1
    do_dev_frontend "$stdb_target"
}

do_build_cargo() {
    require_cmd cargo
    style_header "🔨 Building cargo workspace"
    spin "cargo build (release)" cargo build --workspace --exclude openatlas-ui-wasm --release
    style_ok "cargo workspace built"
}

do_build_all() {
    do_spacetime_build
    do_build_frontend
    do_build_cargo
}

# ----------------------------------------------------------------------------
# SpacetimeDB lifecycle
# ----------------------------------------------------------------------------
#
# The module lives in `crates/openatlas-stdb-module`. We run a long-lived
# `spacetime start` instance under .dev/ and publish the module into it.
# Every other component (ingest, CLI, web UI) connects to this instance.

do_spacetime_build() {
    require_cmd spacetime "install from https://spacetimedb.com/install"
    style_header "🧱 Building SpacetimeDB module"
    spin "spacetime build (${STDB_MODULE_DIR})" \
        spacetime build --module-path "$STDB_MODULE_DIR"
    style_ok "module built"
}

do_spacetime_start() {
    require_cmd spacetime "install from https://spacetimedb.com/install"
    if stdb_pid >/dev/null; then
        style_warn "spacetimedb already running (pid=$(stdb_pid))"
        return 0
    fi
    style_header "▶️  Starting SpacetimeDB standalone on ${STDB_LISTEN_ADDR}"
    mkdir -p "$STDB_DATA_DIR"
    : > "$STDB_LOG_FILE"
    (
        nohup spacetime start \
            --listen-addr "$STDB_LISTEN_ADDR" \
            --data-dir "$STDB_DATA_DIR" \
            >>"$STDB_LOG_FILE" 2>&1 &
        echo $! > "$STDB_PID_FILE"
    )
    style_info "pid $(cat "$STDB_PID_FILE") · logs: $STDB_LOG_FILE"
    wait_for_stdb_ready
}

wait_for_stdb_ready() {
    require_cmd curl
    local deadline=$(( $(date +%s) + STDB_READY_TIMEOUT_SECS ))
    local ping_url="http://${STDB_LISTEN_ADDR}/v1/ping"
    while true; do
        if curl -sf "$ping_url" >/dev/null 2>&1; then
            style_ok "spacetimedb ready at ${STDB_LISTEN_ADDR}"
            return 0
        fi
        if (( $(date +%s) > deadline )); then
            style_err "spacetimedb did not become ready within ${STDB_READY_TIMEOUT_SECS}s"
            style_muted "see $STDB_LOG_FILE for details"
            return 1
        fi
        sleep 1
    done
}

do_spacetime_publish() {
    require_cmd spacetime "install from https://spacetimedb.com/install"
    if ! stdb_pid >/dev/null; then
        style_warn "spacetimedb not running; starting first"
        do_spacetime_start
    fi
    style_header "📦 Publishing module as '${STDB_DB_NAME}'"
    spin "spacetime publish --server http://${STDB_LISTEN_ADDR}" \
        spacetime publish \
            --server "http://${STDB_LISTEN_ADDR}" \
            --module-path "$STDB_MODULE_DIR" \
            --yes \
            "$STDB_DB_NAME"
    style_ok "module '${STDB_DB_NAME}' published"
}

do_spacetime_publish_cloud() {
    require_cmd spacetime "install from https://spacetimedb.com/install"
    style_header "☁️  Publishing module to SpacetimeDB Cloud (${STDB_CLOUD_DB})"
    "$SCRIPT_DIR/scripts/publish-stdb-cloud.sh"
}

do_spacetime_stop() {
    local pid
    if ! pid="$(stdb_pid)"; then
        style_warn "spacetimedb not running"
        rm -f "$STDB_PID_FILE"
        return 0
    fi
    style_header "⏹  Stopping SpacetimeDB (pid=${pid})"
    kill "$pid" 2>/dev/null || true
    for _ in 1 2 3 4 5; do
        if ! kill -0 "$pid" 2>/dev/null; then break; fi
        sleep 1
    done
    if kill -0 "$pid" 2>/dev/null; then
        style_warn "forcing SIGKILL"
        kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$STDB_PID_FILE"
    style_ok "spacetimedb stopped"
}

do_spacetime_logs() {
    if [[ ! -f "$STDB_LOG_FILE" ]]; then
        style_warn "no spacetimedb log yet at $STDB_LOG_FILE"
        return 0
    fi
    style_header "🪵 Tailing $STDB_LOG_FILE (Ctrl+C to exit)"
    tail -n 80 -f "$STDB_LOG_FILE"
}

# ----------------------------------------------------------------------------
# SpacetimeDB target + ingest lifecycle
# ----------------------------------------------------------------------------
ingest_mode_running() {
    curl -sf "${STATUS_URL}" 2>/dev/null | jq -r '.ingest_mode // ""' 2>/dev/null || true
}

ingest_status_json() {
    curl -sf "${STATUS_URL}" 2>/dev/null || true
}

current_ingest_stdb_uri() {
    ingest_status_json | jq -r '.stdb_uri // ""' 2>/dev/null || true
}

is_cloud_stdb_uri() {
    [[ "${1:-}" == *"maincloud"* ]] || [[ "${1:-}" == *"spacetimedb.com"* ]]
}

apply_stdb_target() {
    local target="${1:-local}"
    case "$target" in
        cloud|maincloud)
            export OPENATLAS_STDB_TARGET=cloud
            export OPENATLAS_STDB_URI="$STDB_CLOUD_SERVER"
            export OPENATLAS_STDB_DB="$STDB_CLOUD_DB"
            ;;
        local|*)
            export OPENATLAS_STDB_TARGET=local
            export OPENATLAS_STDB_URI="http://${STDB_LISTEN_ADDR}"
            export OPENATLAS_STDB_DB="$STDB_DB_NAME"
            ;;
    esac
}

ingest_matches_target() {
    local target="$1"
    local uri
    uri="$(current_ingest_stdb_uri)"
    [[ -n "$uri" ]] || return 1
    case "$target" in
        cloud|maincloud) is_cloud_stdb_uri "$uri" ;;
        local|*)         ! is_cloud_stdb_uri "$uri" ;;
        *)                 return 1 ;;
    esac
}

cloud_preflight() {
    require_cmd spacetime "install from https://spacetimedb.com/install"
    if ! spacetime login show >/dev/null 2>&1; then
        style_err "SpacetimeDB Cloud requires: spacetime login"
        return 1
    fi
    style_muted "Cloud DB ${STDB_CLOUD_DB} @ ${STDB_CLOUD_SERVER}"
    return 0
}

print_stack_profile() {
    local target="$1"
    local mode="$2"
    style_info "Stack: ${target} · ingest=${mode} · UI ${DASHBOARD_URL}"
}

start_server() {
    # Ingest mode: sim | live | hybrid | static. Target: local | cloud.
    local ingest_mode="${1:-live}"
    local stdb_target="${2:-${OPENATLAS_STDB_TARGET:-local}}"
    apply_stdb_target "$stdb_target"

    if server_pid >/dev/null && ingest_http_ok; then
        local running
        running="$(ingest_mode_running)"
        if ingest_matches_target "$stdb_target" \
            && [[ -n "$running" && "$running" == "$ingest_mode" ]]; then
            style_warn "ingest already running (pid=$(server_pid), ${stdb_target}/${ingest_mode})"
            return 0
        fi
        style_warn "restarting ingest → ${stdb_target}/${ingest_mode} (was ${running:-?})"
        stop_server
    elif server_pid >/dev/null; then
        style_warn "stale or unhealthy ingest pid — restarting"
        stop_server
    fi

    if [[ "$stdb_target" == "local" ]]; then
        if ! stdb_pid >/dev/null; then
            style_warn "spacetimedb not running; starting and publishing module"
            do_spacetime_start
            do_spacetime_publish
        fi
    else
        cloud_preflight || return 1
    fi

    maybe_enable_ingest_lan_bind
    ensure_ingest_binary || return 1

    style_header "▶️  Starting openatlas-ingest (${stdb_target} · ${ingest_mode})"
    : > "$LOG_FILE"
    (
        local -a env_args=(
            "OPENATLAS_STDB_URI=${OPENATLAS_STDB_URI}"
            "OPENATLAS_STDB_DB=${OPENATLAS_STDB_DB}"
            "OPENATLAS_INGEST_MODE=${ingest_mode}"
            "RUST_LOG=${RUST_LOG:-openatlas_ingest=info,info}"
        )
        if [[ "$ingest_mode" == "live" || "$ingest_mode" == "hybrid" ]]; then
            env_args+=("OPENATLAS_ENABLE_LIVE_FEEDS=1")
        fi
        if [[ -n "${OPENATLAS_INGEST_LAN_BIND:-}" ]]; then
            env_args+=("OPENATLAS_BIND=0.0.0.0:8080")
            style_muted "ingest LAN bind (phone/APK): 0.0.0.0:8080 — set OPENATLAS_API_KEY for mutations"
        fi
        nohup env "${env_args[@]}" \
            "$INGEST_BIN" >>"$LOG_FILE" 2>&1 &
        echo $! > "$PID_FILE"
    )
    style_info "pid $(cat "$PID_FILE") · logs: $LOG_FILE"
    sleep 0.5
    if ! kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
        style_err "ingest exited on startup (often: port 8080 in use). See $LOG_FILE"
        rm -f "$PID_FILE"
        return 1
    fi
    if ! wait_for_ready; then
        return 1
    fi
    start_llm_bridge
}

wait_for_ready() {
    require_cmd curl
    local deadline=$(( $(date +%s) + READY_TIMEOUT_SECS ))
    local spin_title="waiting for ingest /health + /ready (up to ${READY_TIMEOUT_SECS}s)"
    local wait_loop='
            while true; do
                if curl -sf '"${HEALTH_URL}"' >/dev/null 2>&1 \
                    && curl -sf '"${READY_URL}"' >/dev/null 2>&1; then
                    exit 0
                fi
                sleep 1
                if [[ $(date +%s) -gt '"${deadline}"' ]]; then exit 1; fi
            done
        '
    if has_gum; then
        if gum spin --spinner meter --title "$spin_title" -- bash -c "$wait_loop"; then
            style_ok "ingest ready (${HEALTH_URL}, ${READY_URL})"
        else
            style_err "server did not become ready within ${READY_TIMEOUT_SECS}s"
            style_muted "see $LOG_FILE for details"
            return 1
        fi
    else
        while true; do
            if curl -sf "$HEALTH_URL" >/dev/null 2>&1 \
                && curl -sf "$READY_URL" >/dev/null 2>&1; then
                style_ok "ingest ready (${HEALTH_URL}, ${READY_URL})"
                return 0
            fi
            if (( $(date +%s) > deadline )); then
                style_err "server did not become ready within ${READY_TIMEOUT_SECS}s"
                style_muted "see $LOG_FILE for details"
                return 1
            fi
            sleep 1
        done
    fi
}

# ----------------------------------------------------------------------------
# Ollama + LLM bridge — Ollama :11434, `openatlas-llm-bridge` on :3847
# ----------------------------------------------------------------------------

ollama_host_from_base() {
    local base="${1:-http://127.0.0.1:11434}"
    base="${base#http://}"
    base="${base#https://}"
    printf '%s' "$base"
}

ollama_api_ok() {
    local host="$1"
    curl -sf "http://${host}/api/tags" >/dev/null 2>&1
}

ollama_has_model() {
    local model="${1:-llama3.2}"
    local host="$2"
    if ! command -v ollama >/dev/null 2>&1; then
        return 1
    fi
    if ollama list 2>/dev/null | awk 'NR>1 {print $1}' | grep -qE "^${model}(:|$)"; then
        return 0
    fi
    if ollama_api_ok "$host"; then
        curl -sf "http://${host}/api/tags" 2>/dev/null \
            | jq -r '.models[]?.name // empty' 2>/dev/null \
            | grep -qE "^${model}(:|$)" && return 0
    fi
    return 1
}

wait_for_ollama_api() {
    local host="$1"
    local deadline=$(( $(date +%s) + OLLAMA_READY_TIMEOUT_SECS ))
    while true; do
        if ollama_api_ok "$host"; then
            return 0
        fi
        if (( $(date +%s) > deadline )); then
            return 1
        fi
        sleep 0.5
    done
}

ensure_ollama_model() {
    local model="${OPENATLAS_OLLAMA_MODEL:-llama3.2}"
    local host
    host="$(ollama_host_from_base "${OPENATLAS_OLLAMA_BASE:-http://127.0.0.1:11434}")"
    if [[ "${OPENATLAS_OLLAMA_AUTO_PULL:-1}" == "0" ]]; then
        return 0
    fi
    if ollama_has_model "$model" "$host"; then
        return 0
    fi
    require_cmd ollama "install from https://ollama.com/download"
    style_info "Pulling Ollama model ${model} (first run may take several minutes)…"
    if has_gum; then
        gum spin --spinner dot --title "ollama pull ${model}" -- ollama pull "$model"
    else
        ollama pull "$model"
    fi
    style_ok "Ollama model ${model} ready"
}

ensure_ollama_running() {
    if [[ "${OPENATLAS_START_OLLAMA:-1}" == "0" ]]; then
        return 0
    fi
    if ! command -v ollama >/dev/null 2>&1; then
        style_warn "Ollama not installed — Hub AI needs https://ollama.com/download"
        style_muted "Or OPENATLAS_START_OLLAMA=0 and Settings → Gemini API key"
        return 0
    fi

    local host
    host="$(ollama_host_from_base "${OPENATLAS_OLLAMA_BASE:-http://127.0.0.1:11434}")"

    if ollama_api_ok "$host"; then
        ensure_ollama_model
        return 0
    fi

    style_info "▶️  Starting Ollama on http://${host}…"
    chmod +x "${SCRIPT_DIR}/scripts/ollama-serve-cpu.sh" 2>/dev/null || true

    if [[ "${OPENATLAS_OLLAMA_CPU:-0}" == "1" ]]; then
        if ! "${SCRIPT_DIR}/scripts/ollama-serve-cpu.sh" --background; then
            style_err "Could not start CPU-only Ollama (port may be in use). See ${DEV_DIR}/ollama-cpu.log"
            return 1
        fi
    else
        if pgrep -x ollama >/dev/null 2>&1; then
            style_warn "ollama process exists but API is down — waiting for http://${host}…"
        else
            export OLLAMA_HOST="http://${host}"
            : >"$OLLAMA_LOG_FILE"
            nohup ollama serve >>"$OLLAMA_LOG_FILE" 2>&1 &
            echo $! >"$OLLAMA_PID_FILE"
            style_muted "pid $(cat "$OLLAMA_PID_FILE") · logs: $OLLAMA_LOG_FILE"
        fi
    fi

    if ! wait_for_ollama_api "$host"; then
        style_err "Ollama did not become ready within ${OLLAMA_READY_TIMEOUT_SECS}s"
        style_muted "GPU/CUDA errors (unlikely with CPU default): OPENATLAS_OLLAMA_CPU=1 ./dev.sh up  →  GPU re-enable: OPENATLAS_OLLAMA_CPU=0"
        return 1
    fi
    style_ok "Ollama API ready at http://${host}"
    ensure_ollama_model
}

stop_ollama_dev() {
    local pidfile pid
    for pidfile in "$OLLAMA_PID_FILE" "$(abs_repo_path "${DEV_DIR}/ollama-cpu.pid")"; do
        [[ -f "$pidfile" ]] || continue
        pid="$(cat "$pidfile" 2>/dev/null || true)"
        [[ -n "${pid:-}" ]] || continue
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null || true
            for _ in 1 2 3 4 5; do
                kill -0 "$pid" 2>/dev/null || break
                sleep 0.2
            done
            kill -9 "$pid" 2>/dev/null || true
        fi
        rm -f "$pidfile"
    done
}

llm_bridge_pid() {
    [[ -f "$LLM_PID_FILE" ]] || return 1
    local pid
    pid="$(cat "$LLM_PID_FILE" 2>/dev/null || true)"
    [[ -n "${pid:-}" ]] && kill -0 "$pid" 2>/dev/null && printf '%s' "$pid"
}

start_llm_bridge() {
    if [[ "${OPENATLAS_START_LLM:-1}" == "0" ]]; then
        return 0
    fi
    ensure_ollama_running || style_warn "Continuing without Ollama — bridge will start but /v1/ready may fail"
    if llm_bridge_pid >/dev/null; then
        style_warn "openatlas-llm-bridge already running (pid=$(llm_bridge_pid))"
        wait_for_llm_bridge_healthy
        return 0
    fi
    require_cmd cargo
    require_cmd curl
    style_info "▶️  Starting openatlas-llm-bridge (Ollama at ${OPENATLAS_OLLAMA_BASE:-http://127.0.0.1:11434}, model ${OPENATLAS_OLLAMA_MODEL:-llama3.2})"
    : > "$LLM_LOG_FILE"
    (
        export RUST_LOG="${RUST_LOG:-openatlas_llm_bridge=info,info}"
        export OPENATLAS_OLLAMA_BASE="${OPENATLAS_OLLAMA_BASE:-http://127.0.0.1:11434}"
        export OPENATLAS_OLLAMA_MODEL="${OPENATLAS_OLLAMA_MODEL:-llama3.2}"
        export OPENATLAS_LLM_LISTEN="${OPENATLAS_LLM_LISTEN:-$LLM_LISTEN_ADDR}"
        nohup cargo run -p openatlas-llm-bridge --quiet >>"$LLM_LOG_FILE" 2>&1 &
        echo $! > "$LLM_PID_FILE"
    )
    style_info "pid $(cat "$LLM_PID_FILE") · logs: $LLM_LOG_FILE"
    sleep 0.5
    if ! kill -0 "$(cat "$LLM_PID_FILE")" 2>/dev/null; then
        style_err "openatlas-llm-bridge exited on startup. See $LLM_LOG_FILE"
        rm -f "$LLM_PID_FILE"
        return 1
    fi
    wait_for_llm_bridge_healthy
}

wait_for_llm_bridge_healthy() {
    require_cmd curl
    local deadline=$(( $(date +%s) + LLM_READY_TIMEOUT_SECS ))
    while true; do
        if curl -sf "$LLM_HEALTH_URL" >/dev/null 2>&1; then
            style_ok "LLM bridge healthy at $LLM_HEALTH_URL"
            if curl -sf "http://${LLM_LISTEN_ADDR}/v1/ready" >/dev/null 2>&1; then
                style_ok "Ollama reachable through bridge (GET /v1/ready OK)"
                if curl -sf --max-time 120 "http://${LLM_LISTEN_ADDR}/v1/capable" >/dev/null 2>&1; then
                    style_ok "Model inference OK (GET /v1/capable)"
                else
                    style_warn "Ollama is up but inference failed (CUDA/GPU mismatch is common on GTX 10xx)."
                    style_muted "Stop \`ollama serve\`, then: ./scripts/ollama-serve-cpu.sh  (or CUDA_VISIBLE_DEVICES=\"\" ollama serve)"
                fi
            else
                style_warn "Ollama not ready — start \`ollama serve\` and \`ollama pull ${OPENATLAS_OLLAMA_MODEL:-llama3.2}\` (see bridge log: $LLM_LOG_FILE)"
                style_muted "GPU/CUDA errors: ./dev.sh ollama:cpu"
            fi
            return 0
        fi
        if (( $(date +%s) > deadline )); then
            style_err "openatlas-llm-bridge did not become healthy within ${LLM_READY_TIMEOUT_SECS}s"
            style_muted "see $LLM_LOG_FILE"
            return 1
        fi
        sleep 0.4
    done
}

do_ollama_start() {
    OPENATLAS_OLLAMA_CPU="${OPENATLAS_OLLAMA_CPU:-1}"
    ensure_ollama_running
}

do_ollama_cpu() {
    style_header "🦙 Ollama CPU-only (CUDA_VISIBLE_DEVICES=\"\")"
    style_muted "Use when inference fails with: architectural feature absent from the device"
    stop_ollama_dev
    if pgrep -x ollama >/dev/null 2>&1; then
        style_warn "An ollama process is already running. Stop it first, e.g.:"
        style_muted "  systemctl --user stop ollama   # if using systemd"
        style_muted "  kill \$(pgrep -x ollama)       # ad-hoc serve"
        style_muted "Then re-run: ./dev.sh ollama:cpu"
        return 1
    fi
    OPENATLAS_OLLAMA_CPU=1 ensure_ollama_running
    start_llm_bridge || true
    style_muted "Test: ./dev.sh prove:llm  or  Settings → Test LLM pipeline"
}

stop_llm_bridge() {
    local pid
    if ! pid="$(llm_bridge_pid)"; then
        style_warn "openatlas-llm-bridge not running"
        rm -f "$LLM_PID_FILE"
        return 0
    fi
    style_header "⏹  Stopping openatlas-llm-bridge (pid=${pid})"
    kill "$pid" 2>/dev/null || true
    for _ in 1 2 3 4 5; do
        if ! kill -0 "$pid" 2>/dev/null; then break; fi
        sleep 1
    done
    if kill -0 "$pid" 2>/dev/null; then
        style_warn "forcing SIGKILL"
        kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$LLM_PID_FILE"
    style_ok "LLM bridge stopped"
}

do_llm_logs() {
    if [[ ! -f "$LLM_LOG_FILE" ]]; then
        style_warn "no LLM bridge log yet at $LLM_LOG_FILE"
        return 0
    fi
    style_header "🪵 Tailing $LLM_LOG_FILE (Ctrl+C to exit)"
    tail -n 80 -f "$LLM_LOG_FILE"
}

stop_server() {
    local pid
    if ! pid="$(server_pid)"; then
        style_warn "server not running"
        rm -f "$PID_FILE"
        return 0
    fi
    style_header "⏹  Stopping openatlas-ingest (pid=${pid})"
    kill "$pid" 2>/dev/null || true
    # allow graceful shutdown, then escalate
    for _ in 1 2 3 4 5; do
        if ! kill -0 "$pid" 2>/dev/null; then break; fi
        sleep 1
    done
    if kill -0 "$pid" 2>/dev/null; then
        style_warn "forcing SIGKILL"
        kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$PID_FILE"
    style_ok "stopped"
}

do_status() {
    style_header "📊 Status"
    if pid="$(stdb_pid)"; then
        style_ok "spacetimedb running (pid=${pid})"
    else
        style_warn "spacetimedb not running"
    fi
    if pid="$(server_pid)"; then
        if ingest_http_ok; then
            style_ok "ingest running (pid=${pid}, HTTP ok)"
        else
            style_warn "ingest pid ${pid} but HTTP not healthy — run: ./dev.sh start"
        fi
    else
        style_warn "ingest not running — run: ./dev.sh up  or  ./dev.sh start:cloud:hybrid"
    fi
    if pid="$(frontend_dev_pid)"; then
        style_ok "vite dev running (pid=${pid}, ${DASHBOARD_URL})"
    else
        style_warn "vite dev not running"
    fi
    require_cmd curl
    if curl -sf "$HEALTH_URL" >/dev/null; then
        style_ok "/health -> ok"
    fi
    local status
    if status="$(curl -sf "$STATUS_URL" 2>/dev/null)"; then
        if command -v jq >/dev/null 2>&1; then
            echo "$status" | jq '{ingest_mode, simulators_enabled, live_feeds_enabled, stdb_reachable, uptime_seconds, feeds: [.feeds[] | {name, enabled, success_count, failure_count, last_error}]}'
        else
            echo "$status"
        fi
    else
        style_warn "/status not reachable yet"
    fi
}

do_feed_status() {
    require_cmd curl
    require_cmd jq
    style_header "📡 Live feed status"
    if ! server_pid >/dev/null; then
        style_warn "ingest not running — start with: ./dev.sh start"
        return 1
    fi
    curl -sf "$STATUS_URL" | jq -r '
      "ingest_mode: \(.ingest_mode)  live_feeds: \(.live_feeds_enabled)  stdb: \(.stdb_reachable)",
      "",
      (.feeds[] | "\(.name)\t enabled=\(.enabled)\t ok=\(.success_count)\t fail=\(.failure_count)\t \(if .last_error then .last_error[0:72] else "-" end)")'
}

do_prove_llm() {
    require_cmd curl
    require_cmd jq
    style_header "🔬 Proving LLM bridge → Ollama"
    if ! llm_bridge_pid >/dev/null; then
        start_llm_bridge || return 1
    fi
  "$SCRIPT_DIR/scripts/prove-llm-stack.sh"
    style_ok "LLM STACK VERIFIED"
}

do_prove_live() {
    require_cmd jq
    style_header "🔬 Proving live API → SpacetimeDB pipeline"
  if ! stdb_pid >/dev/null; then
        do_spacetime_start
        do_spacetime_publish
    fi
    if server_pid >/dev/null; then
        local running
        running="$(ingest_mode_running)"
        if [[ "$running" != "live" ]]; then
            stop_server
        fi
    fi
    if ! server_pid >/dev/null; then
        start_server live local || return 1
    fi
    "$SCRIPT_DIR/scripts/prove-live-stack.sh"
}

# Force-stop anything still listening on OpenAtlas dev ports (stale PID files, manual runs).
kill_tcp_listeners() {
    local port="$1"
    [[ "$port" =~ ^[0-9]+$ ]] || return 0
    local pid
    if command -v lsof >/dev/null 2>&1; then
        while read -r pid; do
            [[ -n "$pid" ]] || continue
            kill "$pid" 2>/dev/null || true
        done < <(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
    elif command -v fuser >/dev/null 2>&1; then
        fuser -k "${port}/tcp" >/dev/null 2>&1 || true
    fi
}

stop_dev_stack_ports() {
    kill_tcp_listeners 5173
    kill_tcp_listeners 8080
    local llm_port="${LLM_LISTEN_ADDR##*:}"
    kill_tcp_listeners "${llm_port:-3847}"
    kill_tcp_listeners "${STDB_LISTEN_ADDR##*:}"
}

# Tear down everything started by Run / up (Vite, ingest, LLM bridge, local SpacetimeDB).
do_down() {
    style_header "⏹  Stopping full stack"
    stop_frontend_dev
    stop_server
    stop_llm_bridge
    stop_ollama_dev
    do_spacetime_stop
    stop_dev_stack_ports
    rm -f "$FRONTEND_PID_FILE" "$PID_FILE" "$LLM_PID_FILE" "$STDB_PID_FILE"
    style_ok "everything stopped (Vite, ingest, LLM bridge, Ollama if dev-started, local SpacetimeDB)"
}

do_vite_logs() {
    if [[ ! -f "$FRONTEND_LOG_FILE" ]]; then
        style_warn "no Vite log yet at $FRONTEND_LOG_FILE"
        return 0
    fi
    style_header "🪵 Tailing $FRONTEND_LOG_FILE (Ctrl+C to exit)"
    tail -n 80 -f "$FRONTEND_LOG_FILE"
}

do_logs() {
    if [[ ! -f "$LOG_FILE" ]]; then
        style_warn "no log file yet at $LOG_FILE"
        return 0
    fi
    style_header "🪵 Tailing $LOG_FILE (Ctrl+C to exit)"
    tail -n 80 -f "$LOG_FILE"
}

# ----------------------------------------------------------------------------
# Open dashboard / TUI / CLI explorer
# ----------------------------------------------------------------------------
do_open_dashboard() {
    style_header "🌐 Opening ${DASHBOARD_URL}"
    if command -v xdg-open >/dev/null; then
        xdg-open "$DASHBOARD_URL" >/dev/null 2>&1 &
    elif command -v open >/dev/null; then
        open "$DASHBOARD_URL" >/dev/null 2>&1 &
    else
        style_info "visit $DASHBOARD_URL in your browser"
    fi
}

do_tail_events() {
    # The interactive ratatui TUI was retired when SpacetimeDB became the
    # backbone — the authoritative live dashboard is the Svelte app, which
    # subscribes to stdb directly. This command keeps a lightweight terminal
    # tail around: `openatlas-cli view events --watch` repolls the SQL
    # endpoint on a short interval and re-renders the newest rows.
    require_cmd cargo
    if ! stdb_pid >/dev/null; then
        style_warn "spacetimedb not running; starting it first"
        do_spacetime_start
        do_spacetime_publish
    fi
    local domain
    domain="$(ask "Optional domain filter (blank for all)" "")"
    if [[ -n "$domain" ]]; then
        cargo run -p openatlas-cli --quiet -- view events --watch --domain "$domain"
    else
        cargo run -p openatlas-cli --quiet -- view events --watch
    fi
}

do_cli() {
    require_cmd cargo
    local sub
    sub="$(choose \
        "view events (recent)" \
        "state for a domain" \
        "anomalies (recent)" \
        "trace an event")"
    case "$sub" in
        "view events (recent)")
            local limit
            limit="$(ask "How many events?" "15")"
            cargo run -p openatlas-cli --quiet -- view events --limit "${limit:-15}"
            ;;
        "state for a domain")
            local d
            d="$(ask "Domain" "energy")"
            cargo run -p openatlas-cli --quiet -- state --domain "${d:-energy}"
            ;;
        "anomalies (recent)")
            local d
            d="$(ask "Domain (blank for all)" "")"
            if [[ -n "$d" ]]; then
                cargo run -p openatlas-cli --quiet -- anomalies --domain "$d"
            else
                cargo run -p openatlas-cli --quiet -- anomalies
            fi
            ;;
        "trace an event")
            local id
            id="$(ask "Event id (u64)" "")"
            if [[ -z "$id" ]]; then
                style_warn "no event id supplied"
            else
                cargo run -p openatlas-cli --quiet -- trace "$id"
            fi
            ;;
    esac
}

# ----------------------------------------------------------------------------
# Quality gates
# ----------------------------------------------------------------------------
do_test() {
    require_cmd cargo
    style_header "🔬 Running tests"
    spin "cargo test (workspace)" cargo test --workspace --exclude openatlas-ui-wasm --quiet
    if command -v bun >/dev/null 2>&1 && [[ -d "${FRONTEND_DIR}/node_modules" ]]; then
        spin "bun test (web unit)" bash -c "cd '${FRONTEND_DIR}' && bun test src/lib"
    fi
    style_ok "tests passed"
}

do_lint() {
    require_cmd cargo
    style_header "📏 Linting"
    spin "cargo fmt --check" cargo fmt --all -- --check
    spin "cargo clippy" cargo clippy --workspace --exclude openatlas-ui-wasm --no-deps -- -D warnings
    style_ok "lint clean"
}

do_clean() {
    style_header "🧹 Cleaning"
    if confirm "Stop services and remove build artifacts (includes SpacetimeDB data)?"; then
        stop_frontend_dev
        stop_server
        stop_llm_bridge
        do_spacetime_stop
        spin "cargo clean" cargo clean
        rm -rf "$FRONTEND_DIST_DIR" "${FRONTEND_DIR}/node_modules"
        rm -rf "$STDB_DATA_DIR"
        style_ok "workspace cleaned"
    else
        style_muted "cancelled"
    fi
}

# ----------------------------------------------------------------------------
# Composite tasks
# ----------------------------------------------------------------------------

print_web_hint() {
    style_muted "UI: ${DASHBOARD_URL}  ·  foreground Vite: ./dev.sh web  ·  logs: $FRONTEND_LOG_FILE"
}

# Bring up ingest (+ local SpacetimeDB when target=local). Mode: sim | live | hybrid | static.
# Set OPENATLAS_SKIP_BUILD=1 to skip wasm + web dist rebuild (faster restarts).
stack_up() {
    local ingest_mode="${1:-${OPENATLAS_INGEST_MODE:-hybrid}}"
    local stdb_target="${2:-local}"
    apply_stdb_target "$stdb_target"
    print_stack_profile "$stdb_target" "$ingest_mode"

    if [[ "${OPENATLAS_SKIP_BUILD:-0}" != "1" ]]; then
        do_spacetime_build
    else
        style_muted "OPENATLAS_SKIP_BUILD=1 — skipping spacetime wasm build"
    fi

    if [[ "$stdb_target" == "local" ]]; then
        do_spacetime_start
        do_spacetime_publish
        if [[ "${OPENATLAS_SKIP_BUILD:-0}" != "1" ]]; then
            do_build_frontend
        fi
    else
        cloud_preflight || return 1
    fi

    start_server "$ingest_mode" "$stdb_target"
    if [[ "$stdb_target" == "cloud" ]]; then
        style_muted "Android emulator QA (Maincloud STDB + host ingest via 10.0.2.2): ./dev.sh run-android"
    fi
}

ensure_stack_for_run() {
    local stdb_target="$1"
    local ingest_mode="$2"
    apply_stdb_target "$stdb_target"
    prune_stale_server_pid

    local need_up=0
    if [[ "$stdb_target" == "local" ]] && ! stdb_pid >/dev/null; then
        need_up=1
    fi
    if ! ingest_http_ok; then
        if server_pid >/dev/null; then
            style_warn "ingest HTTP down — restarting (${stdb_target}/${ingest_mode})"
            stop_server
        fi
        need_up=1
    elif ! server_pid >/dev/null; then
        need_up=1
    elif ! ingest_matches_target "$stdb_target"; then
        style_warn "ingest points at wrong STDB — restarting for ${stdb_target}"
        stop_server
        need_up=1
    else
        local running
        running="$(ingest_mode_running)"
        if [[ -n "$running" && "$running" != "$ingest_mode" ]]; then
            stop_server
            need_up=1
        fi
    fi

    if (( need_up )); then
        stack_up "$ingest_mode" "$stdb_target"
    else
        style_muted "backend already up (${stdb_target}/${ingest_mode})"
    fi
}

# Full stack: SpacetimeDB (local) + ingest + LLM bridge + Vite + open browser.
# Backend-only pieces live under Advanced (menu_up_backend, start:*, web:*).
full_stack_up() {
    local ingest_mode="${1:-${OPENATLAS_INGEST_MODE:-hybrid}}"
    local stdb_target="${2:-local}"
    style_header "Full stack — ${stdb_target} · ${ingest_mode}"
    print_stack_profile "$stdb_target" "$ingest_mode"
    ensure_stack_for_run "$stdb_target" "$ingest_mode"
    if [[ "${OPENATLAS_VITE_FOREGROUND:-0}" == "1" ]]; then
        style_muted "Foreground Vite (Ctrl+C stops UI only; backend keeps running)"
        do_open_dashboard
        do_dev_frontend "$stdb_target"
        return
    fi
    start_frontend_dev "$stdb_target" || return 1
    do_open_dashboard
    style_ok "full stack running — ${DASHBOARD_URL}"
    style_muted "Vite logs: $FRONTEND_LOG_FILE · Stop: ./dev.sh down"
}

do_run_stack() {
    full_stack_up "${2:-hybrid}" "${1:-local}"
}

do_all() {
    full_stack_up hybrid local
}

do_all_sim() {
    full_stack_up sim local
}

do_all_live() {
    full_stack_up live local
}

do_all_cloud_sim() {
    full_stack_up sim cloud
}

do_all_cloud_live() {
    full_stack_up live cloud
}

do_up_fast() {
    OPENATLAS_SKIP_BUILD=1 full_stack_up "${OPENATLAS_INGEST_MODE:-hybrid}" "${OPENATLAS_STDB_TARGET:-local}"
}

do_run() {
    full_stack_up "${OPENATLAS_INGEST_MODE:-hybrid}" local
}

do_verify() {
    local extra=()
    if [[ "${1:-}" == "--full" ]]; then
        extra+=(--full)
    fi
    if [[ "${1:-}" == "--quick" ]]; then
        extra+=(--quick)
    fi
    require_cmd bash
    chmod +x "$SCRIPT_DIR/scripts/verify-stack.sh" 2>/dev/null || true
    "$SCRIPT_DIR/scripts/verify-stack.sh" "${extra[@]}"
}

do_clean_force() {
    style_header "Clean (non-interactive)"
    stop_server
    stop_llm_bridge
    do_spacetime_stop
    spin "cargo clean" cargo clean
    rm -rf "$FRONTEND_DIST_DIR" "${FRONTEND_DIR}/node_modules"
    rm -rf "$STDB_DATA_DIR"
    style_ok "workspace cleaned"
}

do_web_check() {
    require_cmd bun "install from https://bun.sh"
    style_header "🌐 Web typecheck + unit tests"
    if ! frontend_deps_ok; then
        install_frontend_deps
    fi
    spin "svelte-check" bash -c "cd '${FRONTEND_DIR}' && bun run check"
    spin "bun test (web)" bash -c "cd '${FRONTEND_DIR}' && bun test src/lib"
    style_ok "web checks passed"
}

do_config_check() {
    style_header "🔒 Secret path guard"
    spin "check-no-secrets-in-git" bash "${SCRIPT_DIR}/scripts/check-no-secrets-in-git.sh"
    style_ok "no tracked secret files"
}

do_init_config() {
    style_header "📁 Local config templates"
    bash "${SCRIPT_DIR}/scripts/init-local-config.sh"
    style_ok "see docs/CONFIG.md"
}

do_check() {
    local ec=0
    do_config_check || ec=1
    do_test || ec=1
    do_lint || ec=1
    do_web_check || ec=1
    return "$ec"
}

do_dev_frontend_demo() {
    require_cmd bun "install from https://bun.sh"
    style_header "Vite dev server (DEMO / no SpacetimeDB) on :5173"
    if ! frontend_deps_ok; then
        install_frontend_deps
    fi
    (cd "$FRONTEND_DIR" && VITE_DEMO_DATA=1 bun run dev)
}

# ----------------------------------------------------------------------------
# Configuration wizard (interactive TUI, writes .env)
# ----------------------------------------------------------------------------
do_configure() {
  style_header "Configuration Wizard"
  style_muted "Writes settings to .env in the project root for persistent defaults."
  echo

  local env_file="${SCRIPT_DIR}/.env"

  # Read existing .env values for pre-fill
  if [[ -f "$env_file" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$env_file"
    set +a
  fi

  # --- 1. Deployment profile ---
  local profile_id="${OPENATLAS_DEPLOYMENT_PROFILE:-local_hybrid}"
  style_info "1) Deployment profile (controls STDB target, ingest, LAN bind)"
  if has_gum; then
    local chosen
    chosen="$(gum choose \
      "Demo" \
      "Cloud live (Maincloud only)" \
      "Cloud + LAN ingest (sim)" \
      "Cloud + LAN ingest (live)" \
      "Cloud + LAN ingest (hybrid)" \
      "Local STDB (sim)" \
      "Local STDB (live)" \
      "Local STDB (hybrid)" \
      "Local STDB (LAN)" \
      "Local STDB (emulator)" \
      "Custom" \
      --header "Deployment profile (current: ${profile_id}):" \
      --cursor "▶ " --height 15)"
  else
    echo "  Current: ${profile_id}"
    echo "  1) Demo               2) Cloud live          3) Cloud + LAN (sim)"
    echo "  4) Cloud + LAN (live)  5) Cloud + LAN (hybrid) 6) Local STDB (sim)"
    echo "  7) Local STDB (live)   8) Local STDB (hybrid)  9) Local STDB (LAN)"
    echo " 10) Local STDB (emulator)  11) Custom"
    local n
    read -r -p "  Profile number [8]: " n
    n="${n:-8}"
    case "$n" in
      1)  chosen="Demo" ;;              2)  chosen="Cloud live (Maincloud only)" ;;
      3)  chosen="Cloud + LAN ingest (sim)" ;;  4)  chosen="Cloud + LAN ingest (live)" ;;
      5)  chosen="Cloud + LAN ingest (hybrid)" ;;  6)  chosen="Local STDB (sim)" ;;
      7)  chosen="Local STDB (live)" ;;  8)  chosen="Local STDB (hybrid)" ;;
      9)  chosen="Local STDB (LAN)" ;;   10) chosen="Local STDB (emulator)" ;;
      11) chosen="Custom" ;;             *)  chosen="Local STDB (hybrid)" ;;
    esac
  fi
  case "$chosen" in
    *Demo*)                         profile_id="demo" ;;
    *"Cloud live"*)                 profile_id="cloud_live" ;;
    *"Cloud + LAN"*sim*)           profile_id="cloud_ingest_sim" ;;
    *"Cloud + LAN"*live*)          profile_id="cloud_ingest_live" ;;
    *"Cloud + LAN"*hybrid*)        profile_id="cloud_ingest_hybrid" ;;
    *"Local STDB (sim)"*)          profile_id="local_sim" ;;
    *"Local STDB (live)"*)         profile_id="local_live" ;;
    *"Local STDB (hybrid)"*)       profile_id="local_hybrid" ;;
    *"Local STDB (LAN)"*)          profile_id="local_lan" ;;
    *"Local STDB (emulator)"*)     profile_id="local_emulator" ;;
    *"Custom"*)                     profile_id="custom" ;;
  esac
  style_ok "  Profile: ${profile_id} ($(profile_label "$profile_id"))"

  # --- 2. LAN host (for profiles that need it) ---
  local lan_host="${OPENATLAS_LAN_HOST:-}"
  if [[ "$profile_id" == "local_lan" || "$profile_id" == "local_emulator" || "$profile_id" == cloud_ingest_sim || "$profile_id" == cloud_ingest_live || "$profile_id" == cloud_ingest_hybrid || "$profile_id" == cloud_lan_ingest ]]; then
    style_info "2) LAN host for device access"
    if has_gum; then
      lan_host="$(gum input --placeholder "192.168.1.42" --value "$lan_host" --prompt "LAN IP/host: ")"
    else
      local tmp
      read -r -p "  LAN IP/host [${lan_host:-auto}]: " tmp
      lan_host="${tmp:-$lan_host}"
    fi
    style_ok "  LAN host: ${lan_host:-auto-detect}"
  fi

  # --- 3. Custom URLs (for custom profile) ---
  local stdb_uri_custom="${OPENATLAS_STDB_URI_CUSTOM:-wss://maincloud.spacetimedb.com}"
  local ingest_base_custom="${OPENATLAS_INGEST_BASE_CUSTOM:-}"
  local llm_base_custom="${OPENATLAS_LLM_BASE_CUSTOM:-}"
  local stdb_db_custom="${OPENATLAS_STDB_DB_CUSTOM:-openatlas}"
  if [[ "$profile_id" == "custom" ]]; then
    style_info "3) Custom endpoint URLs"
    if has_gum; then
      stdb_uri_custom="$(gum input --placeholder "wss://maincloud.spacetimedb.com" --value "$stdb_uri_custom" --prompt "STDB WebSocket URI: ")"
      ingest_base_custom="$(gum input --placeholder "http://192.168.1.42:8080" --value "$ingest_base_custom" --prompt "Ingest HTTP base: ")"
      llm_base_custom="$(gum input --placeholder "http://192.168.1.42:3847" --value "$llm_base_custom" --prompt "LLM bridge base: ")"
      stdb_db_custom="$(gum input --placeholder "openatlas" --value "$stdb_db_custom" --prompt "STDB database name: ")"
    else
      local tmp
      read -r -p "  STDB WebSocket URI [${stdb_uri_custom}]: " tmp
      stdb_uri_custom="${tmp:-$stdb_uri_custom}"
      read -r -p "  Ingest HTTP base [${ingest_base_custom:-none}]: " tmp
      ingest_base_custom="${tmp:-$ingest_base_custom}"
      read -r -p "  LLM bridge base [${llm_base_custom:-none}]: " tmp
      llm_base_custom="${tmp:-$llm_base_custom}"
      read -r -p "  STDB database name [${stdb_db_custom}]: " tmp
      stdb_db_custom="${tmp:-$stdb_db_custom}"
    fi
    style_ok "  Custom endpoints configured"
  fi

  # --- 4. Theme ---
  local theme="${OPENATLAS_THEME:-dark}"
  style_info "4) UI theme"
  if has_gum; then
    theme="$(gum choose "dark" "dim" "light" --header "Theme (current: ${theme}):" --cursor "▶ ")"
    [[ -z "$theme" ]] && theme="${OPENATLAS_THEME:-dark}"
  else
    local tmp
    read -r -p "  Theme [${theme}] (dark/dim/light): " tmp
    theme="${tmp:-$theme}"
  fi
  style_ok "  Theme: ${theme}"

  # --- 5. Update interval ---
  local interval="${OPENATLAS_UPDATE_INTERVAL:-5s}"
  style_info "5) Chart update interval"
  if has_gum; then
    interval="$(gum choose "1s" "5s" "30s" "1m" "5m" "10m" "30m" "1h" --header "Update interval (current: ${interval}):" --cursor "▶ ")"
    [[ -z "$interval" ]] && interval="${OPENATLAS_UPDATE_INTERVAL:-5s}"
  else
    local tmp
    read -r -p "  Update interval [${interval}] (1s/5s/30s/1m/5m/10m/30m/1h): " tmp
    interval="${tmp:-$interval}"
  fi
  style_ok "  Interval: ${interval}"

  # --- 6. LLM provider ---
  local llm_provider="${OPENATLAS_LLM_PROVIDER:-bridge}"
  local llm_gemini_key="${OPENATLAS_LLM_GEMINI_API_KEY:-}"
  local llm_gemini_model="${OPENATLAS_LLM_GEMINI_MODEL:-gemini-2.0-flash}"
  local llm_openai_base="${OPENATLAS_LLM_OPENAI_BASE_URL:-https://api.openai.com/v1}"
  local llm_openai_key="${OPENATLAS_LLM_OPENAI_API_KEY:-}"
  local llm_openai_model="${OPENATLAS_LLM_OPENAI_MODEL:-gpt-4o-mini}"
  style_info "6) LLM provider"
  if has_gum; then
    llm_provider="$(gum choose "bridge" "gemini" "openai_compat" --header "LLM provider (current: ${llm_provider}):" --cursor "▶ ")"
    [[ -z "$llm_provider" ]] && llm_provider="${OPENATLAS_LLM_PROVIDER:-bridge}"
  else
    local tmp
    read -r -p "  LLM provider [${llm_provider}] (bridge/gemini/openai_compat): " tmp
    llm_provider="${tmp:-$llm_provider}"
  fi

  if [[ "$llm_provider" == "gemini" ]]; then
    if has_gum; then
      llm_gemini_key="$(gum input --placeholder "AIza..." --value "$llm_gemini_key" --password --prompt "Gemini API key: ")"
      llm_gemini_model="$(gum input --placeholder "gemini-2.0-flash" --value "$llm_gemini_model" --prompt "Gemini model: ")"
    else
      local tmp
      read -r -p "  Gemini API key [${llm_gemini_key:+***set***}]: " tmp
      llm_gemini_key="${tmp:-$llm_gemini_key}"
      read -r -p "  Gemini model [${llm_gemini_model}]: " tmp
      llm_gemini_model="${tmp:-$llm_gemini_model}"
    fi
  elif [[ "$llm_provider" == "openai_compat" ]]; then
    if has_gum; then
      llm_openai_base="$(gum input --placeholder "https://api.openai.com/v1" --value "$llm_openai_base" --prompt "OpenAI base URL: ")"
      llm_openai_key="$(gum input --placeholder "sk-..." --value "$llm_openai_key" --password --prompt "OpenAI API key: ")"
      llm_openai_model="$(gum input --placeholder "gpt-4o-mini" --value "$llm_openai_model" --prompt "OpenAI model: ")"
    else
      local tmp
      read -r -p "  OpenAI base URL [${llm_openai_base}]: " tmp
      llm_openai_base="${tmp:-$llm_openai_base}"
      read -r -p "  OpenAI API key [${llm_openai_key:+***set***}]: " tmp
      llm_openai_key="${tmp:-$llm_openai_key}"
      read -r -p "  OpenAI model [${llm_openai_model}]: " tmp
      llm_openai_model="${tmp:-$llm_openai_model}"
    fi
  fi
  style_ok "  LLM provider: ${llm_provider}"

  # --- Write .env ---
  echo
  if has_gum; then
    if ! gum confirm "Write these settings to ${env_file}?"; then
      style_muted "Cancelled — no changes written"
      return 0
    fi
  else
    local yn
    read -r -p "Write settings to ${env_file}? [Y/n] " yn
    [[ "$yn" =~ ^[Nn] ]] && { style_muted "Cancelled"; return 0; }
  fi

  cat > "$env_file" <<CONFIGEOF
# OpenAtlas persistent configuration — generated by ./dev.sh configure
# Override any value at runtime: KEY=val ./dev.sh up <profile>
OPENATLAS_DEPLOYMENT_PROFILE=${profile_id}
OPENATLAS_LAN_HOST=${lan_host}
OPENATLAS_STDB_URI_CUSTOM=${stdb_uri_custom}
OPENATLAS_INGEST_BASE_CUSTOM=${ingest_base_custom}
OPENATLAS_LLM_BASE_CUSTOM=${llm_base_custom}
OPENATLAS_STDB_DB_CUSTOM=${stdb_db_custom}
OPENATLAS_THEME=${theme}
OPENATLAS_UPDATE_INTERVAL=${interval}
OPENATLAS_LLM_PROVIDER=${llm_provider}
OPENATLAS_LLM_GEMINI_API_KEY=${llm_gemini_key}
OPENATLAS_LLM_GEMINI_MODEL=${llm_gemini_model}
OPENATLAS_LLM_OPENAI_BASE_URL=${llm_openai_base}
OPENATLAS_LLM_OPENAI_API_KEY=${llm_openai_key}
OPENATLAS_LLM_OPENAI_MODEL=${llm_openai_model}
CONFIGEOF
  style_ok "Wrote ${env_file}"
  style_muted "Run: ./dev.sh up \${OPENATLAS_DEPLOYMENT_PROFILE}  (or just: ./dev.sh up with profile menu)"
  if has_gum; then
    gum style --foreground 39 "Tip: you can still override any setting at the command line, e.g.:"
    gum style --foreground 39 "  OPENATLAS_THEME=light ./dev.sh up ${profile_id}"
  else
    style_muted "Tip: override at runtime: OPENATLAS_THEME=light ./dev.sh up ${profile_id}"
  fi
}

# ----------------------------------------------------------------------------
# Help + dispatch
# ----------------------------------------------------------------------------
print_help() {
    cat <<'HELP'
OpenAtlas dev harness  —  ./dev.sh <cmd>   or   make <target>

Full stack (STDB + ingest + LLM + Vite + opens browser) — use Run in TUI or:
  run                 Local hybrid (default)
  run:local:sim      run:local:live    run:local:hybrid
  run:cloud:sim      run:cloud:live
  up / up:hybrid      Same as run:local:hybrid
  up:sim | up:live    Full stack with that ingest mode (local STDB)
  up:cloud:sim|live   Full stack on Maincloud
  up:fast             Skip wasm/dist rebuild (OPENATLAS_SKIP_BUILD=1)

Deployment profiles (mirror the GUI — accept kebab or snake case):
  up:demo                  Synthetic data, no STDB
  up:cloud-live            Maincloud only, no local ingest
  up:cloud-ingest-sim      Maincloud STDB + LAN ingest (sim)
  up:cloud-ingest-live     Maincloud STDB + LAN ingest (live)
  up:cloud-ingest-hybrid   Maincloud STDB + LAN ingest (hybrid)
  up:local-sim             Local STDB + sim
  up:local-live            Local STDB + live
  up:local-hybrid          Local STDB + hybrid
  up:local-lan             Local STDB + live (LAN bind for devices)
  up:local-emulator        Local STDB + hybrid (10.0.2.2 for emulator)
  up:custom                Custom endpoints (set OPENATLAS_STDB_TARGET + _INGEST_MODE)
  Same profiles work with start:* (backend only, no Vite):
    start:cloud-ingest-sim   start:local-live   etc.

Configuration wizard (interactive TUI):
  configure | config    Walk through all settings and write to .env

Advanced / partial (./dev.sh menu → Advanced)
  web | web:cloud     Vite + auto-start/repair ingest (hybrid by default)
  web:demo            Demo UI only (no SpacetimeDB)
  start:*             Ingest only (no Vite)
  down                Stop everything (TUI Stop = same)

Cloud module
  spacetime:publish:cloud    Publish wasm to Maincloud (once per DB)

Test & build
  test | build | verify [--full] | e2e | e2e:quick | status | logs

Mobile (Capacitor — see docs/MOBILE.md)
  run-android | mobile:run        Maincloud QA on emulator (default)
  run-android:local               Local stack via 10.0.2.2
  run-android:maincloud           Same as run-android
  run-ios | mobile:ios            macOS only: build → Xcode
  mobile:doctor              Check/install JDK 17, SDK, adb, AVD
  mobile:setup | mobile:build | mobile:android | mobile:android:release
  mobile:dev                 Live reload against Vite (Android)

Advanced
  prove:live | prove:llm | feeds | spacetime:* | llm:* | ollama:start | ollama:cpu | cli | tail | clean

Config: ./dev.sh init-config  (see docs/CONFIG.md)
        ./dev.sh configure      Interactive TUI config → .env
Env: .env sets defaults; Run/web commands force local vs cloud STDB for ingest + Vite.
Menu: ./dev.sh  →  Run · Stop · Test · Configure · Advanced · Quit
HELP
}

menu_return_or_quit() {
    if has_gum; then
        gum input --placeholder "Enter = main menu" >/dev/null || return 1
    else
        read -r -p "Enter = main menu..." _ || return 1
    fi
    return 0
}

# Full-stack presets (STDB + ingest + Vite + browser). CLI: ./dev.sh run:local:sim etc.
menu_run_presets() {
    local r
    r="$(choose \
        "Local sim" \
        "Local live" \
        "Local hybrid" \
        "Local LAN" \
        "Local emulator" \
        "Cloud sim" \
        "Cloud live" \
        "Cloud + LAN (sim)" \
        "Cloud + LAN (live)" \
        "Cloud + LAN (hybrid)" \
        "Demo" \
        "Back")" || return
    case "$r" in
        "Local sim")            full_stack_up sim local ;;
        "Local live")           full_stack_up live local ;;
        "Local hybrid")         full_stack_up hybrid local ;;
        "Local LAN")            do_up_by_profile local_lan ;;
        "Local emulator")       do_up_by_profile local_emulator ;;
        "Cloud sim")            full_stack_up sim cloud ;;
        "Cloud live")           full_stack_up live cloud ;;
        "Cloud + LAN (sim)")    do_up_by_profile cloud_ingest_sim ;;
        "Cloud + LAN (live)")   do_up_by_profile cloud_ingest_live ;;
        "Cloud + LAN (hybrid)") do_up_by_profile cloud_ingest_hybrid ;;
        "Demo")                 do_up_by_profile demo ;;
        "Back"|"")              return ;;
        *)                      style_warn "unknown: $r" ;;
    esac
}

# Full profile selection (all 11 GUI profiles)
menu_up_profile() {
    local p
    p="$(choose \
        "Demo" \
        "Cloud live (Maincloud only)" \
        "Cloud + LAN ingest (sim)" \
        "Cloud + LAN ingest (live)" \
        "Cloud + LAN ingest (hybrid)" \
        "Local STDB (sim)" \
        "Local STDB (live)" \
        "Local STDB (hybrid)" \
        "Local STDB (LAN)" \
        "Local STDB (emulator)" \
        "Custom" \
        "Back")" || return
    case "$p" in
        "Demo")                           do_up_by_profile demo ;;
        "Cloud live (Maincloud only)")    do_up_by_profile cloud_live ;;
        "Cloud + LAN ingest (sim)")       do_up_by_profile cloud_ingest_sim ;;
        "Cloud + LAN ingest (live)")      do_up_by_profile cloud_ingest_live ;;
        "Cloud + LAN ingest (hybrid)")    do_up_by_profile cloud_ingest_hybrid ;;
        "Local STDB (sim)")               do_up_by_profile local_sim ;;
        "Local STDB (live)")              do_up_by_profile local_live ;;
        "Local STDB (hybrid)")            do_up_by_profile local_hybrid ;;
        "Local STDB (LAN)")               do_up_by_profile local_lan ;;
        "Local STDB (emulator)")          do_up_by_profile local_emulator ;;
        "Custom")                         do_up_by_profile custom ;;
        "Back"|"")                        return ;;
        *)                                style_warn "unknown: $p" ;;
    esac
}

menu_test() {
    local t
    t="$(choose \
        "Verify (health + runtime)" \
        "Unit + lint (fmt/clippy/test)" \
        "E2E quick" \
        "E2E full" \
        "Back")" || return
    case "$t" in
        "Verify (health + runtime)")     do_verify ;;
        "Unit + lint (fmt/clippy/test)") do_check ;;
        "E2E quick")                     "$SCRIPT_DIR/scripts/e2e-qa.sh" --quick ;;
        "E2E full")                      "$SCRIPT_DIR/scripts/e2e-qa.sh" ;;
        "Back"|"")                       return ;;
        *)                               style_warn "unknown: $t" ;;
    esac
}

menu_web_only() {
    local w
    w="$(choose \
        "Local STDB" \
        "Cloud (Maincloud)" \
        "Demo (no STDB)" \
        "Back")" || return
    case "$w" in
        "Local STDB")          do_dev_web_only local ;;
        "Cloud (Maincloud)")   do_dev_web_only cloud ;;
        "Demo (no STDB)")      do_dev_frontend_demo ;;
        "Back"|"")             return ;;
        *)                     style_warn "unknown: $w" ;;
    esac
}

menu_up_backend() {
    local u
    u="$(choose \
        "Local sim" \
        "Local live" \
        "Local hybrid" \
        "Cloud sim" \
        "Cloud live" \
        "Back")" || return
    case "$u" in
        "Local sim")     stack_up sim local ;;
        "Local live")    stack_up live local ;;
        "Local hybrid")  stack_up hybrid local ;;
        "Cloud sim")     stack_up sim cloud ;;
        "Cloud live")    stack_up live cloud ;;
        "Back"|"")       return ;;
        *)               style_warn "unknown: $u" ;;
    esac
}

menu_mobile() {
    local m
    local ios_label="Open iOS in Xcode (macOS only)"
    if [[ "$(uname -s)" != "Darwin" ]]; then
        ios_label="iOS — requires macOS + Xcode (skipped here)"
    fi
    m="$(choose \
        "Run Android — Maincloud QA (emulator, like phone)" \
        "Run Android — local dev stack (emulator)" \
        "$ios_label" \
        "Build + sync only (current target)" \
        "Assemble debug APK" \
        "Live reload (mobile:dev)" \
        "Setup (first time)" \
        "Back")" || return
    case "$m" in
        "Run Android — Maincloud QA (emulator, like phone)") do_mobile_run_maincloud ;;
        "Run Android — local dev stack (emulator)") do_mobile_run_local ;;
        "Open iOS in Xcode (macOS only)") do_mobile_ios ;;
        "iOS — requires macOS + Xcode (skipped here)")
            style_warn "iOS builds need macOS — see docs/MOBILE.md"
            ;;
        "Build + sync only (current target)") do_mobile_build ;;
        "Assemble debug APK")           do_mobile_android ;;
        "Live reload (mobile:dev)")     do_mobile_dev ;;
        "Setup (first time)")           do_mobile_setup ;;
        "Back"|"")                      return ;;
        *)                              style_warn "unknown: $m" ;;
    esac
}

menu_advanced() {
    local a
    a="$(choose \
        "Run — by profile..." \
        "Run — web only..." \
        "Run — backend only..." \
        "Configure" \
        "Mobile (Android / iOS)..." \
        "SpacetimeDB..." \
        "Ingest..." \
        "Observe (logs / feeds / status)" \
        "LLM bridge..." \
        "Prove live pipeline" \
        "Build all" \
        "Clean workspace" \
        "Command reference" \
        "Back")" || return
    case "$a" in
        "Run — by profile...")       menu_up_profile ;;
        "Run — web only...")         menu_web_only ;;
        "Run — backend only...")     menu_up_backend ;;
        "Configure")                 do_configure ;;
        "Mobile (Android / iOS)...") menu_mobile ;;
        "SpacetimeDB...")            menu_advanced_spacetime ;;
        "Ingest...")                 menu_advanced_ingest ;;
        "Observe (logs / feeds / status)")
            menu_advanced_observe ;;
        "LLM bridge...")             menu_advanced_llm ;;
        "Prove live pipeline")       do_prove_live ;;
        "Build all")                 do_build_all ;;
        "Clean workspace")           do_clean ;;
        "Command reference")         print_help ;;
        "Back"|"")                   return ;;
        *)                           style_warn "unknown: $a" ;;
    esac
}

menu_advanced_spacetime() {
    local s
    s="$(choose \
        "Build module" \
        "Start local" \
        "Publish local" \
        "Publish cloud" \
        "Stop local" \
        "Logs" \
        "Back")" || return
    case "$s" in
        "Build module")    do_spacetime_build ;;
        "Start local")     do_spacetime_start ;;
        "Publish local")   do_spacetime_publish ;;
        "Publish cloud")   do_spacetime_publish_cloud ;;
        "Stop local")      do_spacetime_stop ;;
        "Logs")            do_spacetime_logs ;;
        "Back"|"")         return ;;
        *)                 style_warn "unknown: $s" ;;
    esac
}

menu_advanced_ingest() {
    local i
    i="$(choose \
        "Start local sim" \
        "Start local live" \
        "Start local hybrid" \
        "Start cloud sim" \
        "Start cloud live" \
        "Stop ingest" \
        "Back")" || return
    case "$i" in
        "Start local sim")     start_server sim local ;;
        "Start local live")    start_server live local ;;
        "Start local hybrid")  start_server hybrid local ;;
        "Start cloud sim")     start_server sim cloud ;;
        "Start cloud live")    start_server live cloud ;;
        "Stop ingest")         stop_server ;;
        "Back"|"")             return ;;
        *)                     style_warn "unknown: $i" ;;
    esac
}

menu_advanced_observe() {
    local o
    o="$(choose \
        "Status" \
        "Feed health" \
        "Tail ingest log" \
        "Tail Vite log" \
        "Tail SpacetimeDB log" \
        "Back")" || return
    case "$o" in
        "Status")                 do_status ;;
        "Feed health")            do_feed_status ;;
        "Tail ingest log")        do_logs ;;
        "Tail Vite log")          do_vite_logs ;;
        "Tail SpacetimeDB log")   do_spacetime_logs ;;
        "Back"|"")                return ;;
        *)                        style_warn "unknown: $o" ;;
    esac
}

menu_advanced_llm() {
    local l
    l="$(choose \
        "Start Ollama" \
        "Start LLM bridge" \
        "Ollama CPU-only" \
        "Stop LLM bridge" \
        "Logs" \
        "Back")" || return
    case "$l" in
        "Start Ollama")       do_ollama_start ;;
        "Start LLM bridge")   start_llm_bridge ;;
        "Ollama CPU-only")    do_ollama_cpu ;;
        "Stop LLM bridge")    stop_llm_bridge ;;
        "Logs")               do_llm_logs ;;
        "Back"|"") return ;;
        *)        style_warn "unknown: $l" ;;
    esac
}

menu_blocks_after() {
    case "$1" in
        "Run"|"Run..."|"Stop"|"Test"|"Test..."|"Configure"|"Advanced"|"Advanced...") return 0 ;;
        *) return 1 ;;
    esac
}

menu() {
    local choice
    while true; do
        print_banner
        print_status_line
        choice="$(choose \
            "Run" \
            "Stop" \
            "Test" \
            "Configure" \
            "Advanced" \
            "Quit")" || break
        case "$choice" in
            "Run")       full_stack_up hybrid local ;;
            "Stop")      do_down ;;
            "Test")      menu_test ;;
            "Configure") do_configure ;;
            "Advanced")  menu_advanced ;;
            "Quit"|"")   break ;;
            *)           style_warn "unknown: $choice" ;;
        esac
        if menu_blocks_after "$choice"; then
            :
        elif [[ -n "$choice" ]]; then
            menu_return_or_quit || break
        fi
    done
    style_muted "bye"
}

main() {
    if [[ $# -eq 0 ]]; then
        menu
        return
    fi
    case "$1" in
        help|-h|--help)      print_help ;;

        # Up (full stack) — profile as arg or colon suffix
        all|up|up:hybrid)
            if [[ $# -ge 2 ]] && resolve_profile_id "$2" >/dev/null 2>&1; then
                do_up_by_profile "$2"
            else
                do_all
            fi
            ;;
        up:fast)             do_up_fast ;;
        up:live)             do_all_live ;;
        up:cloud:sim)        do_all_cloud_sim ;;
        up:cloud:live)       do_all_cloud_live ;;
        all:sim|up:sim)      do_all_sim ;;
        up:demo)             do_up_by_profile demo ;;
        up:cloud-live|up:cloud_live)            do_up_by_profile cloud_live ;;
        up:cloud-ingest-sim|up:cloud_ingest_sim) do_up_by_profile cloud_ingest_sim ;;
        up:cloud-ingest-live|up:cloud_ingest_live) do_up_by_profile cloud_ingest_live ;;
        up:cloud-ingest-hybrid|up:cloud_ingest_hybrid) do_up_by_profile cloud_ingest_hybrid ;;
        up:local-sim|up:local_sim)              do_up_by_profile local_sim ;;
        up:local-live|up:local_live)            do_up_by_profile local_live ;;
        up:local-hybrid|up:local_hybrid)        do_up_by_profile local_hybrid ;;
        up:local-lan|up:local_lan)              do_up_by_profile local_lan ;;
        up:local-emulator|up:local_emulator)    do_up_by_profile local_emulator ;;
        up:custom)             do_up_by_profile custom ;;

        down)                do_down ;;
        run)                 do_run ;;
        run:local:sim)       do_run_stack local sim ;;
        run:local:live)      do_run_stack local live ;;
        run:local:hybrid)    do_run_stack local hybrid ;;
        run:cloud:sim)       do_run_stack cloud sim ;;
        run:cloud:live)      do_run_stack cloud live ;;
        verify)              do_verify "${2:-}" ;;
        test)                do_check ;;

        # Profile-based start (backend only)
        start)               start_server live local ;;
        start:sim)           start_server sim local ;;
        start:live)          start_server live local ;;
        start:hybrid)        start_server hybrid local ;;
        start:static)        start_server static local ;;
        start:cloud:sim)     start_server sim cloud ;;
        start:cloud:live)    start_server live cloud ;;
        start:cloud:hybrid)  start_server hybrid cloud ;;
        start:demo)          do_start_by_profile demo ;;
        start:cloud-live|start:cloud_live)            do_start_by_profile cloud_live ;;
        start:cloud-ingest-sim|start:cloud_ingest_sim) do_start_by_profile cloud_ingest_sim ;;
        start:cloud-ingest-live|start:cloud_ingest_live) do_start_by_profile cloud_ingest_live ;;
        start:cloud-ingest-hybrid|start:cloud_ingest_hybrid) do_start_by_profile cloud_ingest_hybrid ;;
        start:local-sim|start:local_sim)              do_start_by_profile local_sim ;;
        start:local-live|start:local_live)            do_start_by_profile local_live ;;
        start:local-hybrid|start:local_hybrid)        do_start_by_profile local_hybrid ;;
        start:local-lan|start:local_lan)              do_start_by_profile local_lan ;;
        start:local-emulator|start:local_emulator)    do_start_by_profile local_emulator ;;
        start:custom)          do_start_by_profile custom ;;

        # Configuration
        configure|config)    do_configure ;;

        prove:live)          do_prove_live ;;
        prove:llm)           do_prove_llm ;;
        feeds|feed:status)   do_feed_status ;;
        web|web:local)       do_dev_web_only local ;;
        web:cloud)           do_dev_web_only cloud ;;
        web:demo)            do_dev_frontend_demo ;;
        check)               do_check ;;
        init-config)         do_init_config ;;
        clean:force)         stop_frontend_dev; do_clean_force ;;
        build)               do_build_all ;;
        build:frontend)      do_build_frontend ;;
        dev:frontend)        do_dev_frontend ;;
        build:cargo)         do_build_cargo ;;
        spacetime:build)     do_spacetime_build ;;
        spacetime:start)     do_spacetime_start ;;
        spacetime:publish)   do_spacetime_publish ;;
        spacetime:publish:cloud) do_spacetime_publish_cloud ;;
        spacetime:stop)      do_spacetime_stop ;;
        spacetime:logs)      do_spacetime_logs ;;
        stop)                stop_server ;;
        stop:all)            do_down ;;
        vite:logs)           do_vite_logs ;;
        llm:start)            start_llm_bridge ;;
        llm:stop)            stop_llm_bridge ;;
        llm:logs)            do_llm_logs ;;
        ollama:start)        do_ollama_start ;;
        ollama:cpu)          do_ollama_cpu ;;
        restart)             stop_server; start_server live local ;;
        status)              do_status ;;
        logs)                do_logs ;;
        dashboard)           do_open_dashboard ;;
        tui|tail)            do_tail_events ;;
        cli)                 do_cli ;;
        test|tests)          do_test ;;
        lint)                do_lint ;;
        e2e)                 "$SCRIPT_DIR/scripts/e2e-qa.sh" ;;
        e2e:quick)          "$SCRIPT_DIR/scripts/e2e-qa.sh" --quick ;;
        e2e:feeds)          "$SCRIPT_DIR/scripts/e2e-qa.sh" --verify-feeds ;;
        clean)               do_clean ;;
        run-android|mobile:run|run-android:maincloud) do_mobile_run_maincloud ;;
        run-android:local)   do_mobile_run_local ;;
        mobile:doctor)       do_mobile_doctor ;;
        mobile:setup)        do_mobile_setup ;;
        mobile:build)        do_mobile_build ;;
        mobile:android)      do_mobile_android ;;
        mobile:android:release) do_mobile_android_release ;;
        mobile:dev)          do_mobile_dev ;;
        run-ios|mobile:ios)  do_mobile_ios ;;
        *)
            style_err "unknown command: $1"
            print_help
            exit 1
            ;;
    esac
}

main "$@"
