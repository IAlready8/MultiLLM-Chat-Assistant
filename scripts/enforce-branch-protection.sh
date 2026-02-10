#!/usr/bin/env bash
set -euo pipefail

REPO="${1:-}"

if ! command -v gh >/dev/null 2>&1; then
  echo "ERROR: GitHub CLI (gh) is required."
  exit 1
fi

if [[ -z "$REPO" ]]; then
  REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || true)"
fi

if [[ -z "$REPO" ]]; then
  echo "ERROR: Could not resolve repository. Pass it explicitly, e.g.:"
  echo "  bash scripts/enforce-branch-protection.sh IAlready8/MultiLLM-Chat-Assistant"
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "ERROR: GitHub CLI auth is invalid or missing."
  echo "Run: gh auth login -h github.com"
  exit 1
fi

echo "Applying branch protection to ${REPO}:main ..."

TMP_JSON="$(mktemp)"
cat >"${TMP_JSON}" <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["Quality Checks", "Smoke Tests"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null
}
JSON

gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  "repos/${REPO}/branches/main/protection" \
  --input "${TMP_JSON}" >/dev/null

rm -f "${TMP_JSON}"

echo "Branch protection updated successfully."
echo "Required checks:"
echo " - Quality Checks"
echo " - Smoke Tests"
