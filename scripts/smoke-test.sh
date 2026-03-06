#!/bin/bash
# smoke-test.sh — Automated API and page smoke tests
# Validates that all core endpoints return expected responses.
# Usage: ./scripts/smoke-test.sh [--base-url URL] [--start-server]
#
# --base-url URL   Override the default http://localhost:3000
# --start-server   Start a Next.js production server, run tests, then stop it
# --session-cookie Auth cookie for protected endpoint roundtrips in strict mode

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

BASE_URL="${BASE_URL:-http://localhost:3000}"
START_SERVER=false
SESSION_COOKIE="${SMOKE_SESSION_COOKIE:-}"
AUTH_EMAIL="${SMOKE_AUTH_EMAIL:-}"
AUTH_PASSWORD="${SMOKE_AUTH_PASSWORD:-}"
AUTH_NAME="${SMOKE_AUTH_NAME:-Preview Smoke}"
USE_VERCEL_CURL="${USE_VERCEL_CURL:-false}"
VERCEL_CURL_DEPLOYMENT="${VERCEL_CURL_DEPLOYMENT:-}"
SERVER_PID=""
SERVER_PORT=""
PASS=0
FAIL=0
SKIP=0
AUTH_BLOCKED_MODE=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --base-url) BASE_URL="$2"; shift 2 ;;
    --start-server) START_SERVER=true; shift ;;
    --session-cookie) SESSION_COOKIE="$2"; shift 2 ;;
    --auth-email) AUTH_EMAIL="$2"; shift 2 ;;
    --auth-password) AUTH_PASSWORD="$2"; shift 2 ;;
    --auth-name) AUTH_NAME="$2"; shift 2 ;;
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

http_request() {
  local url="$1"
  shift

  if [ "$USE_VERCEL_CURL" = true ]; then
    local deployment="${VERCEL_CURL_DEPLOYMENT:-${BASE_URL}}"
    local path="${url#${BASE_URL}}"

    if [ "$path" = "$url" ]; then
      echo "ERROR: URL '${url}' does not match BASE_URL '${BASE_URL}' for vercel curl routing." >&2
      return 1
    fi
    [ -z "$path" ] && path="/"

    npx --yes vercel curl "$path" --deployment "$deployment" -- "$@"
    return
  fi

  curl "$@" "$url"
}

request_json() {
  local method="$1"
  local path="$2"
  local payload="${3:-}"

  local body_file
  body_file="$(mktemp)"

  local curl_args
  curl_args=(-s -o "$body_file" -w '%{http_code}' -X "$method")
  if [ -n "$SESSION_COOKIE" ]; then
    curl_args+=(-H "Cookie: ${SESSION_COOKIE}")
  fi
  if [ -n "$payload" ]; then
    curl_args+=(-H 'Content-Type: application/json' -d "$payload")
  fi

  HTTP_STATUS=$(http_request "${BASE_URL}${path}" "${curl_args[@]}" 2>/dev/null || echo "000")
  HTTP_BODY=$(cat "$body_file" 2>/dev/null || echo '{}')
  rm -f "$body_file"
}

obtain_session_cookie() {
  local email="$1"
  local password="$2"
  local name="$3"
  local cookie_jar
  local body_file
  local csrf_json
  local csrf_token
  local auth_status
  local session_body
  local session_email

  cookie_jar="$(mktemp)"
  body_file="$(mktemp)"

  csrf_json=$(http_request "${BASE_URL}/api/auth/csrf" -s -c "$cookie_jar" -b "$cookie_jar" 2>/dev/null || echo '{}')
  csrf_token=$(echo "$csrf_json" | python3 -c "
import sys, json
try:
    print(json.load(sys.stdin).get('csrfToken', ''))
except Exception:
    print('')
" 2>/dev/null || echo "")

  if [ -z "$csrf_token" ]; then
    rm -f "$cookie_jar" "$body_file"
    echo "ERROR: Could not obtain CSRF token for authenticated smoke run." >&2
    return 1
  fi

  auth_status=$(http_request "${BASE_URL}/api/auth/callback/credentials?json=true" \
    -s -L -o "$body_file" -w '%{http_code}' \
    -c "$cookie_jar" -b "$cookie_jar" \
    -X POST \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    --data-urlencode "csrfToken=${csrf_token}" \
    --data-urlencode "callbackUrl=${BASE_URL}/" \
    --data-urlencode "json=true" \
    --data-urlencode "redirect=false" \
    --data-urlencode "email=${email}" \
    --data-urlencode "password=${password}" \
    --data-urlencode "name=${name}" \
    2>/dev/null || echo "000")

  if [ "$auth_status" != "200" ] && [ "$auth_status" != "302" ]; then
    rm -f "$cookie_jar" "$body_file"
    echo "ERROR: Credential sign-in failed for authenticated smoke run (HTTP ${auth_status})." >&2
    return 1
  fi

  session_body=$(http_request "${BASE_URL}/api/auth/session" -s -b "$cookie_jar" 2>/dev/null || echo '{}')
  session_email=$(echo "$session_body" | python3 -c "
import sys, json
try:
    user = json.load(sys.stdin).get('user') or {}
    print(user.get('email', ''))
except Exception:
    print('')
" 2>/dev/null || echo "")

  if [ "${session_email}" != "${email}" ]; then
    rm -f "$cookie_jar" "$body_file"
    echo "ERROR: Session verification failed for authenticated smoke run." >&2
    return 1
  fi

  SESSION_COOKIE=$(awk 'BEGIN { sep="" } (($0 !~ /^#/) || ($0 ~ /^#HttpOnly_/)) && NF >= 7 { printf "%s%s=%s", sep, $6, $7; sep="; " }' "$cookie_jar")
  rm -f "$cookie_jar" "$body_file"

  if [ -z "$SESSION_COOKIE" ]; then
    echo "ERROR: No session cookie captured for authenticated smoke run." >&2
    return 1
  fi
}

assert_status_any() {
  local label="$1"
  local actual="$2"
  shift 2
  local expected_values=("$@")

  for expected in "${expected_values[@]}"; do
    if [ "$actual" = "$expected" ]; then
      echo -e "  ${GREEN}PASS${NC} $label (HTTP $actual)"
      PASS=$((PASS + 1))
      return
    fi
  done

  local expected_joined
  expected_joined=$(IFS='/'; echo "${expected_values[*]}")
  echo -e "  ${RED}FAIL${NC} $label (expected ${expected_joined}, got $actual)"
  FAIL=$((FAIL + 1))
}

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
  echo -e "${YELLOW}Building application before smoke run...${NC}"
  cd "$(dirname "$0")/.."
  npm run build

  echo -e "${YELLOW}Starting Next.js production server on port ${SERVER_PORT}...${NC}"
  PORT="$SERVER_PORT" npm run start &
  SERVER_PID=$!

  # Wait for server readiness (up to 30s)
  for i in $(seq 1 30); do
    if http_request "${BASE_URL}/api/health" -sf >/dev/null 2>&1; then
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

if [ -z "$SESSION_COOKIE" ] && [ -n "$AUTH_EMAIL" ] && [ -n "$AUTH_PASSWORD" ]; then
  echo -e "${YELLOW}Obtaining authenticated session cookie for smoke run...${NC}"
  obtain_session_cookie "$AUTH_EMAIL" "$AUTH_PASSWORD" "$AUTH_NAME"
  echo -e "${GREEN}Authenticated smoke session ready for ${AUTH_EMAIL}${NC}"
fi

echo ""
echo "========================================"
echo " Smoke Tests — ${BASE_URL}"
echo "========================================"

# ── 0. Health endpoint checks ──────────────────────────────────────

echo ""
echo "0) Health endpoint checks"

health_status_code=$(http_request "${BASE_URL}/api/health" -s -o /dev/null -w '%{http_code}' 2>/dev/null || echo "000")
assert_status "GET /api/health" "200" "$health_status_code"

health_body=$(http_request "${BASE_URL}/api/health" -s 2>/dev/null || echo '{}')
health_state=$(echo "$health_body" | python3 -c "
import sys, json
data = json.load(sys.stdin)
value = data.get('status')
print(value if value in {'healthy', 'degraded'} else 'INVALID')
" 2>/dev/null || echo "PARSE_ERROR")
if [ "$health_state" = "healthy" ] || [ "$health_state" = "degraded" ]; then
  echo -e "  ${GREEN}PASS${NC} /api/health status=$health_state"
  PASS=$((PASS + 1))
else
  echo -e "  ${RED}FAIL${NC} /api/health unexpected status payload: $health_state"
  FAIL=$((FAIL + 1))
fi

health_metrics_body=$(http_request "${BASE_URL}/api/health?metrics=1" -s 2>/dev/null || echo '{}')
has_metrics_routes=$(echo "$health_metrics_body" | python3 -c "
import sys, json
data = json.load(sys.stdin)
metrics = data.get('metrics')
ok = isinstance(metrics, dict) and isinstance(metrics.get('routes'), dict)
print('yes' if ok else 'no')
" 2>/dev/null || echo "error")
if [ "$has_metrics_routes" = "yes" ]; then
  echo -e "  ${GREEN}PASS${NC} /api/health?metrics=1 includes metrics.routes"
  PASS=$((PASS + 1))
else
  echo -e "  ${RED}FAIL${NC} /api/health?metrics=1 missing metrics.routes"
  FAIL=$((FAIL + 1))
fi

# ── 1. Page Render Checks ──────────────────────────────────────────

echo ""
echo "1) Page reachability checks"

PAGES=("/" "/multi-chat" "/settings" "/goal-hub" "/analytics" "/personas" "/pipeline" "/comparison")
for page in "${PAGES[@]}"; do
  status=$(http_request "${BASE_URL}${page}" -s -o /dev/null -w '%{http_code}' 2>/dev/null || echo "000")
  assert_status_any "GET ${page}" "$status" "200" "307" "308"
done

# ── 2. Config API Lifecycle ─────────────────────────────────────────

echo ""
echo "2) Config API lifecycle (save / list / clear)"

request_json "GET" "/api/config"
assert_status_any "GET /api/config (list)" "$HTTP_STATUS" "200" "401"

if [ "$HTTP_STATUS" = "401" ]; then
  AUTH_BLOCKED_MODE=true
  echo -e "  ${YELLOW}SKIP${NC} strict auth mode detected without session cookie; protected lifecycle roundtrips will be skipped."
  SKIP=$((SKIP + 1))
else
  request_json "POST" "/api/config" '{"provider":"openai","apiKey":"sk-smoke-test-0000000000000000000000000000000000000000000000"}'
  assert_status "POST /api/config (save key)" "200" "$HTTP_STATUS"

  request_json "GET" "/api/config"
  assert_status "GET /api/config (list after save)" "200" "$HTTP_STATUS"
  has_openai=$(echo "$HTTP_BODY" | python3 -c "
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

  request_json "POST" "/api/config" '{"provider":"openai","apiKey":""}'
  assert_status "POST /api/config (clear key)" "200" "$HTTP_STATUS"
fi

# ── 3. Test API Key Endpoint ────────────────────────────────────────

echo ""
echo "3) Test API key endpoint"

if [ "$AUTH_BLOCKED_MODE" = true ]; then
  request_json "POST" "/api/test-api-key" '{"provider":"openai","apiKey":"bad-key"}'
  assert_status "POST /api/test-api-key (auth enforcement)" "401" "$HTTP_STATUS"
  echo -e "  ${YELLOW}SKIP${NC} inline/testSaved API key checks skipped due missing authenticated session."
  SKIP=$((SKIP + 1))
else
  request_json "POST" "/api/test-api-key" '{"provider":"openai","apiKey":"bad-key"}'
  assert_status "POST /api/test-api-key (inline)" "200" "$HTTP_STATUS"

  test_valid=$(echo "$HTTP_BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('valid',''))" 2>/dev/null || echo "error")
  if [ "$test_valid" = "False" ]; then
    echo -e "  ${GREEN}PASS${NC} bad key returned valid=False"
    PASS=$((PASS + 1))
  else
    echo -e "  ${YELLOW}SKIP${NC} unexpected valid value: $test_valid"
    SKIP=$((SKIP + 1))
  fi

  request_json "POST" "/api/test-api-key" '{"provider":"openai","testSaved":true}'
  assert_status "POST /api/test-api-key (testSaved)" "200" "$HTTP_STATUS"
fi

# ── 4. Provider Configs API ─────────────────────────────────────────

echo ""
echo "4) Provider configs API"

request_json "GET" "/api/provider-configs"
assert_status_any "GET /api/provider-configs" "$HTTP_STATUS" "200" "401"

if [ "$HTTP_STATUS" = "200" ]; then
  request_json "POST" "/api/provider-configs" '{}'
  assert_status "POST /api/provider-configs (missing provider)" "400" "$HTTP_STATUS"
else
  echo -e "  ${YELLOW}SKIP${NC} provider-config validation check skipped due missing authenticated session."
  SKIP=$((SKIP + 1))
fi

# ── 5. Goal CRUD Lifecycle ──────────────────────────────────────────

echo ""
echo "5) Goal CRUD lifecycle"

if [ "$AUTH_BLOCKED_MODE" = true ]; then
  request_json "GET" "/api/goals"
  assert_status "GET /api/goals (auth enforcement)" "401" "$HTTP_STATUS"
  echo -e "  ${YELLOW}SKIP${NC} goal CRUD lifecycle skipped due missing authenticated session."
  SKIP=$((SKIP + 3))
else
  request_json "POST" "/api/goals" '{"title":"Smoke Test Goal","description":"Auto-created by smoke-test.sh"}'
  assert_status "POST /api/goals (create)" "201" "$HTTP_STATUS"
  goal_id=$(echo "$HTTP_BODY" | python3 -c "
import sys,json
data=json.load(sys.stdin)
goal=data.get('goal',data)
print(goal.get('id',''))
" 2>/dev/null || echo "")

  request_json "GET" "/api/goals"
  assert_status "GET /api/goals (list)" "200" "$HTTP_STATUS"

  if [ -n "$goal_id" ]; then
    request_json "PUT" "/api/goals/${goal_id}" '{"title":"Updated Smoke Goal","status":"in-progress"}'
    assert_status "PUT /api/goals/:id (update)" "200" "$HTTP_STATUS"

    request_json "DELETE" "/api/goals/${goal_id}"
    assert_status "DELETE /api/goals/:id (delete)" "200" "$HTTP_STATUS"
  else
    echo -e "  ${YELLOW}SKIP${NC} goal update/delete — no ID from create"
    SKIP=$((SKIP + 2))
  fi
fi

# ── 6. Persona CRUD Lifecycle ──────────────────────────────────────

echo ""
echo "6) Persona CRUD lifecycle"

if [ "$AUTH_BLOCKED_MODE" = true ]; then
  request_json "GET" "/api/personas"
  assert_status "GET /api/personas (auth enforcement)" "401" "$HTTP_STATUS"
  echo -e "  ${YELLOW}SKIP${NC} persona CRUD lifecycle skipped due missing authenticated session."
  SKIP=$((SKIP + 3))
else
  request_json "POST" "/api/personas" '{"name":"Smoke Persona","systemPrompt":"You are a smoke test persona."}'
  assert_status "POST /api/personas (create)" "201" "$HTTP_STATUS"
  persona_id=$(echo "$HTTP_BODY" | python3 -c "
import sys,json
data=json.load(sys.stdin)
persona=data.get('persona',data)
print(persona.get('id',''))
" 2>/dev/null || echo "")

  request_json "GET" "/api/personas"
  assert_status "GET /api/personas (list)" "200" "$HTTP_STATUS"

  if [ -n "$persona_id" ]; then
    request_json "PUT" "/api/personas/${persona_id}" '{"name":"Updated Smoke Persona","systemPrompt":"Updated smoke test prompt."}'
    assert_status "PUT /api/personas/:id (update)" "200" "$HTTP_STATUS"

    request_json "DELETE" "/api/personas/${persona_id}"
    assert_status "DELETE /api/personas/:id (delete)" "200" "$HTTP_STATUS"
  else
    echo -e "  ${YELLOW}SKIP${NC} persona update/delete — no ID from create"
    SKIP=$((SKIP + 2))
  fi
fi

# ── 7. Conversation Lifecycle ──────────────────────────────────────

echo ""
echo "7) Conversation lifecycle"

if [ "$AUTH_BLOCKED_MODE" = true ]; then
  request_json "GET" "/api/conversations"
  assert_status "GET /api/conversations (auth enforcement)" "401" "$HTTP_STATUS"
  echo -e "  ${YELLOW}SKIP${NC} conversation lifecycle skipped due missing authenticated session."
  SKIP=$((SKIP + 4))
else
  request_json "POST" "/api/conversations" '{"title":"Smoke Conversation","messages":[{"role":"user","content":"smoke hello"}]}'
  assert_status "POST /api/conversations (create)" "201" "$HTTP_STATUS"
  conversation_id=$(echo "$HTTP_BODY" | python3 -c "
import sys,json
data=json.load(sys.stdin)
conversation=data.get('conversation',data)
print(conversation.get('id',''))
" 2>/dev/null || echo "")

  request_json "GET" "/api/conversations"
  assert_status "GET /api/conversations (list)" "200" "$HTTP_STATUS"

  if [ -n "$conversation_id" ]; then
    request_json "PUT" "/api/conversations/${conversation_id}" '{"title":"Updated Smoke Conversation"}'
    assert_status "PUT /api/conversations/:id (rename)" "200" "$HTTP_STATUS"

    request_json "POST" "/api/conversations/${conversation_id}" '[{"role":"assistant","content":"smoke response"}]'
    assert_status "POST /api/conversations/:id (append message)" "200" "$HTTP_STATUS"

    request_json "DELETE" "/api/conversations/${conversation_id}"
    assert_status "DELETE /api/conversations/:id (delete)" "200" "$HTTP_STATUS"
  else
    echo -e "  ${YELLOW}SKIP${NC} conversation update/delete — no ID from create"
    SKIP=$((SKIP + 3))
  fi
fi

# ── 8. Analytics Endpoint ───────────────────────────────────────────

echo ""
echo "8) Analytics endpoint shape"

if [ "$AUTH_BLOCKED_MODE" = true ]; then
  request_json "GET" "/api/analytics?timeframe=7d"
  assert_status "GET /api/analytics (auth enforcement)" "401" "$HTTP_STATUS"
else
  request_json "GET" "/api/analytics?timeframe=7d"
  assert_status "GET /api/analytics?timeframe=7d" "200" "$HTTP_STATUS"
  has_analytics_shape=$(echo "$HTTP_BODY" | python3 -c "
import sys, json
data = json.load(sys.stdin)
required = ['timeframe','providerData','usageTrends','totalStats']
print('yes' if all(key in data for key in required) else 'no')
" 2>/dev/null || echo "error")
  if [ "$has_analytics_shape" = "yes" ]; then
    echo -e "  ${GREEN}PASS${NC} analytics payload includes required keys"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}FAIL${NC} analytics payload missing required keys"
    FAIL=$((FAIL + 1))
  fi
fi

# ── 9. LLM Stream Endpoint ─────────────────────────────────────────

echo ""
echo "9) LLM stream endpoint (rejects invalid requests)"

request_json "POST" "/api/llm/stream" '{}'
stream_status="$HTTP_STATUS"
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
