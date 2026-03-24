#!/bin/bash
# reliability-check.sh — bounded reliability verification for Step 8
# Usage:
#   bash scripts/reliability-check.sh --base-url http://localhost:3000 --start-server

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
START_SERVER=false
REQUESTS="${RELIABILITY_REQUESTS:-30}"
CONCURRENCY="${RELIABILITY_CONCURRENCY:-6}"
P95_THRESHOLD_MS="${RELIABILITY_P95_THRESHOLD_MS:-750}"
SERVER_PID=""
SERVER_PORT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base-url) BASE_URL="$2"; shift 2 ;;
    --start-server) START_SERVER=true; shift ;;
    --requests) REQUESTS="$2"; shift 2 ;;
    --concurrency) CONCURRENCY="$2"; shift 2 ;;
    --p95-threshold-ms) P95_THRESHOLD_MS="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

if [[ "$BASE_URL" =~ ^https?://[^/:]+:([0-9]+) ]]; then
  SERVER_PORT="${BASH_REMATCH[1]}"
elif [[ "$BASE_URL" =~ ^https:// ]]; then
  SERVER_PORT="443"
else
  SERVER_PORT="3000"
fi

cleanup() {
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

http_ready() {
  curl -fsS "$1" >/dev/null 2>&1
}

echo "==> Running degraded dependency verification slice"
npm run test:run -- \
  test/api-health-route.test.ts \
  test/api-admin-status-route.test.ts \
  test/cache.test.ts \
  test/rate-limit.test.ts

if [ "$START_SERVER" = true ]; then
  echo "==> Building application"
  npm run build

  echo "==> Starting production server on port ${SERVER_PORT}"
  PORT="$SERVER_PORT" npm run start >/tmp/multillm-reliability.log 2>&1 &
  SERVER_PID=$!

  for i in $(seq 1 30); do
    if http_ready "${BASE_URL}/api/health"; then
      echo "==> Server ready after ${i}s"
      break
    fi
    if [ "$i" = "30" ]; then
      echo "Server failed to start within 30s"
      exit 1
    fi
    sleep 1
  done
fi

echo "==> Running bounded health load probe"
RELIABILITY_BASE_URL="$BASE_URL" \
RELIABILITY_REQUESTS="$REQUESTS" \
RELIABILITY_CONCURRENCY="$CONCURRENCY" \
RELIABILITY_P95_THRESHOLD_MS="$P95_THRESHOLD_MS" \
node <<'NODE'
const baseUrl = process.env.RELIABILITY_BASE_URL
const totalRequests = Number(process.env.RELIABILITY_REQUESTS || '30')
const concurrency = Number(process.env.RELIABILITY_CONCURRENCY || '6')
const p95ThresholdMs = Number(process.env.RELIABILITY_P95_THRESHOLD_MS || '750')

if (!baseUrl) {
  throw new Error('RELIABILITY_BASE_URL is required')
}

const endpoints = ['/api/health', '/api/health?metrics=1']

const percentile = (values, ratio) => {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.max(0, Math.ceil(sorted.length * ratio) - 1)
  return Math.round(sorted[index])
}

const runProbe = async (path) => {
  const durations = []
  const failures = []
  let next = 0

  const worker = async () => {
    while (true) {
      const current = next++
      if (current >= totalRequests) {
        return
      }

      const started = performance.now()
      try {
        const response = await fetch(`${baseUrl}${path}`, {
          headers: { 'cache-control': 'no-store' },
        })
        const duration = Math.round(performance.now() - started)
        durations.push(duration)

        let payload = null
        try {
          payload = await response.json()
        } catch {
          failures.push(`non-json response at ${path}`)
          continue
        }

        if (response.status !== 200) {
          failures.push(`unexpected HTTP ${response.status} at ${path}`)
          continue
        }

        if (!payload || !['healthy', 'degraded'].includes(payload.status)) {
          failures.push(`unexpected status payload at ${path}`)
          continue
        }

        if (
          !payload.summary ||
          !['none', 'warning', 'critical'].includes(payload.summary.alertLevel)
        ) {
          failures.push(`missing alert summary at ${path}`)
          continue
        }

        if (path === '/api/health' && payload.summary.alertLevel !== 'none') {
          failures.push(
            `healthy baseline unexpectedly alertable: ${payload.summary.alertLevel}`
          )
        }
      } catch (error) {
        failures.push(
          `request failed at ${path}: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, totalRequests) }, () => worker())
  )

  const p95 = percentile(durations, 0.95)
  return {
    path,
    total: totalRequests,
    failures,
    p95,
  }
}

const main = async () => {
  const results = []
  for (const path of endpoints) {
    results.push(await runProbe(path))
  }

  for (const result of results) {
    console.log(
      JSON.stringify({
        type: 'reliability_probe',
        path: result.path,
        total: result.total,
        failures: result.failures.length,
        p95Ms: result.p95,
      })
    )

    if (result.failures.length > 0) {
      throw new Error(
        `${result.path} had ${result.failures.length} failures: ${result.failures.join('; ')}`
      )
    }

    if (result.p95 > p95ThresholdMs) {
      throw new Error(
        `${result.path} p95 ${result.p95}ms exceeded threshold ${p95ThresholdMs}ms`
      )
    }
  }
}

await main()
NODE

echo "==> Reliability check passed"
