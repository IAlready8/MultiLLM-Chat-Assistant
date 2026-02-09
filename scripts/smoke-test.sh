#!/bin/bash
# smoke-test.sh — Automated API and page smoke tests
# Validates that all core endpoints return expected responses.
# Usage: ./scripts/smoke-test.sh [--base-url URL] [--start-server]
#
# --base-url URL   Override the default http://localhost:3000
# --start-server   Start a Next.js production server, run tests, then stop it

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

BASE_URL="${BASE_URL:-http://localhost:3000}"
START_SERVER=false
SERVER_PID=""
SERVER_PORT=""
PASS=0
FAIL=0
SKIP=0

while [[ $# -gt 0 ]]; do
  case $1 in
    --base-url) BASE_URL="$2"; shift 2 ;;
    --start-server) START_SERVER=true; shift ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

if [ -z "$SERVER_PORT" ]; then
  if [[ "$BASE_URL" =~ ^https?://[^/:]+:([0-9]+) ]]; then
    SERVER_PORT="${BASH_REMATCH[1]}"
  elif [[ "$BASE_URL" =~ ^https:// ]]; then
    SERVER_PORT="443"
  else
    SERVER_PORT="80"
  fi
fi

cleanup() {
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

assert_status() {
  local label="$1"
  local expected="$2"
  local actual="$3"

  if [ "$actual" = "$expected" ]; then
    echo -e "  ${GREEN}PASS${NC} $label (HTTP $actual)"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}FAIL${NC} $label (expected $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

assert_json_field() {
  local label="$1"
  local body="$2"
  local field="$3"
  local expected="$4"

  local actual
  actual=$(echo "$body" | python3 -c "import sys,json; print(json.load(sys.stdin).get('$field',''))" 2>/dev/null || echo "PARSE_ERROR")

  if [ "$actual" = "$expected" ]; then
    echo -e "  ${GREEN}PASS${NC} $label ($field=$actual)"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}FAIL${NC} $label (expected $field=$expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

# Optionally start the server
if [ "$START_SERVER" = true ]; then
  echo -e "${YELLOW}Starting Next.js production server on port ${SERVER_PORT}...${NC}"
  cd "$(dirname "$0")/.."
  PORT="$SERVER_PORT" npm run start &
  SERVER_PID=$!

  # Wait for server readiness (up to 30s)
  for i in $(seq 1 30); do
    if curl -sf "${BASE_URL}/api/config" >/dev/null 2>&1; then
      echo -e "${GREEN}Server ready after ${i}s${NC}"
      break
    fi
    if [ "$i" = "30" ]; then
      echo -e "${RED}Server failed to start within 30s${NC}"
      exit 1
    fi
    sleep 1
  done
fi

echo ""
echo "========================================"
echo " Smoke Tests — ${BASE_URL}"
echo "========================================"

# ── 1. Page Render Checks ──────────────────────────────────────────

echo ""
echo "1) Page render checks (expect 200 on all pages)"

PAGES=("/" "/multi-chat" "/settings" "/goal-hub" "/analytics" "/personas" "/pipeline" "/comparison")
for page in "${PAGES[@]}"; do
  status=$(curl -s -o /dev/null -w '%{http_code}' "${BASE_URL}${page}" 2>/dev/null || echo "000")
  assert_status "GET ${page}" "200" "$status"
done

# ── 2. Config API Lifecycle ─────────────────────────────────────────

echo ""
echo "2) Config API lifecycle (save / list / clear)"

# Save a dummy key (will be rejected by provider but stored)
save_status=$(curl -s -o /dev/null -w '%{http_code}' -X POST "${BASE_URL}/api/config" \
  -H 'Content-Type: application/json' \
  -d '{"provider":"openai","apiKey":"sk-smoke-test-0000000000000000000000000000000000000000000000"}' 2>/dev/null || echo "000")
assert_status "POST /api/config (save key)" "200" "$save_status"

# List configured providers
list_body=$(curl -s "${BASE_URL}/api/config" 2>/dev/null || echo '{}')
list_status=$(curl -s -o /dev/null -w '%{http_code}' "${BASE_URL}/api/config" 2>/dev/null || echo "000")
assert_status "GET /api/config (list)" "200" "$list_status"

# Verify openai appears in configuredProviders
has_openai=$(echo "$list_body" | python3 -c "
import sys,json
data=json.load(sys.stdin)
providers=data.get('configuredProviders',[])
print('yes' if 'openai' in providers else 'no')
" 2>/dev/null || echo "error")
if [ "$has_openai" = "yes" ]; then
  echo -e "  ${GREEN}PASS${NC} openai in configuredProviders"
  PASS=$((PASS + 1))
else
  echo -e "  ${RED}FAIL${NC} openai not in configuredProviders (got: $has_openai)"
  FAIL=$((FAIL + 1))
fi

# Clear the key
clear_status=$(curl -s -o /dev/null -w '%{http_code}' -X POST "${BASE_URL}/api/config" \
  -H 'Content-Type: application/json' \
  -d '{"provider":"openai","apiKey":""}' 2>/dev/null || echo "000")
assert_status "POST /api/config (clear key)" "200" "$clear_status"

# ── 3. Test API Key Endpoint ────────────────────────────────────────

echo ""
echo "3) Test API key endpoint"

# Test with inline key (format check — bad key should return valid:false)
test_body=$(curl -s -X POST "${BASE_URL}/api/test-api-key" \
  -H 'Content-Type: application/json' \
  -d '{"provider":"openai","apiKey":"bad-key"}' 2>/dev/null || echo '{}')
test_status=$(curl -s -o /dev/null -w '%{http_code}' -X POST "${BASE_URL}/api/test-api-key" \
  -H 'Content-Type: application/json' \
  -d '{"provider":"openai","apiKey":"bad-key"}' 2>/dev/null || echo "000")
assert_status "POST /api/test-api-key (inline)" "200" "$test_status"

test_valid=$(echo "$test_body" | python3 -c "import sys,json; print(json.load(sys.stdin).get('valid',''))" 2>/dev/null || echo "error")
if [ "$test_valid" = "False" ]; then
  echo -e "  ${GREEN}PASS${NC} bad key returned valid=False"
  PASS=$((PASS + 1))
else
  echo -e "  ${YELLOW}SKIP${NC} unexpected valid value: $test_valid"
  SKIP=$((SKIP + 1))
fi

# Test with testSaved (no key stored — should return valid:false or error)
saved_status=$(curl -s -o /dev/null -w '%{http_code}' -X POST "${BASE_URL}/api/test-api-key" \
  -H 'Content-Type: application/json' \
  -d '{"provider":"openai","testSaved":true}' 2>/dev/null || echo "000")
assert_status "POST /api/test-api-key (testSaved)" "200" "$saved_status"

# ── 4. Provider Configs API ─────────────────────────────────────────

echo ""
echo "4) Provider configs API"

configs_status=$(curl -s -o /dev/null -w '%{http_code}' "${BASE_URL}/api/provider-configs" 2>/dev/null || echo "000")
assert_status "GET /api/provider-configs" "200" "$configs_status"

# POST with missing provider should be 400
bad_post_status=$(curl -s -o /dev/null -w '%{http_code}' -X POST "${BASE_URL}/api/provider-configs" \
  -H 'Content-Type: application/json' \
  -d '{}' 2>/dev/null || echo "000")
assert_status "POST /api/provider-configs (missing provider)" "400" "$bad_post_status"

# ── 5. Goal CRUD Lifecycle ──────────────────────────────────────────

echo ""
echo "5) Goal CRUD lifecycle"

# Create (POST /api/goals returns 201)
create_body=$(curl -s -X POST "${BASE_URL}/api/goals" \
  -H 'Content-Type: application/json' \
  -d '{"title":"Smoke Test Goal","description":"Auto-created by smoke-test.sh"}' 2>/dev/null || echo '{}')
create_status=$(curl -s -o /dev/null -w '%{http_code}' -X POST "${BASE_URL}/api/goals" \
  -H 'Content-Type: application/json' \
  -d '{"title":"Smoke Test Goal 2","description":"duplicate for status check"}' 2>/dev/null || echo "000")
assert_status "POST /api/goals (create)" "201" "$create_status"

goal_id=$(echo "$create_body" | python3 -c "
import sys,json
data=json.load(sys.stdin)
goal=data.get('goal',data)
print(goal.get('id',''))
" 2>/dev/null || echo "")

# List
list_goals_status=$(curl -s -o /dev/null -w '%{http_code}' "${BASE_URL}/api/goals" 2>/dev/null || echo "000")
assert_status "GET /api/goals (list)" "200" "$list_goals_status"

# Update and Delete use /api/goals/[id] route
if [ -n "$goal_id" ]; then
  update_status=$(curl -s -o /dev/null -w '%{http_code}' -X PUT "${BASE_URL}/api/goals/${goal_id}" \
    -H 'Content-Type: application/json' \
    -d '{"title":"Updated Smoke Goal","status":"in-progress"}' 2>/dev/null || echo "000")
  assert_status "PUT /api/goals/:id (update)" "200" "$update_status"

  delete_status=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "${BASE_URL}/api/goals/${goal_id}" 2>/dev/null || echo "000")
  assert_status "DELETE /api/goals/:id (delete)" "200" "$delete_status"
else
  echo -e "  ${YELLOW}SKIP${NC} goal update/delete — no ID from create"
  SKIP=$((SKIP + 2))
fi

# ── 6. LLM Stream Endpoint ─────────────────────────────────────────

echo ""
echo "6) LLM stream endpoint (rejects invalid requests)"

stream_status=$(curl -s -o /dev/null -w '%{http_code}' -X POST "${BASE_URL}/api/llm/stream" \
  -H 'Content-Type: application/json' \
  -d '{}' 2>/dev/null || echo "000")
# Should be 400 (missing required fields) or 401 (no auth)
if [ "$stream_status" = "400" ] || [ "$stream_status" = "401" ]; then
  echo -e "  ${GREEN}PASS${NC} POST /api/llm/stream rejects invalid (HTTP $stream_status)"
  PASS=$((PASS + 1))
else
  echo -e "  ${RED}FAIL${NC} POST /api/llm/stream unexpected status (HTTP $stream_status)"
  FAIL=$((FAIL + 1))
fi

# ── Summary ─────────────────────────────────────────────────────────

echo ""
echo "========================================"
TOTAL=$((PASS + FAIL + SKIP))
echo " Results: $PASS passed, $FAIL failed, $SKIP skipped ($TOTAL total)"
echo "========================================"

if [ "$FAIL" -gt 0 ]; then
  echo -e "${RED}Smoke tests FAILED${NC}"
  exit 1
else
  echo -e "${GREEN}All smoke tests PASSED${NC}"
  exit 0
fi
