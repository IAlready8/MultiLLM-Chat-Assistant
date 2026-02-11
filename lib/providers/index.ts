/**
 * Barrel export for the unified provider runtime.
 */

export { classifyProviderError } from './errors'
export { getProviderAdapter, supportedProviderIds } from './registry'
export type {
  ProviderAdapter,
  ProviderAdapterConfig,
  ProviderRequest,
  ProviderMessage,
  ChatCompletion,
  ProviderUsage,
  ClassifiedError,
  ProviderId,
} from './types'
