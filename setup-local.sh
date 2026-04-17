#!/usr/bin/env bash

# =============================================================================
# setup-local.sh - MultiLLM Chat Assistant local bootstrap
# =============================================================================
# Idempotent. Safe to re-run. Run from the project root.
#
# Usage:
# chmod +x setup-local.sh && ./setup-local.sh
# ./setup-local.sh --skip-install
# ./setup-local.sh --skip-db
# ./setup-local.sh --reset-secrets
# ./setup-local.sh --inject-llm-keys
#
# Rollback:
# rm -f .env.local .server.pid .prisma-active-schema prisma/dev.db
# security delete-generic-password -s multillm-local 2>/dev/null || true
# rm -rf .venv node_modules
# =============================================================================

set -euo pipefail

# -----------------------------------------------------------------------------
# CLI flags
# -----------------------------------------------------------------------------
SKIP_INSTALL=0
SKIP_DB=0
RESET_SECRETS=0
INJECT_LLM_KEYS=0

for arg in "$@"; do
  case "$arg" in
    --skip-install) SKIP_INSTALL=1 ;;
    --skip-db) SKIP_DB=1 ;;
    --reset-secrets) RESET_SECRETS=1 ;;
    --inject-llm-keys) INJECT_LLM_KEYS=1 ;;
  esac
done

# -----------------------------------------------------------------------------
# Output helpers
# -----------------------------------------------------------------------------
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'

ok() {
  printf "${GREEN}[ok]${NC}  %s\n" "$1"
}
info() {
  printf "${CYAN}[--]${NC}  %s\n" "$1"
}
warn() {
  printf "${YELLOW}[!!]${NC}  %s\n" "$1"
}
fail() {
  printf "${RED}[ERR] %s${NC}\n" "$1"
  exit 1
}
step() {
  printf "\n${CYAN}==> %s${NC}\n" "$1"
}

SCRIPT_START=$SECONDS

# -----------------------------------------------------------------------------
# Step 1 - Prerequisites
# -----------------------------------------------------------------------------
step 'Checking prerequisites'

for cmd in node npm python3 openssl curl; do
  command -v "$cmd" >/dev/null 2>&1 || fail "$cmd not found. Install it and re-run."
  ok "$cmd -> $(command -v "$cmd")"
done

NODE_MAJOR="$(node --version | sed 's/v//' | cut -d. -f1)"
((NODE_MAJOR >= 18)) || fail "Node.js >= 18 required. Current: $(node --version). Use nvm: nvm install 20 or later"
ok "Node.js $(node --version)"

PYTHON_VER="$(python3 --version | awk '{print $2}')"
PYTHON_MAJOR="$(echo "$PYTHON_VER" | cut -d. -f1)"
PYTHON_MINOR="$(echo "$PYTHON_VER" | cut -d. -f2)"
((PYTHON_MAJOR > 3 || (PYTHON_MAJOR == 3 && PYTHON_MINOR >= 9))) || fail "Python >= 3.9 required. Found: $PYTHON_VER"
ok "Python $PYTHON_VER"

[[ -f package.json && -f prisma/schema.prisma ]] || fail 'Run from the project root (where package.json lives).'
info "Project root: $(pwd)"

# -----------------------------------------------------------------------------
# Step 2 - Keychain secrets
# -----------------------------------------------------------------------------
step 'Managing secrets (macOS Keychain service: multillm-local)'

KC_SERVICE='multillm-local'

kc_read() {
  security find-generic-password -s "$KC_SERVICE" -a "$1" -w 2>/dev/null || echo ''
}

kc_write() {
  security add-generic-password -U -s "$KC_SERVICE" -a "$1" -w "$2" 2>/dev/null || {
    warn "Keychain write failed for $1. Secret will only exist in .env.local."
  }
}

if ! command -v security >/dev/null 2>&1; then
  warn 'macOS security command not found. Falling back to .env.local-only secrets (regenerated each run unless kept in .env.local).'
  kc_read() { echo ''; }
  kc_write() { :; }
fi

NEXTAUTH_VAL="$(kc_read NEXTAUTH_SECRET)"
if [[ -z "$NEXTAUTH_VAL" || "$RESET_SECRETS" == '1' ]]; then
  NEXTAUTH_VAL="$(openssl rand -base64 32 | tr -d '\n')"
  kc_write 'NEXTAUTH_SECRET' "$NEXTAUTH_VAL"
  ok 'NEXTAUTH_SECRET generated -> Keychain'
else
  ok 'NEXTAUTH_SECRET loaded from Keychain'
fi

SEED_VAL="$(kc_read API_KEY_ENCRYPTION_SEED)"
if [[ -z "$SEED_VAL" || "$RESET_SECRETS" == '1' ]]; then
  SEED_VAL="$(openssl rand -base64 32 | tr -d '\n')"
  kc_write 'API_KEY_ENCRYPTION_SEED' "$SEED_VAL"
  ok 'API_KEY_ENCRYPTION_SEED generated -> Keychain'
else
  ok 'API_KEY_ENCRYPTION_SEED loaded from Keychain'
fi

# -----------------------------------------------------------------------------
# Step 3 - LLM keys (optional flag)
# -----------------------------------------------------------------------------
if [[ "$INJECT_LLM_KEYS" == '1' ]]; then
  step 'Injecting LLM API keys into Keychain (hidden input)'
  for kc_account in OPENAI_API_KEY ANTHROPIC_API_KEY GOOGLE_AI_API_KEY OPENROUTER_API_KEY; do
    existing="$(kc_read "$kc_account")"
    if [[ -n "$existing" ]]; then
      info "$kc_account already stored. Press Enter to keep, or paste new key to overwrite:"
    else
      info "$kc_account not found. Paste key (Enter to skip):"
    fi

    key_input=''
    printf '  > '
    read -r -s key_input
    printf '\n'

    if [[ -n "$key_input" ]]; then
      kc_write "$kc_account" "$key_input"
      ok "$kc_account stored"
    else
      info "$kc_account skipped"
    fi
  done
fi

# -----------------------------------------------------------------------------
# Step 4 - Build / update .env.local
# -----------------------------------------------------------------------------
step 'Configuring .env.local'

ENV_LOCAL='.env.local'

if [[ ! -f "$ENV_LOCAL" ]]; then
  warn '.env.local not found - creating from defaults.'
  cat >"$ENV_LOCAL" <<'ENVEOF'
DATABASE_URL="file:./prisma/dev.db"
NEXTAUTH_URL=http://localhost:3000
AUTH_REQUIRE_LOGIN=false
NEXT_PUBLIC_AUTH_REQUIRE_LOGIN=false
DEMO_ACCOUNT_ENABLED=true
NEXT_PUBLIC_DEMO_ACCOUNT_ENABLED=true
DEMO_ACCOUNT_BYPASS_AUTH=true
NEXT_PUBLIC_DEMO_ACCOUNT_BYPASS_AUTH=true
DEMO_ACCOUNT_EMAIL=demo@local.dev
NEXT_PUBLIC_DEMO_ACCOUNT_EMAIL=demo@local.dev
DEMO_ACCOUNT_PASSWORD=demo12345
NEXT_PUBLIC_DEMO_ACCOUNT_PASSWORD=demo12345
DEMO_ACCOUNT_NAME=Demo User
DEMO_ACCOUNT_ID=demo-user
GUEST_USER_ID=guest-local-user
NEXT_PUBLIC_GUEST_USER_ID=guest-local-user
GUEST_USER_NAME=Guest User
GUEST_USER_EMAIL=guest@local.dev
PYTHON_CORE_URL=http://127.0.0.1:8008
PYTHON_CORE_PORT=8008
NEXT_PUBLIC_APP_NAME=MultiLLM Chat Assistant
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development
LLM_FETCH_TIMEOUT_MS=30000
LLM_FETCH_RETRIES=1
ENABLE_PERFORMANCE_MONITORING=false
NEXTAUTH_SECRET=
AUTH_SECRET=
API_KEY_ENCRYPTION_SEED=
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GOOGLE_AI_API_KEY=
OPENROUTER_API_KEY=
STRIPE_SECRET_KEY=
STRIPE_PRO_PRICE_ID=
STRIPE_WEBHOOK_SECRET=
REDIS_URL=
ENVEOF
  ok '.env.local created'
fi

inject_env_var() {
  local key="$1"
  local raw_value="$2"
  local file="$3"
  local esc
  local os
  esc="$(printf '%s' "$raw_value" | sed 's/[\/&]/\\&/g')"
  os="$(uname -s)"

  if grep -q "^${key}=" "$file" 2>/dev/null; then
    if [[ "$os" == 'Darwin' ]]; then
      sed -i '' "s|^${key}=.*|${key}=${esc}|" "$file"
    else
      sed -i "s|^${key}=.*|${key}=${esc}|" "$file"
    fi
  else
    printf '%s=%s\n' "$key" "$raw_value" >>"$file"
  fi
}

inject_env_var 'NEXTAUTH_SECRET' "\"${NEXTAUTH_VAL}\"" "$ENV_LOCAL"
inject_env_var 'AUTH_SECRET' "\"${NEXTAUTH_VAL}\"" "$ENV_LOCAL"
inject_env_var 'API_KEY_ENCRYPTION_SEED' "\"${SEED_VAL}\"" "$ENV_LOCAL"
ok 'Secrets injected into .env.local'

for kc_account in OPENAI_API_KEY ANTHROPIC_API_KEY GOOGLE_AI_API_KEY OPENROUTER_API_KEY; do
  val="$(kc_read "$kc_account")"
  if [[ -n "$val" ]]; then
    inject_env_var "$kc_account" "\"${val}\"" "$ENV_LOCAL"
    ok "$kc_account pulled from Keychain -> .env.local"
  fi
done

# -----------------------------------------------------------------------------
# Step 5 - Node dependencies
# -----------------------------------------------------------------------------
if [[ "$SKIP_INSTALL" == '0' ]]; then
  step 'Installing Node.js dependencies'
  npm install --prefer-offline
  ok 'npm install done'

  ok "tsx available: $(npx tsx --version)"
else
  info 'Skipping npm install (--skip-install)'
fi

# -----------------------------------------------------------------------------
# Step 6 - Python venv + dependencies
# -----------------------------------------------------------------------------
if [[ "$SKIP_INSTALL" == '0' ]]; then
  step 'Setting up Python virtual environment'
  if [[ ! -d .venv ]]; then
    python3 -m venv .venv
    ok '.venv created'
  else
    ok '.venv already exists'
  fi
  .venv/bin/pip install --quiet --upgrade pip
  .venv/bin/pip install --quiet -r requirements.txt
  ok 'Python requirements installed in .venv'
else
  info 'Skipping pip install (--skip-install)'
fi

# -----------------------------------------------------------------------------
# Step 7 - Prisma: generate + db push (SQLite)
# -----------------------------------------------------------------------------
if [[ "$SKIP_DB" == '0' ]]; then
  step 'Setting up database (SQLite -> prisma/dev.db)'

  [[ -f prisma/schema.prisma ]] || fail 'Missing prisma/schema.prisma. Ensure Prisma schema exists before running with database setup enabled.'
  LOCAL_DATABASE_URL='file:./prisma/dev.db'
  [[ "$LOCAL_DATABASE_URL" == file:* ]] || fail 'Refusing to run Prisma local bootstrap on non-SQLite DATABASE_URL.'

  info 'prisma generate'
  DATABASE_URL="$LOCAL_DATABASE_URL" npx prisma generate
  ok 'prisma generate done'

  info 'prisma db push (creates/updates prisma/dev.db)'
  warn 'Running prisma db push with --accept-data-loss for local bootstrap.'
  DATABASE_URL="$LOCAL_DATABASE_URL" npx prisma db push --accept-data-loss
  ok 'prisma db push done -> prisma/dev.db'

  # ---------------------------------------------------------------------------
  # Step 8 - Seed
  # ---------------------------------------------------------------------------
  step 'Seeding database (demo + guest accounts)'
  [[ -f prisma/seed.ts ]] || fail 'Missing prisma/seed.ts. Add that file at prisma/seed.ts before running with database setup enabled.'
  DATABASE_URL="$LOCAL_DATABASE_URL" npx tsx prisma/seed.ts
  ok 'Database seeded'
else
  info 'Skipping prisma db push + seed (--skip-db)'
fi

# -----------------------------------------------------------------------------
# Step 9 - Smoke test: Python sidecar
# -----------------------------------------------------------------------------
step 'Smoke testing Python sidecar'

SIDECAR_PORT="${PYTHON_CORE_PORT:-8008}"
SIDECAR_READY=0
SIDECAR_PID=''

cleanup_sidecar() {
  if [[ -n "${SIDECAR_PID:-}" ]]; then
    kill "$SIDECAR_PID" 2>/dev/null || true
    wait "$SIDECAR_PID" 2>/dev/null || true
    SIDECAR_PID=''
  fi
}

trap cleanup_sidecar EXIT

if [[ -d .venv ]]; then
  DATABASE_URL='file:./prisma/dev.db' .venv/bin/python3 -m uvicorn src.core.main:app \
    --host 127.0.0.1 \
    --port "$SIDECAR_PORT" \
    --log-level error &
  SIDECAR_PID=$!

  if ! kill -0 "$SIDECAR_PID" 2>/dev/null; then
    warn 'Sidecar failed to start. Check Python dependencies and uvicorn availability.'
  fi

  for i in $(seq 1 24); do
    sleep 0.5
    if curl -sf "http://127.0.0.1:${SIDECAR_PORT}/api/v1/health" >/dev/null 2>&1; then
      SIDECAR_READY=1
      ok "Sidecar health OK (attempt $i)"
      break
    fi
  done

  cleanup_sidecar

  [[ "$SIDECAR_READY" == '1' ]] || warn 'Sidecar did not respond in 12s. App still works via Node.js providers; troubleshoot with npx tsx server.ts.'
else
  warn '.venv not found - skipping sidecar smoke test. Run without --skip-install first.'
fi

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------
ELAPSED=$((SECONDS - SCRIPT_START))

step 'Done'
printf '\n'
printf '  elapsed:          %ss\n' "$ELAPSED"
printf '  .env.local:       present, secrets injected\n'
printf '  database:         prisma/dev.db (SQLite)\n'
printf '  venv:             .venv/\n'
printf '  sidecar smoke:    %s\n' "$([[ "$SIDECAR_READY" == '1' ]] && echo 'PASSED' || echo 'SKIPPED/WARN')"
printf '\n'
printf '  Start full stack (Next.js + Python sidecar):\n'
printf '    npx tsx server.ts\n'
printf '\n'
printf '  Start Next.js only (no sidecar):\n'
printf '    npm run dev\n'
printf '\n'
printf '  Add LLM API keys:\n'
printf '    ./setup-local.sh --inject-llm-keys\n'
printf '\n'
printf '  App URL:     http://localhost:3000\n'
printf '  Demo login:  demo@local.dev / demo12345\n'
printf '\n'
printf '  Rollback:\n'
printf '    rm -f .env.local .server.pid .prisma-active-schema prisma/dev.db\n'
printf '    security delete-generic-password -s multillm-local 2>/dev/null || true\n'
printf '\n'
