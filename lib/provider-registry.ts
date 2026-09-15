import { getProviderMeta } from "@/src/generated/provider-meta"
export { getProviderMeta, isProviderApiKeyRequired, operationalProviderRegistry, providerRegistry, supportedProviderIds } from "@/src/generated/provider-meta"
export type { ProviderMeta } from "@/src/generated/provider-meta"
export const PROVIDER_DISABLED_ERROR_CODE = "PROVIDER_DISABLED"

export const isProviderOperational = (providerId: string) => {
  const provider = getProviderMeta(providerId)
  return Boolean(provider && provider.operational !== false)
}

export const isProviderDisabled = (providerId: string) =>
  getProviderMeta(providerId)?.operational === false

export const getProviderDisabledMessage = (providerId: string) =>
  getProviderMeta(providerId)?.disabledReason ?? 'Provider is currently unavailable.'
