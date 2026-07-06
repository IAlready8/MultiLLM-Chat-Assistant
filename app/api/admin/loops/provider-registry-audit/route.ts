import { NextResponse } from 'next/server'
import { getAuthenticatedAdmin } from '@/lib/api-auth'
import { withApiMetrics } from '@/lib/api-metrics-wrapper'
import { auditProviderRegistry } from '@/lib/loops/provider-registry-audit'
import { runLoop } from '@/lib/loops/runner'
import { providerRegistryAuditSpec } from '@/lib/loops/specs/provider-registry-audit'

export const POST = withApiMetrics(async () => {
  const authCheck = await getAuthenticatedAdmin()
  if (authCheck instanceof NextResponse) {
    return authCheck
  }

  const result = await runLoop({
    spec: providerRegistryAuditSpec,
    worker: async () => ({
      status: 'READY_FOR_VERIFICATION',
      summary: 'Collected the current provider registry sources for verification.',
      filesChanged: [],
      commandsRun: [],
      evidence: [],
      remainingRisks: [],
      proposedMemoryUpdates: [],
      nextAction: 'Run the deterministic provider registry verifier.',
      tokenUsage: 0,
      estimatedCostUsd: 0,
    }),
    verifier: async () => auditProviderRegistry(),
  })

  return NextResponse.json(result, {
    status: result.finalState === 'COMPLETE' ? 200 : 409,
    headers: { 'Cache-Control': 'no-store' },
  })
})
