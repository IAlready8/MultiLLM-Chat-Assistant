#!/usr/bin/env bash
set -euo pipefail

ENV_FILE=".env.local"

if [[ "${1:-}" == "--env-file" && -n "${2:-}" ]]; then
  ENV_FILE="$2"
fi

echo '[preflight] Validating environment and quick checks'
bash scripts/validate-env.sh --mode local --env-file "$ENV_FILE"
npm run type-check
npm run lint

echo '[preflight] Ready for local development or deployment verification'
