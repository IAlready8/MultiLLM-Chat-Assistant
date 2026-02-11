/**
 * Provider adapter registry.
 *
 * Maps provider IDs to their concrete adapter implementations.
 * Both API routes resolve adapters through this registry.
 */

import type { ProviderAdapter, ProviderId } from './types'
import { openaiAdapter } from './openai'
import { anthropicAdapter } from './anthropic'
import { googleaiAdapter } from './googleai'
import { grokAdapter } from './grok'
import { openrouterAdapter } from './openrouter'

const adapters: Record<ProviderId, ProviderAdapter> = {
  openai: openaiAdapter,
  openrouter: openrouterAdapter,
  anthropic: anthropicAdapter,
  googleai: googleaiAdapter,
  grok: grokAdapter,
}

/**
 * Look up a provider adapter by its string ID.
 * Returns undefined for unrecognised providers.
 */
export function getProviderAdapter(
  providerId: string,
): ProviderAdapter | undefined {
  return adapters[providerId as ProviderId]
}

/** All supported provider IDs. */
export const supportedProviderIds = Object.keys(adapters) as ProviderId[]
