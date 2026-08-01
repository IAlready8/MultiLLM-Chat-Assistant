#!/usr/bin/env bash
set -euo pipefail

BASE_URL=""
APPLY_MIGRATIONS=false
REQUIRE_STRIPE=false
REQUIRE_SIDECAR=false
CHECK_WEBHOOK=false
EXPECTED_COMMIT_SHA=""
USE_VERCEL_CURL="${USE_VERCEL_CURL:-false}"
VERCEL_CURL_DEPLOYMENT="${VERCEL_CURL_DEPLOYMENT:-}"

print_help() {
  cat <<'EOF'
Usage: bash scripts/verify-production.sh [options]

Options:
  --base-url URL         Deployment base URL (e.g. https://your-app.vercel.app)
  --apply-migrations     Run `prisma migrate deploy` after status check
  --require-stripe       Require Stripe env vars and verify Stripe price ID
  --require-sidecar      Require PYTHON_CORE_URL and verify sidecar health
  --check-webhook        Validate webhook endpoint behavior on --base-url
  --expected-commit-sha  Require /api/health release.commitSha to match a full SHA
  --help                 Show this help

Examples:
  bash scripts/verify-production.sh --base-url https://example.vercel.app
  bash scripts/verify-production.sh --base-url https://example.vercel.app \
    --expected-commit-sha 0123456789abcdef0123456789abcdef01234567
  bash scripts/verify-production.sh --apply-migrations --require-stripe --require-sidecar

Protected Vercel preview support:
  USE_VERCEL_CURL=true VERCEL_CURL_DEPLOYMENT=https://example.vercel.app \
    bash scripts/verify-production.sh --base-url https://example.vercel.app
EOF
}

require_env() {
  local name="$1"
  local value="${!name:-}"
  if [[ -z "${value}" ]]; then
    echo "ERROR: Missing required environment variable: ${name}"
    exit 1
  fi
}

require_auth_secret() {
  local secret="${NEXTAUTH_SECRET:-${AUTH_SECRET:-}}"
  if [[ -z "${secret}" ]]; then
    echo "ERROR: Missing required environment variable: NEXTAUTH_SECRET (or AUTH_SECRET)"
    exit 1
  fi
}

resolve_database_url() {
  local name
  local value

  for name in DATABASE_URL POSTGRES_DATABASE_URL POSTGRES_URL; do
    value="${!name:-}"
    if [[ "${value}" == postgres://* || "${value}" == postgresql://* ]]; then
      export DATABASE_URL="${value}"
      return
    fi
  done

  echo "ERROR: DATABASE_URL, POSTGRES_DATABASE_URL, or POSTGRES_URL must contain a valid PostgreSQL URL."
  exit 1
}

ensure_pair_or_empty() {
  local first_name="$1"
  local second_name="$2"
  local first_value="${!first_name:-}"
  local second_value="${!second_name:-}"

  if [[ -n "${first_value}" && -z "${second_value}" ]]; then
    echo "ERROR: ${first_name} is set but ${second_name} is missing."
    exit 1
  fi

  if [[ -z "${first_value}" && -n "${second_value}" ]]; then
    echo "ERROR: ${second_name} is set but ${first_name} is missing."
    exit 1
  fi
}

remote_request() {
  local url="$1"
  shift

  if [[ "${USE_VERCEL_CURL}" == "true" ]]; then
    local deployment="${VERCEL_CURL_DEPLOYMENT:-${BASE_URL}}"
    if [[ -z "${deployment}" ]]; then
      echo "ERROR: VERCEL_CURL_DEPLOYMENT or --base-url is required when USE_VERCEL_CURL=true"
      exit 1
    fi

    local path="${url#${BASE_URL}}"
    if [[ "${path}" == "${url}" ]]; then
      echo "ERROR: URL '${url}' does not match BASE_URL '${BASE_URL}' for vercel curl routing."
      exit 1
    fi
    [[ -z "${path}" ]] && path="/"

    npx --yes vercel curl "${path}" --deployment "${deployment}" -- "$@"
    return
  fi

  curl "$@" "${url}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base-url)
      BASE_URL="${2:-}"
      shift 2
      ;;
    --apply-migrations)
      APPLY_MIGRATIONS=true
      shift
      ;;
    --require-stripe)
      REQUIRE_STRIPE=true
      shift
      ;;
    --require-sidecar)
      REQUIRE_SIDECAR=true
      shift
      ;;
    --check-webhook)
      CHECK_WEBHOOK=true
      shift
      ;;
    --expected-commit-sha)
      if [[ -z "${2:-}" ]]; then
        echo "ERROR: --expected-commit-sha requires a value."
        exit 1
      fi
      EXPECTED_COMMIT_SHA="${2:-}"
      shift 2
      ;;
    --help)
      print_help
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      print_help
      exit 1
      ;;
  esac
done

if [[ "${CHECK_WEBHOOK}" == "true" && -z "${BASE_URL}" ]]; then
  echo "ERROR: --check-webhook requires --base-url."
  exit 1
fi

if [[ -n "${EXPECTED_COMMIT_SHA}" && -z "${BASE_URL}" ]]; then
  echo "ERROR: --expected-commit-sha requires --base-url."
  exit 1
fi

if [[ -n "${EXPECTED_COMMIT_SHA}" && ! "${EXPECTED_COMMIT_SHA}" =~ ^[0-9a-fA-F]{40}$ ]]; then
  echo "ERROR: --expected-commit-sha must be exactly 40 hexadecimal characters."
  exit 1
fi

echo "==> Verifying required runtime environment variables"
require_env NEXTAUTH_URL
require_auth_secret
require_env API_KEY_ENCRYPTION_SEED
resolve_database_url
ensure_pair_or_empty GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET
ensure_pair_or_empty GITHUB_CLIENT_ID GITHUB_CLIENT_SECRET

STRIPE_SECRET="${STRIPE_SECRET_KEY:-}"
STRIPE_PRICE="${STRIPE_PRO_PRICE_ID:-}"
STRIPE_WEBHOOK="${STRIPE_WEBHOOK_SECRET:-}"
if [[ -n "${STRIPE_SECRET}" || -n "${STRIPE_PRICE}" || -n "${STRIPE_WEBHOOK}" ]]; then
  if [[ -z "${STRIPE_SECRET}" || -z "${STRIPE_PRICE}" || -z "${STRIPE_WEBHOOK}" ]]; then
    echo "ERROR: Stripe is partially configured. Set STRIPE_SECRET_KEY, STRIPE_PRO_PRICE_ID, and STRIPE_WEBHOOK_SECRET together."
    exit 1
  fi
  if [[ "${REQUIRE_STRIPE}" != "true" ]]; then
    echo "Stripe env detected; skipping live Stripe API verification (pass --require-stripe to enforce it)."
  fi
fi

echo "==> Checking database network reachability"
node <<'NODE'
const net = require('node:net')

const rawUrl = process.env.DATABASE_URL || ''
let parsed
try {
  parsed = new URL(rawUrl)
} catch {
  console.error('ERROR: Resolved database connection string is not a valid URL.')
  process.exit(1)
}

const host = parsed.hostname
const port = Number(parsed.port || 5432)

if (!host || Number.isNaN(port)) {
  console.error('ERROR: Resolved database URL is missing a valid host/port.')
  process.exit(1)
}

const socket = new net.Socket()
const timeoutMs = 5000

socket.setTimeout(timeoutMs)
socket.once('connect', () => {
  socket.destroy()
  console.log(`Database socket reachable at ${host}:${port}`)
})
socket.once('timeout', () => {
  socket.destroy()
  console.error(
    `ERROR: Timed out connecting to database at ${host}:${port} (${timeoutMs}ms).`
  )
  process.exit(1)
})
socket.once('error', (error) => {
  socket.destroy()
  const details = [error.message, error.code].filter(Boolean).join(' | ')
  console.error(
    `ERROR: Cannot connect to database at ${host}:${port}${details ? `: ${details}` : ''}`
  )
  process.exit(1)
})

socket.connect(port, host)
NODE

if [[ "${REQUIRE_STRIPE}" == "true" ]]; then
  require_env STRIPE_SECRET_KEY
  require_env STRIPE_PRO_PRICE_ID
  require_env STRIPE_WEBHOOK_SECRET

  echo "==> Verifying Stripe API and configured price"
  node <<'NODE'
const Stripe = require('stripe')

const secret = process.env.STRIPE_SECRET_KEY
const priceId = process.env.STRIPE_PRO_PRICE_ID
const stripe = new Stripe(secret, { apiVersion: '2025-11-17.clover' })

async function run() {
  const price = await stripe.prices.retrieve(priceId)
  if (!price || price.deleted) {
    throw new Error('Configured STRIPE_PRO_PRICE_ID does not exist.')
  }
  if (!price.active) {
    throw new Error('Configured STRIPE_PRO_PRICE_ID is not active.')
  }
  console.log(`Stripe price check ok: ${price.id}`)
}

run().catch((error) => {
  console.error('Stripe verification failed:', error.message)
  process.exit(1)
})
NODE
fi

if [[ "${REQUIRE_SIDECAR}" == "true" ]]; then
  require_env PYTHON_CORE_URL
  PYTHON_CORE_URL="${PYTHON_CORE_URL%/}"
  echo "==> Verifying Python sidecar health: ${PYTHON_CORE_URL}/api/v1/health"
  SIDECAR_HEALTH_JSON="$(curl -fsS "${PYTHON_CORE_URL}/api/v1/health")"
  SIDECAR_HEALTH_JSON="${SIDECAR_HEALTH_JSON}" node <<'NODE'
const payload = JSON.parse(process.env.SIDECAR_HEALTH_JSON || '{}')
const status = String(payload.status || '').toLowerCase()
if (!status) {
  throw new Error('Invalid sidecar health payload.')
}
if (status !== 'ok' && status !== 'healthy' && status !== 'degraded') {
  throw new Error(`Unexpected sidecar health status: ${payload.status}`)
}
console.log(`Sidecar health check ok: status=${payload.status}`)
NODE
fi

echo "==> Checking database migration status"
if ! npx prisma migrate status; then
  if [[ "${APPLY_MIGRATIONS}" == "true" ]]; then
    echo "Migration status check reported pending/invalid state; attempting deploy because --apply-migrations is enabled."
    echo "==> Applying database migrations"
    npx prisma migrate deploy
    echo "==> Re-checking database migration status"
    if ! npx prisma migrate status; then
      echo "ERROR: Prisma migration status still failing after migrate deploy."
      echo "Hint: verify DATABASE_URL credentials/network and that Prisma engines match current platform."
      exit 1
    fi
  else
    echo "ERROR: Prisma migration status check failed."
    echo "Hint: run with --apply-migrations to auto-apply pending migrations, or verify DATABASE_URL credentials/network and Prisma engine compatibility."
    exit 1
  fi
fi

if [[ -n "${BASE_URL}" ]]; then
  BASE_URL="${BASE_URL%/}"
  echo "==> Checking deployment health: ${BASE_URL}"

  HEALTH_JSON="$(remote_request "${BASE_URL}/api/health" -fsS)"
  HEALTH_JSON="${HEALTH_JSON}" node <<'NODE'
const payload = JSON.parse(process.env.HEALTH_JSON || '{}')
if (!payload.status) {
  throw new Error('Invalid /api/health payload.')
}
if (payload.status !== 'healthy' && payload.status !== 'degraded') {
  throw new Error(`Unexpected health status: ${payload.status}`)
}
if (!payload.checks || !payload.checks.database) {
  throw new Error('Missing database health check details.')
}
console.log(
  `Health check ok: status=${payload.status}, database=${payload.checks.database.status}`
)
NODE

  if [[ -n "${EXPECTED_COMMIT_SHA}" ]]; then
    echo "==> Checking deployment release commit"
    HEALTH_JSON="${HEALTH_JSON}" EXPECTED_COMMIT_SHA="${EXPECTED_COMMIT_SHA}" node --input-type=module <<'NODE'
import { verifyReleasePayload } from './scripts/alias-commit-guard.mjs'

const payload = JSON.parse(process.env.HEALTH_JSON || '{}')
const commitSha = verifyReleasePayload(payload, process.env.EXPECTED_COMMIT_SHA)
console.log(`Release commit matches expected full SHA: ${commitSha}`)
NODE
  fi

  if [[ "${CHECK_WEBHOOK}" == "true" ]]; then
    echo "==> Checking Stripe webhook endpoint behavior"
    WEBHOOK_RESPONSE_FILE="$(mktemp)"

    if [[ "${REQUIRE_STRIPE}" == "true" ]]; then
      SIGNED_PAYLOAD_FILE="$(mktemp)"
      SIGNED_HEADER_FILE="$(mktemp)"

      SIGNED_PAYLOAD_FILE="${SIGNED_PAYLOAD_FILE}" SIGNED_HEADER_FILE="${SIGNED_HEADER_FILE}" node <<'NODE'
const fs = require('node:fs')
const Stripe = require('stripe')

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
if (!webhookSecret) {
  console.error('Missing STRIPE_WEBHOOK_SECRET for signed webhook verification.')
  process.exit(1)
}

const payload = JSON.stringify({
  id: 'evt_test_webhook_verification',
  object: 'event',
  api_version: '2025-11-17.clover',
  created: Math.floor(Date.now() / 1000),
  data: {
    object: {
      id: 'cs_test_webhook_verification',
      object: 'checkout.session',
      metadata: {
        userId: 'webhook-health-check-user',
      },
    },
  },
  livemode: false,
  pending_webhooks: 1,
  request: {
    id: null,
    idempotency_key: null,
  },
  type: 'checkout.session.completed',
})

const signature = Stripe.webhooks.generateTestHeaderString({
  payload,
  secret: webhookSecret,
})

fs.writeFileSync(process.env.SIGNED_PAYLOAD_FILE, payload)
fs.writeFileSync(process.env.SIGNED_HEADER_FILE, signature)
NODE

      STRIPE_SIGNATURE="$(cat "${SIGNED_HEADER_FILE}")"
      WEBHOOK_CODE="$(remote_request "${BASE_URL}/api/webhooks/stripe" -sS -o "${WEBHOOK_RESPONSE_FILE}" -w "%{http_code}" \
        -X POST \
        -H "Content-Type: application/json" \
        -H "Stripe-Signature: ${STRIPE_SIGNATURE}" \
        --data-binary "@${SIGNED_PAYLOAD_FILE}")"

      rm -f "${SIGNED_PAYLOAD_FILE}" "${SIGNED_HEADER_FILE}"

      if [[ "${WEBHOOK_CODE}" != "200" ]]; then
        echo "ERROR: Signed webhook verification failed (expected HTTP 200, got ${WEBHOOK_CODE})."
        cat "${WEBHOOK_RESPONSE_FILE}"
        rm -f "${WEBHOOK_RESPONSE_FILE}"
        exit 1
      fi

      echo "Signed webhook verification passed (HTTP ${WEBHOOK_CODE})."
    else
      WEBHOOK_CODE="$(remote_request "${BASE_URL}/api/webhooks/stripe" -sS -o "${WEBHOOK_RESPONSE_FILE}" -w "%{http_code}" \
        -X POST)"

      if [[ "${WEBHOOK_CODE}" != "400" && "${WEBHOOK_CODE}" != "503" ]]; then
        echo "ERROR: Unexpected webhook status code: ${WEBHOOK_CODE}"
        cat "${WEBHOOK_RESPONSE_FILE}"
        rm -f "${WEBHOOK_RESPONSE_FILE}"
        exit 1
      fi

      echo "Webhook endpoint check ok (HTTP ${WEBHOOK_CODE})."
    fi

    rm -f "${WEBHOOK_RESPONSE_FILE}"
  fi
fi

echo
echo "Production verification completed successfully."
