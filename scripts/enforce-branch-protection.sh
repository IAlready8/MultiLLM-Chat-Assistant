#!/usr/bin/env bash
set -euo pipefail

REPO="${1:-}"
API_BASE="https://api.github.com"

resolve_repo_from_remote() {
  local remote_url
  remote_url="$(git config --get remote.origin.url 2>/dev/null || true)"
  if [[ -z "${remote_url}" ]]; then
    return 1
  fi

  # Supports:
  # - git@github.com:owner/repo.git
  # - https://github.com/owner/repo.git
  # - https://github.com/owner/repo
  remote_url="${remote_url#git@github.com:}"
  remote_url="${remote_url#https://github.com/}"
  remote_url="${remote_url%.git}"

  if [[ "${remote_url}" == */* ]]; then
    printf '%s\n' "${remote_url}"
    return 0
  fi
  return 1
}

if [[ -z "${REPO}" ]]; then
  if command -v gh >/dev/null 2>&1; then
    REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || true)"
  fi
fi

if [[ -z "${REPO}" ]]; then
  REPO="$(resolve_repo_from_remote || true)"
fi

if [[ -z "${REPO}" ]]; then
  echo "ERROR: Could not resolve repository. Pass it explicitly, e.g.:"
  echo "  bash scripts/enforce-branch-protection.sh IAlready8/MultiLLM-Chat-Assistant"
  exit 1
fi

TMP_JSON="$(mktemp)"
cat >"${TMP_JSON}" <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["Quality Checks", "Smoke Tests", "Coverage", "Security Audit"]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 0,
    "require_last_push_approval": false
  },
  "required_conversation_resolution": true,
  "restrictions": null
}
JSON

echo "Applying branch protection to ${REPO}:main ..."

if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  gh api \
    --method PUT \
    -H "Accept: application/vnd.github+json" \
    "repos/${REPO}/branches/main/protection" \
    --input "${TMP_JSON}" >/dev/null
elif [[ -n "${GITHUB_TOKEN:-}" ]]; then
  curl -fsS -X PUT \
    -H "Accept: application/vnd.github+json" \
    -H "Authorization: Bearer ${GITHUB_TOKEN}" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    "${API_BASE}/repos/${REPO}/branches/main/protection" \
    --data "@${TMP_JSON}" >/dev/null
else
  rm -f "${TMP_JSON}"
  echo "ERROR: No valid GitHub auth available."
  echo "Either:"
  echo "  1) run: gh auth login -h github.com"
  echo "  2) export GITHUB_TOKEN=<token-with-repo-admin-rights>"
  exit 1
fi

rm -f "${TMP_JSON}"

echo "Branch protection updated successfully."
echo "Required checks:"
echo " - Quality Checks"
echo " - Smoke Tests"
echo " - Coverage"
echo " - Security Audit"
echo "Additional protections:"
echo " - Admin enforcement: enabled"
echo " - PR required: enabled (approvals required: 0)"
echo " - Dismiss stale reviews: enabled"
echo " - Last push approval: disabled (enable when an independent reviewer is available)"
echo " - Conversation resolution: enabled"
