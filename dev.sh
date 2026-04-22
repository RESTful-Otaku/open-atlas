#!/usr/bin/env bash
# OpenAtlas dev harness.
#
# Provides a single entry point for building, running, observing, and tearing
# down the OpenAtlas stack locally. Uses charmbracelet/gum for a polished TUI
# when available and falls back to plain bash output otherwise.
#
# Usage:
#   ./dev.sh                 Short interactive menu (install gum for a nicer TUI)
#   ./dev.sh <command>       Non-interactive, e.g.  up  down  web  all  all:sim  check
#   ./dev.sh help            Command list
#
# All long-running state (PID file, log file) lives under .dev/.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

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
: "${CARGO_HOME_LOCAL:=${SCRIPT_DIR}/.cargo-local}"
: "${READY_TIMEOUT_SECS:=45}"

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

# `openatlas-llm-bridge` (→ Ollama). Must match Vite's proxy in `web/vite.config.ts`.
# Set OPENATLAS_START_LLM=0 to skip auto-starting the bridge (Settings hub AI
# analysis will be unavailable until you run it manually).
: "${LLM_LISTEN_ADDR:=127.0.0.1:3847}"
: "${LLM_PID_FILE:=${DEV_DIR}/llm-bridge.pid}"
: "${LLM_LOG_FILE:=${DEV_DIR}/llm-bridge.log}"
: "${LLM_HEALTH_URL:=http://${LLM_LISTEN_ADDR}/health}"
: "${LLM_READY_TIMEOUT_SECS:=90}"

mkdir -p "$DEV_DIR"

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

server_pid() {
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
    local pid
    if pid="$(stdb_pid)"; then
        style_ok "● spacetimedb running (pid=${pid}, ${STDB_LISTEN_ADDR})"
    else
        style_warn "○ spacetimedb not running (run: ./dev.sh spacetime:start)"
    fi
    if pid="$(server_pid)"; then
        style_ok "● ingest running (pid=${pid})"
    else
        style_warn "○ ingest not running"
    fi
    if [[ -d "$FRONTEND_DIST_DIR" ]]; then
        style_info "● frontend bundle present at ${FRONTEND_DIST_DIR}/"
    else
        style_warn "○ frontend bundle missing (run: ./dev.sh build:frontend)"
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
do_build_frontend() {
    require_cmd bun "install from https://bun.sh"
    style_header "🔨 Building Svelte frontend (bun)"
    if [[ ! -d "${FRONTEND_DIR}/node_modules" ]]; then
        spin "bun install (${FRONTEND_DIR})" bash -c "cd '${FRONTEND_DIR}' && bun install --silent"
    fi
    spin "bun run build (${FRONTEND_DIR})" bash -c "cd '${FRONTEND_DIR}' && bun run build"
    style_ok "frontend bundle written to ${FRONTEND_DIST_DIR}/"
}

do_dev_frontend() {
    require_cmd bun "install from https://bun.sh"
    style_header "⚡ Vite dev server on :5173 (proxies :8080; bun)"
    if [[ ! -d "${FRONTEND_DIR}/node_modules" ]]; then
        spin "bun install (${FRONTEND_DIR})" bash -c "cd '${FRONTEND_DIR}' && bun install --silent"
    fi
    (cd "$FRONTEND_DIR" && bun run dev)
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
# Server lifecycle
# ----------------------------------------------------------------------------
start_server() {
    local with_live_feeds="$1"
    if server_pid >/dev/null; then
        style_warn "ingest already running (pid=$(server_pid))"
        return 0
    fi
    if ! stdb_pid >/dev/null; then
        style_warn "spacetimedb not running; starting and publishing module"
        do_spacetime_start
        do_spacetime_publish
    fi
    style_header "▶️  Starting openatlas-ingest (feeds → spacetimedb)"
    : > "$LOG_FILE"
    (
        if [[ "$with_live_feeds" == "1" ]]; then
            export OPENATLAS_ENABLE_LIVE_FEEDS=1
        else
            unset OPENATLAS_ENABLE_LIVE_FEEDS
        fi
        export RUST_LOG="${RUST_LOG:-openatlas_ingest=info,info}"
        export OPENATLAS_STDB_URI="${OPENATLAS_STDB_URI:-http://${STDB_LISTEN_ADDR}}"
        export OPENATLAS_STDB_DB="${OPENATLAS_STDB_DB:-${STDB_DB_NAME}}"
        nohup cargo run -p openatlas-ingest --quiet >>"$LOG_FILE" 2>&1 &
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
    if has_gum; then
        if gum spin --spinner meter --title "waiting for /ready (up to ${READY_TIMEOUT_SECS}s)" -- bash -c "
            while true; do
                if curl -sf ${READY_URL} >/dev/null 2>&1; then exit 0; fi
                sleep 1
                if [[ \$(date +%s) -gt ${deadline} ]]; then exit 1; fi
            done
        "; then
            style_ok "server ready at ${DASHBOARD_URL}"
        else
            style_err "server did not become ready within ${READY_TIMEOUT_SECS}s"
            style_muted "see $LOG_FILE for details"
            return 1
        fi
    else
        while true; do
            if curl -sf "$READY_URL" >/dev/null 2>&1; then
                style_ok "server ready at ${DASHBOARD_URL}"
                return 0
            fi
            if (( $(date +%s) > deadline )); then
                style_err "server did not become ready within ${READY_TIMEOUT_SECS}s"
                return 1
            fi
            sleep 1
        done
    fi
}

# ----------------------------------------------------------------------------
# LLM bridge (Ollama) — `openatlas-llm-bridge` on LLM_LISTEN_ADDR (default :3847)
# ----------------------------------------------------------------------------

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
    if llm_bridge_pid >/dev/null; then
        style_warn "openatlas-llm-bridge already running (pid=$(llm_bridge_pid))"
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
            else
                style_warn "Ollama not ready — start \`ollama serve\` and \`ollama pull ${OPENATLAS_OLLAMA_MODEL:-llama3.2}\` (see bridge log: $LLM_LOG_FILE)"
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
    if pid="$(server_pid)"; then
        style_ok "server running (pid=${pid})"
    else
        style_warn "server not running"
        return 0
    fi
    require_cmd curl
    if curl -sf "$HEALTH_URL" >/dev/null; then
        style_ok "/health -> ok"
    fi
    local status
    if status="$(curl -sf "$STATUS_URL" 2>/dev/null)"; then
        if command -v jq >/dev/null 2>&1; then
            echo "$status" | jq '.'
        else
            echo "$status"
        fi
    else
        style_warn "/status not reachable yet"
    fi
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
    if ! server_pid >/dev/null; then
        style_warn "server not running; starting (simulated feeds)"
        start_server 0
    fi
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
do_all() {
    style_header "Full stack (live open-data feeds)"
    do_spacetime_build
    do_spacetime_start
    do_spacetime_publish
    do_build_frontend
    start_server 1
    do_open_dashboard
    style_muted "Start the web app with: ./dev.sh web  (Vite on :5173; proxies ingest + /api/llm → ${LLM_LISTEN_ADDR})"
}

do_all_sim() {
    style_header "Full stack (simulated feeds only)"
    do_spacetime_build
    do_spacetime_start
    do_spacetime_publish
    do_build_frontend
    start_server 0
    do_open_dashboard
    style_muted "Start the web app with: ./dev.sh web  (Vite on :5173)"
}

do_check() {
    local ec=0
    do_test || ec=1
    do_lint || ec=1
    return "$ec"
}

do_dev_frontend_demo() {
    require_cmd bun "install from https://bun.sh"
    style_header "Vite dev server (DEMO / no SpacetimeDB) on :5173"
    if [[ ! -d "${FRONTEND_DIR}/node_modules" ]]; then
        spin "bun install (${FRONTEND_DIR})" bash -c "cd '${FRONTEND_DIR}' && bun install --silent"
    fi
    (cd "$FRONTEND_DIR" && VITE_DEMO_DATA=1 bun run dev)
}

# ----------------------------------------------------------------------------
# Help + dispatch
# ----------------------------------------------------------------------------
print_help() {
    cat <<'HELP'
OpenAtlas dev harness  —  ./dev.sh   or   ./dev.sh <command>

Common (automation / CI)
  all                 Full stack: build + SpacetimeDB + ingest (live open-data) + open browser
  all:sim             Same with simulated feeds only (no live API adapters)
  up                  Alias for all:sim (safe default)
  up:live             Alias for all
  down                Stop ingest, LLM bridge, and SpacetimeDB
  web                 Vite dev on :5173 (expects backend; proxies to ingest/LLM)
  web:demo            Vite on :5173 with VITE_DEMO_DATA=1 (UI only, no SpacetimeDB)
  status              /health and ingest /status
  build               Spacetime module + web dist + cargo release build
  check               test + lint
  clean               Stops services; cargo clean; optional wipe .dev stdb data (prompt)

  test | lint
  e2e | e2e:quick
  stop | restart | logs | dashboard
  spacetime:* | start | start:sim | llm:*   (unchanged, see "Advanced" below)

Advanced (same as before; useful for one-off control)
  spacetime:build|start|publish|stop|logs
  start               Ingest with OPENATLAS_ENABLE_LIVE_FEEDS=1
  start:sim           Ingest simulators only
  stop                Ingest only
  stop:all            Ingest + LLM + SpacetimeDB
  llm:start|stop|logs
  build:frontend      web/dist only
  build:cargo         Rust only
  dev:frontend        Same as "web"
  tail | cli
  help                This text

State under .dev/  (PID + logs).  Install gum for a better menu TUI: https://github.com/charmbracelet/gum
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

menu_advanced() {
    local a
    a="$(choose \
        "Spacetime — build" \
        "Spacetime — start" \
        "Spacetime — publish" \
        "Spacetime — stop" \
        "Spacetime — logs" \
        "Ingest — start (live)" \
        "Ingest — start (sim)" \
        "Ingest — stop" \
        "Ingest — restart (live)" \
        "LLM — start" \
        "LLM — stop" \
        "LLM — logs" \
        "Tail — ingest" \
        "Tail — SpacetimeDB" \
        "E2E QA" \
        "E2E quick" \
        "Print full command list" \
        "Back")" || return
    case "$a" in
        "Spacetime — build")        do_spacetime_build ;;
        "Spacetime — start")        do_spacetime_start ;;
        "Spacetime — publish")      do_spacetime_publish ;;
        "Spacetime — stop")         do_spacetime_stop ;;
        "Spacetime — logs")        do_spacetime_logs ;;
        "Ingest — start (live)")   start_server 1 ;;
        "Ingest — start (sim)")    start_server 0 ;;
        "Ingest — stop")            stop_server ;;
        "Ingest — restart (live)")  stop_server; start_server 1 ;;
        "LLM — start")              start_llm_bridge ;;
        "LLM — stop")               stop_llm_bridge ;;
        "LLM — logs")               do_llm_logs ;;
        "Tail — ingest")            do_logs ;;
        "Tail — SpacetimeDB")      do_spacetime_logs ;;
        "E2E QA")                  "$SCRIPT_DIR/scripts/e2e-qa.sh" ;;
        "E2E quick")                "$SCRIPT_DIR/scripts/e2e-qa.sh" --quick ;;
        "Print full command list")
            style_muted "Primary commands in ./dev.sh help. Granular: spacetime:* start:sim start …"
            ;;
        "Back"|"")                  return ;;
        *)                          style_warn "unknown: $a" ;;
    esac
}

menu() {
    local choice
    while true; do
        print_banner
        print_status_line
        # Short labels: easy to read, script / gum friendly (no emoji in match strings)
        choice="$(choose \
            "1  Full stack - LIVE (build+open-data+open browser)" \
            "2  Full stack - SIM only (build+ingest+open browser)" \
            "3  Web - Vite :5173 (HMR, use with backend running)" \
            "4  Web - DEMO (VITE_DEMO_DATA, no SpacetimeDB)" \
            "5  Open browser" \
            "6  Stop ALL" \
            "7  Status" \
            "8  Build (module + web + rust release)" \
            "9  Check (test + lint)" \
            "10 Clean" \
            "11 Advanced..." \
            "12 Help" \
            "13 Quit")" || break
        case "$choice" in
            "1  Full stack - LIVE (build+open-data+open browser)")
                do_all
                ;;
            "2  Full stack - SIM only (build+ingest+open browser)")
                do_all_sim
                ;;
            "3  Web - Vite :5173 (HMR, use with backend running)")
                do_dev_frontend
                ;;
            "4  Web - DEMO (VITE_DEMO_DATA, no SpacetimeDB)")
                do_dev_frontend_demo
                ;;
            "5  Open browser")
                do_open_dashboard
                ;;
            "6  Stop ALL")
                stop_server
                stop_llm_bridge
                do_spacetime_stop
                ;;
            "7  Status")
                do_status
                ;;
            "8  Build (module + web + rust release)")
                do_build_all
                ;;
            "9  Check (test + lint)")
                do_check
                ;;
            "10 Clean")
                do_clean
                ;;
            "11 Advanced...")
                menu_advanced
                ;;
            "12 Help")
                print_help
                ;;
            "13 Quit"|"")
                break
                ;;
            *)
                style_warn "unknown: $choice"
                ;;
        esac
        case "$choice" in
            "3  Web - Vite :5173 (HMR, use with backend running)"|"4  Web - DEMO (VITE_DEMO_DATA, no SpacetimeDB)"|"13 Quit"|"")
                : # Vite runs until Ctrl+C; Quit leaves
                ;;
            *)
                if [[ -n "$choice" ]]; then
                    menu_return_or_quit || break
                fi
                ;;
        esac
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
        all)                 do_all ;;
        all:sim)             do_all_sim ;;
        up)                  do_all_sim ;;
        up:live)             do_all ;;
        down)                stop_server; stop_llm_bridge; do_spacetime_stop ;;
        web)                 do_dev_frontend ;;
        web:demo)            do_dev_frontend_demo ;;
        check)               do_check ;;
        build)               do_build_all ;;
        build:frontend)      do_build_frontend ;;
        dev:frontend)        do_dev_frontend ;;
        build:cargo)         do_build_cargo ;;
        spacetime:build)     do_spacetime_build ;;
        spacetime:start)     do_spacetime_start ;;
        spacetime:publish)   do_spacetime_publish ;;
        spacetime:stop)      do_spacetime_stop ;;
        spacetime:logs)      do_spacetime_logs ;;
        start)               start_server 1 ;;
        start:sim)           start_server 0 ;;
        stop)                stop_server ;;
        stop:all)            stop_server; stop_llm_bridge; do_spacetime_stop ;;
        llm:start)            start_llm_bridge ;;
        llm:stop)            stop_llm_bridge ;;
        llm:logs)            do_llm_logs ;;
        restart)             stop_server; start_server 1 ;;
        status)              do_status ;;
        logs)                do_logs ;;
        dashboard)           do_open_dashboard ;;
        tui|tail)            do_tail_events ;;
        cli)                 do_cli ;;
        test|tests)          do_test ;;
        lint)                do_lint ;;
        e2e)                 "$SCRIPT_DIR/scripts/e2e-qa.sh" ;;
        e2e:quick)          "$SCRIPT_DIR/scripts/e2e-qa.sh" --quick ;;
        clean)               do_clean ;;
        *)
            style_err "unknown command: $1"
            print_help
            exit 1
            ;;
    esac
}

main "$@"
