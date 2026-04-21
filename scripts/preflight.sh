#!/usr/bin/env bash
set -euo pipefail

ENV_FILE=".env.local"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file)
      ENV_FILE="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: bash scripts/preflight.sh [--env-file <path>]"
      exit 0
      ;;
    *)
      echo "[preflight] Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

echo '[preflight] Validating environment and quick checks'
bash scripts/validate-env.sh --mode local --env-file "$ENV_FILE"
npm run type-check
npm run lint

echo '[preflight] Ready for local development or deployment verification'
