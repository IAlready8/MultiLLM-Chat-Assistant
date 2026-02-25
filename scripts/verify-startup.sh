#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
HEALTH_PATH="${HEALTH_PATH:-/api/health}"
TARGET="${BASE_URL%/}${HEALTH_PATH}"

echo "[verify-startup] Probing ${TARGET}"

if curl -fsS "$TARGET" >/dev/null; then
  echo "[verify-startup] OK: application is reachable."
  exit 0
fi

echo "[verify-startup] ERROR: unable to reach ${TARGET}"
exit 1
