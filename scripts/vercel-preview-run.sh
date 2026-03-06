#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

BRANCH="${VERCEL_PREVIEW_BRANCH:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --branch)
      BRANCH="${2:-}"
      shift 2
      ;;
    --help)
      cat <<'EOF'
Usage: bash scripts/vercel-preview-run.sh [--branch <git-branch>] -- <command...>

Examples:
  bash scripts/vercel-preview-run.sh -- npm run build
  bash scripts/vercel-preview-run.sh --branch main -- npm run dev
EOF
      exit 0
      ;;
    --)
      shift
      break
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

if [[ $# -eq 0 ]]; then
  echo "ERROR: Missing command to run. Use -- <command...>" >&2
  exit 1
fi

if [[ -z "$BRANCH" ]]; then
  BRANCH="$(git branch --show-current)"
fi

if [[ -z "$BRANCH" ]]; then
  echo "ERROR: Could not determine git branch. Pass --branch explicitly." >&2
  exit 1
fi

ENV_FILE="$(mktemp /tmp/multillm-vercel-preview-env.XXXXXX)"
rm -f "$ENV_FILE"
cleanup() {
  rm -f "$ENV_FILE"
}
trap cleanup EXIT

echo "[vercel-preview-run] Pulling preview env for branch: $BRANCH"
./node_modules/.bin/vercel env pull \
  "$ENV_FILE" \
  --environment preview \
  --git-branch "$BRANCH" \
  --yes

echo "[vercel-preview-run] Running: $*"
node scripts/run-with-dotenv.js "$ENV_FILE" "$@"
