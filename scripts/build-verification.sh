#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[build-verification] Running lint..."
npm run lint

echo "[build-verification] Running type-check..."
npm run type-check

echo "[build-verification] Running tests..."
npm run test:run

echo "[build-verification] Running production build..."
npm run build

echo "[build-verification] All verification checks passed."
