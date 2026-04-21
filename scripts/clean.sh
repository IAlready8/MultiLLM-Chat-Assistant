#!/usr/bin/env bash
set -euo pipefail

DEEP=false
ALL=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --deep)
      DEEP=true
      shift
      ;;
    --all)
      DEEP=true
      ALL=true
      shift
      ;;
    -h|--help)
      cat <<USAGE
Usage: bash scripts/clean.sh [--deep] [--all]

  --deep   Also remove coverage and test artifacts
  --all    Deep clean plus remove lockfile and local env files
USAGE
      exit 0
      ;;
    *)
      echo "[clean] Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

rm -rf .next
rm -rf node_modules/.cache
rm -rf .turbo

echo "[clean] Removed build caches (.next, node_modules/.cache, .turbo)"

if [[ "$DEEP" == true ]]; then
  rm -rf coverage
  rm -rf test-results
  rm -rf playwright-report
  echo "[clean] Removed deep artifacts (coverage/test reports)"
fi

if [[ "$ALL" == true ]]; then
  rm -f package-lock.json
  rm -f .env.local
  echo "[clean] Removed lock/env files for full reset"
fi
