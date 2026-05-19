#!/usr/bin/env bash
# Verify openatlas-llm-bridge and Ollama respond to a minimal insight request.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LLM_BASE="${OPENATLAS_LLM_BASE:-http://127.0.0.1:3847}"

echo "==> LLM bridge health: ${LLM_BASE}/health"
curl -sf "${LLM_BASE}/health" >/dev/null

echo "==> Ollama ready: ${LLM_BASE}/v1/ready"
curl -sf "${LLM_BASE}/v1/ready" >/dev/null

echo "==> Model inference: ${LLM_BASE}/v1/capable (may take ~2 min on CPU)"
if ! curl -sf --max-time 180 "${LLM_BASE}/v1/capable" >/dev/null; then
  echo "prove-llm: inference probe failed. If you see CUDA errors, restart Ollama with:" >&2
  echo "  ./scripts/ollama-serve-cpu.sh   # or CUDA_VISIBLE_DEVICES=\"\" ollama serve" >&2
  exit 1
fi

echo "==> POST /v1/insight (minimal snapshot)"
payload='{"snapshot":{"schema":"openatlas.llm_snapshot/v1","captured_at":"2026-01-01T00:00:00Z","world_state":[{"domain":"energy","event_count":3,"avg_severity":0.5,"risk_index":0.5}],"domain_insights":[],"recent_events":[{"id":"1","ordinal":1,"domain":"energy","timestamp":"2026-01-01T00:00:00Z","severity_score":0.9,"has_location":false,"location":null}],"recent_signals":[],"causal_edges_sample":[],"event_narrative_headlines":[]},"user_prompt":"Reply with exactly: LLM_OK"}'

resp="$(curl -sf -X POST "${LLM_BASE}/v1/insight" \
  -H 'Content-Type: application/json' \
  -d "${payload}")"

if ! echo "$resp" | jq -e '.text | length > 0' >/dev/null 2>&1; then
  echo "Unexpected response: $resp" >&2
  exit 1
fi

model="$(echo "$resp" | jq -r '.model // "unknown"')"
echo "LLM stack verified (model: ${model})"
