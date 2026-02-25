#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

find scripts -type f -name "*.sh" -exec chmod +x {} +

if [[ -f "dev.sh" ]]; then
  chmod +x dev.sh
fi

if [[ -f "build.sh" ]]; then
  chmod +x build.sh
fi

echo "[fix-file-perms] Updated executable permissions for shell scripts."
