#!/usr/bin/env bash
# Source from dev.sh: load gitignored env files into the current shell.
# Safe to source multiple times; does not override variables already set.

load_env_file() {
  local f="$1"
  [[ -f "$f" ]] || return 0
  set -a
  # shellcheck disable=SC1090
  source "$f"
  set +a
}

load_env_file "${SCRIPT_DIR:-.}/.env"
load_env_file "${SCRIPT_DIR:-.}/.dev/local.env"

apply_feed_secrets_json() {
  local secrets="${OPENATLAS_FEED_SECRETS:-${SCRIPT_DIR:-.}/.dev/feed-secrets.json}"
  [[ -f "$secrets" ]] || return 0
  if ! command -v jq >/dev/null 2>&1; then
    return 0
  fi
  while IFS= read -r line; do
    local key="${line%%=*}"
    local val="${line#*=}"
    if [[ -z "${!key:-}" ]]; then
      export "$key=$val"
    fi
  done < <(jq -r 'to_entries[] | "\(.key)=\(.value)"' "$secrets")
}

apply_feed_secrets_json
