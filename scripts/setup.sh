#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

LEGACY_SCHEMA_PATH="prisma/schema.legacy.from-scripts-setup.prisma"

echo "[setup] Starting project setup in $ROOT_DIR"
if [[ -f "$LEGACY_SCHEMA_PATH" ]]; then
  echo "[setup] Legacy schema snapshot preserved at $LEGACY_SCHEMA_PATH"
fi

if [[ -f "scripts/setup-complete.sh" ]]; then
  exec bash scripts/setup-complete.sh "$@"
fi

echo "[setup] scripts/setup-complete.sh not found."
exit 1
