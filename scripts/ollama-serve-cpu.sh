#!/usr/bin/env bash
# Run Ollama in CPU-only mode (hides GPUs from the runner).
#
# Needed when Ollama's CUDA backend targets newer GPU architectures than yours
# (e.g. GTX 1070 + Ollama 0.23+: "architectural feature absent from the device").
# Setting num_gpu=0 in API requests is not enough — restart the server with GPUs hidden.
#
# Usage:
#   ./scripts/ollama-serve-cpu.sh              # foreground on :11434
#   ./scripts/ollama-serve-cpu.sh --background   # logs to .dev/ollama-cpu.log
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEV_DIR="${ROOT}/.dev"
BG=0
for a in "$@"; do
  [[ "$a" == "--background" || "$a" == "-d" ]] && BG=1
done

export CUDA_VISIBLE_DEVICES=""
export OLLAMA_HOST="${OLLAMA_HOST:-127.0.0.1:11434}"

HOST_PORT="${OLLAMA_HOST#http://}"
HOST_PORT="${HOST_PORT#https://}"
if curl -sf "http://${HOST_PORT}/api/tags" >/dev/null 2>&1; then
  echo "ollama-serve-cpu: Ollama already listening on ${OLLAMA_HOST}."
  echo "  Stop the existing server first (systemctl --user stop ollama, or kill the process),"
  echo "  then re-run this script so it starts with CUDA_VISIBLE_DEVICES=\"\"."
  exit 1
fi

mkdir -p "$DEV_DIR"
echo "ollama-serve-cpu: starting CPU-only Ollama on ${OLLAMA_HOST} (CUDA_VISIBLE_DEVICES=\"\")"

if [[ "$BG" -eq 1 ]]; then
  : >"${DEV_DIR}/ollama-cpu.log"
  nohup ollama serve >>"${DEV_DIR}/ollama-cpu.log" 2>&1 &
  echo $! >"${DEV_DIR}/ollama-cpu.pid"
  echo "  pid=$(cat "${DEV_DIR}/ollama-cpu.pid") log=${DEV_DIR}/ollama-cpu.log"
  for _ in $(seq 1 30); do
    curl -sf "http://127.0.0.1:11434/api/tags" >/dev/null 2>&1 && break
    sleep 1
  done
  echo "ollama-serve-cpu: ready"
else
  exec ollama serve
fi
