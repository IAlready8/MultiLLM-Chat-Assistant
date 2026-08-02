#!/usr/bin/env node

import { pathToFileURL } from 'node:url'
import {
  normalizeBaseUrl,
  normalizeTimeoutMs,
} from './alias-commit-guard.mjs'

const PROVIDER_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/

export const normalizeProviderId = (value) => {
  const providerId = String(value || '').trim()
  if (!PROVIDER_ID_PATTERN.test(providerId)) {
    throw new Error(
      'OAuth provider ID must contain only lowercase letters, numbers, underscores, or hyphens.'
    )
  }
  return providerId
}

export const verifyAuthProviderPayload = (
  payload,
  { baseUrl, providerId }
) => {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)
  const normalizedProviderId = normalizeProviderId(providerId)

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Auth providers endpoint did not return a provider object.')
  }

  const provider = payload[normalizedProviderId]
  if (!provider || typeof provider !== 'object' || Array.isArray(provider)) {
    throw new Error(
      `Required OAuth provider is not configured: ${normalizedProviderId}.`
    )
  }

  if (provider.id !== normalizedProviderId || provider.type !== 'oauth') {
    throw new Error(
      `Provider ${normalizedProviderId} is not exposed as the expected OAuth provider.`
    )
  }

  if (typeof provider.name !== 'string' || !provider.name.trim()) {
    throw new Error(`Provider ${normalizedProviderId} is missing a display name.`)
  }

  const expectedSignInUrl =
    `${normalizedBaseUrl}/api/auth/signin/${normalizedProviderId}`
  const expectedCallbackUrl =
    `${normalizedBaseUrl}/api/auth/callback/${normalizedProviderId}`

  if (provider.signinUrl !== expectedSignInUrl) {
    throw new Error(
      `Provider ${normalizedProviderId} sign-in URL mismatch: expected ${expectedSignInUrl}, observed ${String(provider.signinUrl || 'missing')}.`
    )
  }

  if (provider.callbackUrl !== expectedCallbackUrl) {
    throw new Error(
      `Provider ${normalizedProviderId} callback URL mismatch: expected ${expectedCallbackUrl}, observed ${String(provider.callbackUrl || 'missing')}.`
    )
  }

  return {
    callbackUrl: expectedCallbackUrl,
    name: provider.name.trim(),
    providerId: normalizedProviderId,
    signinUrl: expectedSignInUrl,
  }
}

export const fetchAndVerifyAuthProvider = async ({
  baseUrl,
  providerId,
  timeoutMs = 12000,
  fetchImpl = globalThis.fetch,
}) => {
  if (typeof fetchImpl !== 'function') {
    throw new Error('This Node.js runtime does not provide fetch.')
  }

  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)
  const normalizedProviderId = normalizeProviderId(providerId)
  const normalizedTimeout = normalizeTimeoutMs(timeoutMs)
  const url = `${normalizedBaseUrl}/api/auth/providers`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), normalizedTimeout)

  try {
    const response = await fetchImpl(url, {
      headers: { accept: 'application/json' },
      redirect: 'error',
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`Auth providers request failed with HTTP ${response.status}.`)
    }

    let payload
    try {
      payload = await response.json()
    } catch {
      throw new Error('Auth providers endpoint did not return valid JSON.')
    }

    return {
      ...verifyAuthProviderPayload(payload, {
        baseUrl: normalizedBaseUrl,
        providerId: normalizedProviderId,
      }),
      url,
    }
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(
        `Auth providers request timed out after ${normalizedTimeout} milliseconds.`
      )
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

const printHelp = () => {
  console.log(`Usage:
  node scripts/auth-provider-guard.mjs --base-url URL --provider PROVIDER [options]

Required:
  --base-url URL       Canonical deployment base URL
  --provider PROVIDER  Required OAuth provider ID, for example google

Options:
  --timeout-ms MS      Request timeout from 1000 to 60000 (default: 12000)
  --help               Show this help

Environment alternatives:
  BASE_URL, OAUTH_PROVIDER_ID, TIMEOUT_MS`)
}

const parseCliArgs = (args) => {
  const options = {
    baseUrl: process.env.BASE_URL || '',
    providerId: process.env.OAUTH_PROVIDER_ID || '',
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
    else if (arg === '--provider') options.providerId = value
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

    const result = await fetchAndVerifyAuthProvider(options)
    console.log(`Auth provider verified: ${result.providerId} (${result.name})`)
    console.log(`Provider discovery endpoint: ${result.url}`)
    console.log(`Canonical sign-in URL: ${result.signinUrl}`)
    console.log(`Canonical callback URL: ${result.callbackUrl}`)
  } catch (error) {
    console.error(
      `Auth provider guard failed: ${error instanceof Error ? error.message : error}`
    )
    process.exitCode = 1
  }
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  await run()
}
