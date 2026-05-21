#!/usr/bin/env bash
# Sync canonical brand assets from media/ into web/public/ for Vite + Capacitor.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="${ROOT}/media"
DEST="${ROOT}/web/public"

if [[ ! -f "${SRC}/logo.png" ]]; then
  echo "missing ${SRC}/logo.png" >&2
  exit 1
fi

mkdir -p "$DEST"
cp -f "${SRC}/logo.png" "${DEST}/logo.png"
echo "synced logo.png → web/public/logo.png"

# Prefer a real multi-size .ico for browser tabs; fall back to media/logo.ico
if command -v magick >/dev/null 2>&1 || command -v convert >/dev/null 2>&1; then
  MG() { if command -v magick >/dev/null 2>&1; then magick "$@"; else convert "$@"; fi; }
  MG "${SRC}/logo.png" -define icon:auto-resize=64,48,32,16 "${DEST}/logo.ico"
  echo "built logo.ico (multi-size) → web/public/logo.ico"
elif [[ -f "${SRC}/logo.ico" ]]; then
  cp -f "${SRC}/logo.ico" "${DEST}/logo.ico"
  echo "synced logo.ico → web/public/logo.ico"
else
  cp -f "${SRC}/logo.png" "${DEST}/logo.ico"
  echo "copied logo.png as logo.ico (install ImageMagick for a proper .ico)"
fi
