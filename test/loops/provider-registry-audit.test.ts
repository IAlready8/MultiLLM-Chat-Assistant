import { describe, expect, it } from 'vitest'
import { auditProviderRegistry } from '@/lib/loops/provider-registry-audit'
import { runLoop } from '@/lib/loops/runner'
import { providerRegistryAuditSpec } from '@/lib/loops/specs/provider-registry-audit'

describe('provider registry audit loop', () => {
  it('loads a bounded declarative specification', () => {
    expect(providerRegistryAuditSpec.id).toBe('provider-registry-audit')
    expect(providerRegistryAuditSpec.limits.maxIterations).toBe(6)
    expect(providerRegistryAuditSpec.limits.repeatedFailureLimit).toBe(2)
    expect(providerRegistryAuditSpec.verificationCommands).toEqual([
      'npm run type-check',
      'npm run lint',
      'npm run test:run',
      'npm run build',
    ])
  })

  it('accepts the current provider registries', () => {
    const result = auditProviderRegistry()

    expect(result.verdict).toBe('ACCEPT')
    expect(result.evidence).toContain(
      'Every provider resolves to an adapter with a matching ID.'
    )
  })

  it('completes through the bounded runner', async () => {
    const result = await runLoop({
      spec: providerRegistryAuditSpec,
      worker: async () => ({
        status: 'READY_FOR_VERIFICATION',
        summary: 'Collected provider registry sources.',
        filesChanged: [],
        commandsRun: [],
        evidence: [],
        remainingRisks: [],
        proposedMemoryUpdates: [],
        nextAction: 'Run the provider registry audit.',
        tokenUsage: 0,
        estimatedCostUsd: 0,
      }),
      verifier: async () => auditProviderRegistry(),
    })

    expect(result.finalState).toBe('COMPLETE')
    expect(result.iterations).toBe(1)
    expect(result.lastVerifierResult?.verdict).toBe('ACCEPT')
  })
})
