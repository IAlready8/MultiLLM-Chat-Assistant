#!/usr/bin/env bash
set -euo pipefail

ENV_FILE=""
PROD=false

print_usage() {
  cat <<USAGE
Usage: bash scripts/build-vercel.sh [--env-file <path>] [--prod]
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file)
      if [[ $# -lt 2 ]]; then
        echo '[build:vercel] Missing value for --env-file' >&2
        print_usage >&2
        exit 1
      fi
      ENV_FILE="$2"
      shift 2
      ;;
    --prod)
      PROD=true
      shift
      ;;
    -h|--help)
      print_usage
      exit 0
      ;;
    *)
      echo "[build:vercel] Unknown option: $1" >&2
      print_usage >&2
      exit 1
      ;;
  esac
done

args=(npx vercel build)
if [[ "$PROD" == true ]]; then
  args+=(--prod)
fi

if [[ -n "$ENV_FILE" ]]; then
  if [[ ! -f "$ENV_FILE" ]]; then
    echo "[build:vercel] Missing env file: $ENV_FILE" >&2
    exit 1
  fi
  node scripts/run-with-dotenv.js "$ENV_FILE" "${args[@]}"
else
  "${args[@]}"
fi
