import { defaultRateLimits } from '@/lib/config-schemas'
import { getAllProviderIds, getModelsForProvider } from '@/lib/model-catalog'
import { providerRegistry } from '@/lib/provider-registry'
import {
  getProviderAdapter,
  supportedProviderIds as runtimeProviderIds,
} from '@/lib/providers'
import type { LoopVerifierResult } from '@/lib/loops/types'

type ProviderSourceName = 'metadata' | 'runtime' | 'catalog' | 'rate-limits'

interface ProviderAuditFinding {
  code: string
  message: string
  requiredFix: string
}

const duplicateIds = (ids: string[]): string[] => {
  const seen = new Set<string>()
  const duplicates = new Set<string>()

  for (const id of ids) {
    if (seen.has(id)) {
      duplicates.add(id)
    }
    seen.add(id)
  }

  return [...duplicates].sort()
}

const difference = (left: Set<string>, right: Set<string>): string[] =>
  [...left].filter((value) => !right.has(value)).sort()

export function auditProviderRegistry(): LoopVerifierResult {
  const findings: ProviderAuditFinding[] = []
  const sources: Record<ProviderSourceName, string[]> = {
    metadata: providerRegistry.map((provider) => provider.id),
    runtime: [...runtimeProviderIds],
    catalog: getAllProviderIds(),
    'rate-limits': Object.keys(defaultRateLimits),
  }

  for (const [sourceName, ids] of Object.entries(sources) as Array<
    [ProviderSourceName, string[]]
  >) {
    const duplicates = duplicateIds(ids)
    if (duplicates.length > 0) {
      findings.push({
        code: `${sourceName}-duplicate-provider-ids`,
        message: `${sourceName} contains duplicate provider IDs: ${duplicates.join(', ')}`,
        requiredFix: `Remove duplicate provider IDs from the ${sourceName} source.`,
      })
    }
  }

  const metadataIds = new Set(sources.metadata)
  for (const sourceName of ['runtime', 'catalog', 'rate-limits'] as const) {
    const sourceIds = new Set(sources[sourceName])
    const missing = difference(metadataIds, sourceIds)
    const unexpected = difference(sourceIds, metadataIds)

    if (missing.length > 0 || unexpected.length > 0) {
      findings.push({
        code: `${sourceName}-provider-drift`,
        message: [
          `${sourceName} does not match provider metadata.`,
          missing.length > 0 ? `Missing: ${missing.join(', ')}.` : '',
          unexpected.length > 0 ? `Unexpected: ${unexpected.join(', ')}.` : '',
        ]
          .filter(Boolean)
          .join(' '),
        requiredFix: `Make ${sourceName} provider IDs match lib/provider-registry.ts.`,
      })
    }
  }

  for (const providerId of sources.metadata) {
    const adapter = getProviderAdapter(providerId)
    if (!adapter) {
      findings.push({
        code: 'missing-provider-adapter',
        message: `Provider ${providerId} has metadata but no runtime adapter.`,
        requiredFix: `Register exactly one ${providerId} adapter in lib/providers/registry.ts.`,
      })
    } else if (adapter.id !== providerId) {
      findings.push({
        code: 'provider-adapter-id-mismatch',
        message: `Registry key ${providerId} resolves to adapter ${adapter.id}.`,
        requiredFix: `Make the ${providerId} adapter expose id "${providerId}".`,
      })
    }

    const models = getModelsForProvider(providerId)
    if (models.length === 0) {
      findings.push({
        code: 'missing-provider-models',
        message: `Provider ${providerId} has no models in the catalog.`,
        requiredFix: `Add at least one ${providerId} model to lib/model-catalog.ts.`,
      })
      continue
    }

    const defaultModels = models.filter((model) => model.isDefault)
    if (defaultModels.length !== 1) {
      findings.push({
        code: 'invalid-default-model-count',
        message: `Provider ${providerId} has ${defaultModels.length} default models; expected exactly one.`,
        requiredFix: `Mark exactly one ${providerId} model as the default.`,
      })
    }
  }

  if (findings.length > 0) {
    return {
      verdict: 'REJECT',
      failedGate: findings[0].code,
      evidence: findings.map((finding) => finding.message),
      requiredFix: findings.map((finding) => finding.requiredFix).join(' '),
    }
  }

  return {
    verdict: 'ACCEPT',
    evidence: [
      `${sources.metadata.length} provider IDs match across metadata, runtime adapters, the model catalog, and rate limits.`,
      'Every provider resolves to an adapter with a matching ID.',
      'Every provider has at least one model and exactly one default model.',
    ],
  }
}
