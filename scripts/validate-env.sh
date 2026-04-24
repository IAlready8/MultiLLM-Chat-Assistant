#!/usr/bin/env bash
set -euo pipefail

MODE="local"
ENV_FILE=".env.local"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode)
      MODE="$2"
      shift 2
      ;;
    --env-file)
      ENV_FILE="$2"
      shift 2
      ;;
    -h|--help)
      cat <<USAGE
Usage: bash scripts/validate-env.sh [options]

Options:
  --mode <local|production>  Validation profile (default: local)
  --env-file <path>          Env file to inspect (default: .env.local)
USAGE
      exit 0
      ;;
    *)
      echo "[env:validate] Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[env:validate] Missing env file: $ENV_FILE" >&2
  exit 1
fi

required_local=(
  "NEXTAUTH_URL"
  "API_KEY_ENCRYPTION_SEED"
)

required_production=(
  "DATABASE_URL"
  "NEXTAUTH_SECRET"
  "NEXTAUTH_URL"
  "API_KEY_ENCRYPTION_SEED"
)

if [[ "$MODE" == "production" ]]; then
  required=("${required_production[@]}")
else
  required=("${required_local[@]}")
fi

missing=0
for key in "${required[@]}"; do
  if ! grep -Eq "^${key}=.+" "$ENV_FILE"; then
    echo "[env:validate] Missing or empty: $key"
    missing=1
  fi
done

if [[ $missing -ne 0 ]]; then
  echo "[env:validate] FAILED ($MODE profile)"
  exit 1
fi

echo "[env:validate] OK ($MODE profile) using $ENV_FILE"
