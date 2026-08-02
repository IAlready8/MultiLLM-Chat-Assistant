#!/usr/bin/env node

import { pathToFileURL } from 'node:url'

const FULL_SHA_PATTERN = /^[0-9a-f]{40}$/i
const RELEASE_VERSION_PATTERN = /^[0-9A-Za-z][0-9A-Za-z.+-]{0,127}$/

export const normalizeExpectedCommitSha = (value) => {
  const sha = String(value || '').trim()
  if (!FULL_SHA_PATTERN.test(sha)) {
    throw new Error('Expected commit SHA must be exactly 40 hexadecimal characters.')
  }
  return sha.toLowerCase()
}

export const normalizeExpectedVersion = (value) => {
  const version = String(value || '').trim()
  if (!RELEASE_VERSION_PATTERN.test(version)) {
    throw new Error(
      'Expected release version must be a non-empty version identifier up to 128 characters.'
    )
  }
  return version
}

export const normalizeBaseUrl = (value) => {
  const raw = String(value || '').trim()
  if (!raw) {
    throw new Error('Base URL is required.')
  }

  const url = new URL(raw)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Base URL must use http or https.')
  }
  if (url.username || url.password) {
    throw new Error('Base URL must not contain credentials.')
  }

  url.pathname = url.pathname.replace(/\/+$/, '')
  url.search = ''
  url.hash = ''
  return url.toString().replace(/\/$/, '')
}

export const normalizeHealthPath = (value) => {
  const path = String(value || '/api/health').trim()
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new Error('Health path must start with exactly one slash.')
  }
  return path
}

export const normalizeTimeoutMs = (value) => {
  const timeoutMs = Number(value || 12000)
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 60000) {
    throw new Error('Timeout must be an integer between 1000 and 60000 milliseconds.')
  }
  return timeoutMs
}

export const verifyReleasePayload = (payload, expectedCommitSha) => {
  const expected = normalizeExpectedCommitSha(expectedCommitSha)
  const observed = payload?.release?.commitSha

  if (typeof observed !== 'string' || !FULL_SHA_PATTERN.test(observed.trim())) {
    throw new Error('Health payload is missing a valid release.commitSha.')
  }

  const normalizedObserved = observed.trim().toLowerCase()
  if (normalizedObserved !== expected) {
    throw new Error(
      `Production alias commit mismatch: expected ${expected}, observed ${normalizedObserved}.`
    )
  }

  return normalizedObserved
}

export const verifyReleaseVersion = (payload, expectedVersion) => {
  const expected = normalizeExpectedVersion(expectedVersion)
  const observed = payload?.release?.version

  if (typeof observed !== 'string' || !RELEASE_VERSION_PATTERN.test(observed.trim())) {
    throw new Error('Health payload is missing a valid release.version.')
  }

  const normalizedObserved = observed.trim()
  if (normalizedObserved !== expected) {
    throw new Error(
      `Production alias version mismatch: expected ${expected}, observed ${normalizedObserved}.`
    )
  }

  return normalizedObserved
}

export const verifyHealthyPayload = (payload) => {
  if (payload?.status !== 'healthy') {
    throw new Error(
      `Production alias is not healthy: observed ${String(payload?.status || 'missing')}.`
    )
  }
  return payload.status
}

export const fetchAndVerifyRelease = async ({
  baseUrl,
  expectedCommitSha,
  expectedVersion,
  healthPath = '/api/health',
  timeoutMs = 12000,
  fetchImpl = globalThis.fetch,
}) => {
  if (typeof fetchImpl !== 'function') {
    throw new Error('This Node.js runtime does not provide fetch.')
  }

  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)
  const normalizedPath = normalizeHealthPath(healthPath)
  const normalizedTimeout = normalizeTimeoutMs(timeoutMs)
  const expected = normalizeExpectedCommitSha(expectedCommitSha)
  const expectedReleaseVersion = normalizeExpectedVersion(expectedVersion)
  const url = `${normalizedBaseUrl}${normalizedPath}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), normalizedTimeout)

  try {
    const response = await fetchImpl(url, {
      headers: { accept: 'application/json' },
      redirect: 'error',
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`Health request failed with HTTP ${response.status}.`)
    }

    let payload
    try {
      payload = await response.json()
    } catch {
      throw new Error('Health endpoint did not return valid JSON.')
    }

    verifyHealthyPayload(payload)
    const result = {
      commitSha: verifyReleasePayload(payload, expected),
      url,
      version: verifyReleaseVersion(payload, expectedReleaseVersion),
    }
    return result
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`Health request timed out after ${normalizedTimeout} milliseconds.`)
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

const printHelp = () => {
  console.log(`Usage:
  node scripts/alias-commit-guard.mjs --base-url URL --expected-commit-sha SHA [options]

Required:
  --base-url URL              Canonical deployment base URL
  --expected-commit-sha SHA   Exact 40-character release commit SHA
  --expected-version VERSION  Exact release version expected in production

Options:
  --health-path PATH          Health endpoint path (default: /api/health)
  --timeout-ms MS             Request timeout from 1000 to 60000 (default: 12000)
  --help                      Show this help

Environment alternatives:
  BASE_URL, EXPECTED_COMMIT_SHA, EXPECTED_VERSION, HEALTH_PATH, TIMEOUT_MS`)
}

const parseCliArgs = (args) => {
  const options = {
    baseUrl: process.env.BASE_URL || '',
    expectedCommitSha: process.env.EXPECTED_COMMIT_SHA || '',
    expectedVersion: process.env.EXPECTED_VERSION || '',
    healthPath: process.env.HEALTH_PATH || '/api/health',
    timeoutMs: process.env.TIMEOUT_MS || 12000,
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--help') {
      return { help: true, options }
    }

    const value = args[index + 1]
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${arg}.`)
    }

    if (arg === '--base-url') options.baseUrl = value
    else if (arg === '--expected-commit-sha') options.expectedCommitSha = value
    else if (arg === '--expected-version') options.expectedVersion = value
    else if (arg === '--health-path') options.healthPath = value
    else if (arg === '--timeout-ms') options.timeoutMs = value
    else throw new Error(`Unknown option: ${arg}`)
    index += 1
  }

  return { help: false, options }
}

const run = async () => {
  try {
    const { help, options } = parseCliArgs(process.argv.slice(2))
    if (help) {
      printHelp()
      return
    }

    const result = await fetchAndVerifyRelease(options)
    console.log(`Production alias verified: ${result.url}`)
    console.log(`Release commit matches: ${result.commitSha}`)
    console.log(`Release version matches: ${result.version}`)
  } catch (error) {
    console.error(`Alias guard failed: ${error instanceof Error ? error.message : error}`)
    process.exitCode = 1
  }
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  await run()
}
