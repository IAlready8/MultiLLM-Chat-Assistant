#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

BLOCKERS=0
WARNINGS=0

ok() {
  echo -e "${GREEN}PASS${NC} $1"
}

warn() {
  echo -e "${YELLOW}WARN${NC} $1"
  WARNINGS=$((WARNINGS + 1))
}

block() {
  echo -e "${RED}BLOCK${NC} $1"
  BLOCKERS=$((BLOCKERS + 1))
}

section() {
  echo
  echo -e "${BLUE}$1${NC}"
}

section "Next Upgrade Readiness"

echo "Repository: $ROOT_DIR"

NODE_VERSION_RAW="$(node -v 2>/dev/null || true)"
NPM_VERSION_RAW="$(npm -v 2>/dev/null || true)"
NEXT_VERSION_RAW="$(node -p "(require('./package.json').dependencies||{}).next || (require('./package.json').devDependencies||{}).next || ''")"

section "Runtime / Toolchain"
if [[ -z "$NODE_VERSION_RAW" ]]; then
  block "Node.js is not installed"
else
  NODE_MAJOR="${NODE_VERSION_RAW#v}"
  NODE_MAJOR="${NODE_MAJOR%%.*}"
  echo "Node: $NODE_VERSION_RAW"
  echo "npm:  ${NPM_VERSION_RAW:-unknown}"
  echo "Next dependency: ${NEXT_VERSION_RAW:-missing}"

  if [[ "$NODE_MAJOR" -lt 20 ]]; then
    block "Node $NODE_VERSION_RAW detected. Next 15/16 migration requires Node 20+"
  elif [[ "$NODE_MAJOR" -gt 22 ]]; then
    warn "Node $NODE_VERSION_RAW is newer than common CI/runtime baselines (20/22 LTS). Consider pinning CI/dev to 20 or 22."
  else
    ok "Node major version is compatible with Next 15/16 migration track"
  fi
fi

section "Critical Routing Guards"
if rg -n "'/api/health'|\"/api/health\"" middleware.ts >/dev/null 2>&1; then
  ok "Strict-auth middleware includes /api/health public exemption"
else
  block "Missing /api/health public exemption in middleware"
fi

if rg -n "'/api/webhooks'|\"/api/webhooks\"" middleware.ts >/dev/null 2>&1; then
  ok "Strict-auth middleware includes /api/webhooks public exemption"
else
  block "Missing /api/webhooks public exemption in middleware"
fi

section "Provider / Streaming Contract Drift"
if rg -n "NotImplementedError\('AnthropicService|NotImplementedError\('GoogleAIService" services/llm-providers >/dev/null 2>&1; then
  warn "Provider service layer still contains placeholders (Anthropic/Google). /api/llm/chat and /api/llm/stream are not fully unified."
else
  ok "Provider services do not contain placeholder NotImplementedError stubs"
fi

if rg -n "streamChatMessage\(|/api/llm/chat" app/api/llm/stream/route.ts services/api-service.ts >/dev/null 2>&1; then
  warn "Streaming currently traverses a separate service layer; run parity tests after Next upgrade."
fi

section "Framework Migration Signals"
if rg -n "removeConsole:\s*true|removeConsole:\s*process\.env\.NODE_ENV" next.config.mjs >/dev/null 2>&1; then
  warn "Review production log strategy; console stripping can hide server diagnostics"
else
  ok "Production console stripping is not enabled"
fi

if rg -n "from 'next/router'|from \"next/router\"" app components lib services >/dev/null 2>&1; then
  warn "Found next/router imports. Validate App Router compatibility during upgrade"
else
  ok "No next/router imports found in app/components/lib/services"
fi

if rg -n "cookies\(|headers\(" app lib >/dev/null 2>&1; then
  warn "Found cookies()/headers() usage. Re-validate dynamic rendering behavior after Next major upgrade"
else
  ok "No cookies()/headers() calls detected"
fi

section "Release Gates"
if npm run -s type-check >/dev/null 2>&1; then
  ok "type-check currently passes"
else
  block "type-check fails before upgrade"
fi

if npm run -s lint >/dev/null 2>&1; then
  ok "lint currently passes"
else
  block "lint fails before upgrade"
fi

if npm run -s test:run >/dev/null 2>&1; then
  ok "tests currently pass"
else
  block "tests fail before upgrade"
fi

echo
TOTAL_ISSUES=$((BLOCKERS + WARNINGS))
echo "Summary: ${BLOCKERS} blockers, ${WARNINGS} warnings (${TOTAL_ISSUES} findings)"

if [[ "$BLOCKERS" -gt 0 ]]; then
  echo -e "${RED}Upgrade readiness: BLOCKED${NC}"
  exit 2
fi

echo -e "${GREEN}Upgrade readiness: PASS WITH WARNINGS${NC}"
exit 0
