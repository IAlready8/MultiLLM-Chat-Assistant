#!/usr/bin/env bash
set -euo pipefail

BASE_URL=""
APPLY_MIGRATIONS=false
REQUIRE_STRIPE=false
CHECK_WEBHOOK=false

print_help() {
  cat <<'EOF'
Usage: bash scripts/verify-production.sh [options]

Options:
  --base-url URL         Deployment base URL (e.g. https://your-app.vercel.app)
  --apply-migrations     Run `prisma migrate deploy` after status check
  --require-stripe       Require Stripe env vars and verify Stripe price ID
  --check-webhook        Validate webhook endpoint behavior on --base-url
  --help                 Show this help

Examples:
  bash scripts/verify-production.sh --base-url https://example.vercel.app
  bash scripts/verify-production.sh --apply-migrations --require-stripe
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
    --check-webhook)
      CHECK_WEBHOOK=true
      shift
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

echo "==> Verifying required runtime environment variables"
require_env NEXTAUTH_URL
require_env NEXTAUTH_SECRET
require_env API_KEY_ENCRYPTION_SEED
require_env DATABASE_URL

echo "==> Checking database network reachability"
node <<'NODE'
const net = require('node:net')

const rawUrl = process.env.DATABASE_URL || ''
let parsed
try {
  parsed = new URL(rawUrl)
} catch {
  console.error('ERROR: DATABASE_URL is not a valid URL.')
  process.exit(1)
}

const host = parsed.hostname
const port = Number(parsed.port || 5432)

if (!host || Number.isNaN(port)) {
  console.error('ERROR: DATABASE_URL is missing a valid host/port.')
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

echo "==> Checking database migration status"
if ! npx prisma migrate status; then
  echo "ERROR: Prisma migration status check failed."
  echo "Hint: verify DATABASE_URL credentials/network and that Prisma engines match current platform."
  exit 1
fi

if [[ "${APPLY_MIGRATIONS}" == "true" ]]; then
  echo "==> Applying database migrations"
  npx prisma migrate deploy
fi

if [[ -n "${BASE_URL}" ]]; then
  BASE_URL="${BASE_URL%/}"
  echo "==> Checking deployment health: ${BASE_URL}"

  HEALTH_JSON="$(curl -fsS "${BASE_URL}/api/health")"
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

  if [[ "${CHECK_WEBHOOK}" == "true" ]]; then
    echo "==> Checking Stripe webhook endpoint behavior"
    WEBHOOK_CODE="$(curl -sS -o /tmp/multillm_webhook_check.json -w "%{http_code}" \
      -X POST "${BASE_URL}/api/webhooks/stripe")"

    if [[ "${REQUIRE_STRIPE}" == "true" && "${WEBHOOK_CODE}" == "503" ]]; then
      echo "ERROR: Webhook endpoint reports Stripe is not configured (HTTP 503)."
      cat /tmp/multillm_webhook_check.json
      exit 1
    fi

    if [[ "${WEBHOOK_CODE}" != "400" && "${WEBHOOK_CODE}" != "503" ]]; then
      echo "ERROR: Unexpected webhook status code: ${WEBHOOK_CODE}"
      cat /tmp/multillm_webhook_check.json
      exit 1
    fi

    echo "Webhook endpoint check ok (HTTP ${WEBHOOK_CODE})."
  fi
fi

echo
echo "Production verification completed successfully."
