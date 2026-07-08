import { describe, expect, it } from 'vitest'
import { runLoop } from '@/lib/loops/runner'
import {
  loopSpecificationSchema,
  type LoopVerifierResult,
  type LoopWorkerResult,
} from '@/lib/loops/types'

const createSpec = (overrides: Record<string, unknown> = {}) =>
  loopSpecificationSchema.parse({
    id: 'test-loop',
    version: 1,
    trigger: 'manual',
    goal: 'Exercise the bounded loop state machine.',
    allowedPaths: ['test'],
    verificationCommands: ['npm run test:run'],
    acceptanceCriteria: ['The verifier accepts the result.'],
    limits: {
      maxIterations: 3,
      maximumRuntimeMinutes: 1,
      maximumCostUsd: 1,
      repeatedFailureLimit: 2,
    },
    ...overrides,
  })

const readyWorkerResult = (
  overrides: Partial<LoopWorkerResult> = {}
): LoopWorkerResult => ({
  status: 'READY_FOR_VERIFICATION',
  summary: 'Worker produced a candidate result.',
  filesChanged: [],
  commandsRun: [],
  evidence: [],
  remainingRisks: [],
  proposedMemoryUpdates: [],
  nextAction: 'Verify the candidate.',
  tokenUsage: 0,
  estimatedCostUsd: 0,
  ...overrides,
})

const acceptResult: LoopVerifierResult = {
  verdict: 'ACCEPT',
  evidence: ['All gates passed.'],
}

describe('runLoop', () => {
  it('completes when the verifier accepts the first candidate', async () => {
    const result = await runLoop({
      spec: createSpec(),
      worker: async () => readyWorkerResult(),
      verifier: async () => acceptResult,
    })

    expect(result.finalState).toBe('COMPLETE')
    expect(result.iterations).toBe(1)
    expect(result.events.map((event) => event.type)).toContain(
      'VERIFICATION_FINISHED'
    )
  })

  it('retries with verifier feedback and then completes', async () => {
    let verificationCount = 0

    const result = await runLoop({
      spec: createSpec(),
      worker: async () => readyWorkerResult(),
      verifier: async () => {
        verificationCount += 1
        if (verificationCount === 1) {
          return {
            verdict: 'REJECT',
            failedGate: 'test-gate',
            evidence: ['The first candidate failed.'],
            requiredFix: 'Produce a corrected candidate.',
          }
        }
        return acceptResult
      },
    })

    expect(result.finalState).toBe('COMPLETE')
    expect(result.iterations).toBe(2)
  })

  it('stops after the same verifier failure repeats', async () => {
    const result = await runLoop({
      spec: createSpec(),
      worker: async () => readyWorkerResult(),
      verifier: async () => ({
        verdict: 'REJECT',
        failedGate: 'unchanged-failure',
        evidence: ['The same gate failed again.'],
        requiredFix: 'Use new evidence before retrying.',
      }),
    })

    expect(result.finalState).toBe('VERIFICATION_FAILED')
    expect(result.iterations).toBe(2)
  })

  it('continues when verifier evidence changes for the same gate', async () => {
    let verificationCount = 0

    const result = await runLoop({
      spec: createSpec(),
      worker: async () => readyWorkerResult(),
      verifier: async () => {
        verificationCount += 1
        return {
          verdict: 'REJECT',
          failedGate: 'provider-drift',
          evidence: [`Missing provider set ${verificationCount}.`],
          requiredFix: 'Align provider registries.',
        }
      },
    })

    expect(result.finalState).toBe('MAX_ITERATIONS')
    expect(result.iterations).toBe(3)
    expect(verificationCount).toBe(3)
  })

  it('converts thrown worker errors into failed worker results', async () => {
    let workerAttempts = 0

    const result = await runLoop({
      spec: createSpec(),
      worker: async () => {
        workerAttempts += 1
        throw new Error('provider API timed out')
      },
      verifier: async () => acceptResult,
    })

    expect(result.finalState).toBe('VERIFICATION_FAILED')
    expect(result.iterations).toBe(2)
    expect(workerAttempts).toBe(2)
    expect(result.lastWorkerResult).toMatchObject({
      status: 'FAILED',
      summary: 'Worker threw an unexpected error: provider API timed out',
      failureSignature: 'worker-thrown-error:provider API timed out',
    })
  })

  it('stops immediately when the worker is blocked', async () => {
    const result = await runLoop({
      spec: createSpec(),
      worker: async () =>
        readyWorkerResult({
          status: 'BLOCKED',
          summary: 'Required permission is missing.',
        }),
      verifier: async () => acceptResult,
    })

    expect(result.finalState).toBe('BLOCKED')
    expect(result.iterations).toBe(1)
  })

  it('stops when the estimated cost exceeds the configured budget', async () => {
    const result = await runLoop({
      spec: createSpec(),
      worker: async () =>
        readyWorkerResult({
          estimatedCostUsd: 1.01,
        }),
      verifier: async () => acceptResult,
    })

    expect(result.finalState).toBe('BUDGET_EXCEEDED')
    expect(result.iterations).toBe(1)
  })

  it('stops at the maximum iteration count for distinct failures', async () => {
    let verificationCount = 0

    const result = await runLoop({
      spec: createSpec({
        limits: {
          maxIterations: 3,
          maximumRuntimeMinutes: 1,
          maximumCostUsd: 1,
          repeatedFailureLimit: 2,
        },
      }),
      worker: async () => readyWorkerResult(),
      verifier: async () => {
        verificationCount += 1
        return {
          verdict: 'REJECT',
          failedGate: `gate-${verificationCount}`,
          evidence: [`Failure ${verificationCount}`],
          requiredFix: `Fix ${verificationCount}`,
        }
      },
    })

    expect(result.finalState).toBe('MAX_ITERATIONS')
    expect(result.iterations).toBe(3)
  })
})
