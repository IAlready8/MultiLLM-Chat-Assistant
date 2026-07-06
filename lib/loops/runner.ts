import {
  loopVerifierResultSchema,
  loopWorkerResultSchema,
  type LoopEvent,
  type LoopRunResult,
  type LoopSpecification,
  type LoopTerminalState,
  type LoopVerifierResult,
  type LoopWorkerResult,
} from './types'

export interface LoopWorkerInput {
  spec: LoopSpecification
  iteration: number
  previousAttempts: LoopWorkerResult[]
  lastVerifierResult?: LoopVerifierResult
}

export interface LoopVerifierInput {
  spec: LoopSpecification
  iteration: number
  workerResult: LoopWorkerResult
}

export interface RunLoopOptions {
  spec: LoopSpecification
  worker: (input: LoopWorkerInput) => Promise<LoopWorkerResult>
  verifier: (input: LoopVerifierInput) => Promise<LoopVerifierResult>
  eventSink?: (event: LoopEvent) => Promise<void> | void
  now?: () => number
}

const workerFailureSignature = (result: LoopWorkerResult): string =>
  result.failureSignature ?? `worker:${result.summary}`

const verifierFailureSignature = (result: LoopVerifierResult): string =>
  `verifier:${result.failedGate ?? result.requiredFix ?? result.evidence.join('|')}`

export async function runLoop({
  spec,
  worker,
  verifier,
  eventSink,
  now = Date.now,
}: RunLoopOptions): Promise<LoopRunResult> {
  const startedAt = now()
  const runtimeLimitMs = spec.limits.maximumRuntimeMinutes * 60_000
  const events: LoopEvent[] = []
  const previousAttempts: LoopWorkerResult[] = []
  const failureCounts = new Map<string, number>()
  let tokenUsage = 0
  let estimatedCostUsd = 0
  let lastWorkerResult: LoopWorkerResult | undefined
  let lastVerifierResult: LoopVerifierResult | undefined

  const record = async (
    type: LoopEvent['type'],
    iteration: number,
    payload: Record<string, unknown>
  ): Promise<void> => {
    const event: LoopEvent = {
      type,
      iteration,
      occurredAt: new Date(now()).toISOString(),
      payload,
    }
    events.push(event)
    await eventSink?.(event)
  }

  const finish = async (
    finalState: LoopTerminalState,
    iterations: number,
    summary: string
  ): Promise<LoopRunResult> => {
    await record('RUN_FINISHED', iterations, {
      finalState,
      summary,
      tokenUsage,
      estimatedCostUsd,
    })

    return {
      loopId: spec.id,
      finalState,
      iterations,
      tokenUsage,
      estimatedCostUsd,
      summary,
      events,
      lastWorkerResult,
      lastVerifierResult,
    }
  }

  const incrementFailure = (signature: string): number => {
    const count = (failureCounts.get(signature) ?? 0) + 1
    failureCounts.set(signature, count)
    return count
  }

  await record('RUN_STARTED', 0, {
    version: spec.version,
    goal: spec.goal,
    maxIterations: spec.limits.maxIterations,
  })

  for (let iteration = 1; iteration <= spec.limits.maxIterations; iteration += 1) {
    if (now() - startedAt >= runtimeLimitMs) {
      return finish(
        'BUDGET_EXCEEDED',
        iteration - 1,
        'Maximum runtime was reached before the next iteration.'
      )
    }

    await record('ITERATION_STARTED', iteration, {
      previousAttempts: previousAttempts.length,
    })

    lastWorkerResult = loopWorkerResultSchema.parse(
      await worker({
        spec,
        iteration,
        previousAttempts: [...previousAttempts],
        lastVerifierResult,
      })
    )

    tokenUsage += lastWorkerResult.tokenUsage
    estimatedCostUsd += lastWorkerResult.estimatedCostUsd

    await record('WORKER_FINISHED', iteration, {
      status: lastWorkerResult.status,
      summary: lastWorkerResult.summary,
      tokenUsage: lastWorkerResult.tokenUsage,
      estimatedCostUsd: lastWorkerResult.estimatedCostUsd,
    })

    if (estimatedCostUsd > spec.limits.maximumCostUsd) {
      return finish(
        'BUDGET_EXCEEDED',
        iteration,
        'Maximum estimated cost was exceeded.'
      )
    }

    if (now() - startedAt >= runtimeLimitMs) {
      return finish(
        'BUDGET_EXCEEDED',
        iteration,
        'Maximum runtime was reached after the worker completed.'
      )
    }

    if (lastWorkerResult.status === 'BLOCKED') {
      return finish('BLOCKED', iteration, lastWorkerResult.summary)
    }

    if (lastWorkerResult.status === 'FAILED') {
      const repeatedCount = incrementFailure(
        workerFailureSignature(lastWorkerResult)
      )
      previousAttempts.push(lastWorkerResult)

      if (repeatedCount >= spec.limits.repeatedFailureLimit) {
        return finish(
          'VERIFICATION_FAILED',
          iteration,
          'The worker repeated the same failure without new evidence.'
        )
      }

      continue
    }

    lastVerifierResult = loopVerifierResultSchema.parse(
      await verifier({
        spec,
        iteration,
        workerResult: lastWorkerResult,
      })
    )

    await record('VERIFICATION_FINISHED', iteration, {
      verdict: lastVerifierResult.verdict,
      failedGate: lastVerifierResult.failedGate,
      evidence: lastVerifierResult.evidence,
    })

    if (lastVerifierResult.verdict === 'ACCEPT') {
      return finish(
        'COMPLETE',
        iteration,
        lastWorkerResult.summary
      )
    }

    if (lastVerifierResult.verdict === 'BLOCKED') {
      return finish(
        'BLOCKED',
        iteration,
        lastVerifierResult.requiredFix ?? 'Verification is blocked.'
      )
    }

    const repeatedCount = incrementFailure(
      verifierFailureSignature(lastVerifierResult)
    )
    previousAttempts.push(lastWorkerResult)

    if (repeatedCount >= spec.limits.repeatedFailureLimit) {
      return finish(
        'VERIFICATION_FAILED',
        iteration,
        'The verifier reported the same failure repeatedly.'
      )
    }
  }

  return finish(
    'MAX_ITERATIONS',
    spec.limits.maxIterations,
    'The loop reached its maximum iteration count.'
  )
}
