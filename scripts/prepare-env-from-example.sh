#!/usr/bin/env bash
set -euo pipefail

SOURCE_FILE=".env.example"
TARGET_FILE=".env.local"
FORCE=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --source)
      SOURCE_FILE="$2"
      shift 2
      ;;
    --target)
      TARGET_FILE="$2"
      shift 2
      ;;
    --force)
      FORCE=true
      shift
      ;;
    -h|--help)
      cat <<USAGE
Usage: bash scripts/prepare-env-from-example.sh [options]

Options:
  --source <path>   Source env template file (default: .env.example)
  --target <path>   Destination env file (default: .env.local)
  --force           Overwrite destination file if it exists
USAGE
      exit 0
      ;;
    *)
      echo "[prepare-env] Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

if [[ ! -f "$SOURCE_FILE" ]]; then
  echo "[prepare-env] Missing source file: $SOURCE_FILE" >&2
  exit 1
fi

if [[ -f "$TARGET_FILE" && "$FORCE" != true ]]; then
  echo "[prepare-env] $TARGET_FILE already exists. Use --force to overwrite."
  exit 0
fi

cp "$SOURCE_FILE" "$TARGET_FILE"
echo "[prepare-env] Wrote $TARGET_FILE from $SOURCE_FILE"

echo "[prepare-env] Next steps:"
echo "  1) Fill real keys/secrets in $TARGET_FILE"
echo "  2) Run: npm run env:validate"
