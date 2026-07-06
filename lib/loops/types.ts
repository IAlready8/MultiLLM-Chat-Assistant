import { z } from 'zod'

export const loopTerminalStateSchema = z.enum([
  'COMPLETE',
  'BLOCKED',
  'MAX_ITERATIONS',
  'BUDGET_EXCEEDED',
  'VERIFICATION_FAILED',
])

export const loopSpecificationSchema = z.object({
  id: z.string().min(1),
  version: z.number().int().positive(),
  trigger: z.literal('manual'),
  goal: z.string().min(1),
  allowedPaths: z.array(z.string().min(1)).min(1),
  verificationCommands: z.array(z.string().min(1)).min(1),
  acceptanceCriteria: z.array(z.string().min(1)).min(1),
  limits: z.object({
    maxIterations: z.number().int().positive(),
    maximumRuntimeMinutes: z.number().positive(),
    maximumCostUsd: z.number().nonnegative(),
    repeatedFailureLimit: z.number().int().positive(),
  }),
})

export const loopWorkerResultSchema = z.object({
  status: z.enum(['READY_FOR_VERIFICATION', 'BLOCKED', 'FAILED']),
  summary: z.string().min(1),
  filesChanged: z.array(z.string()).default([]),
  commandsRun: z.array(z.string()).default([]),
  evidence: z.array(z.string()).default([]),
  remainingRisks: z.array(z.string()).default([]),
  proposedMemoryUpdates: z.array(z.string()).default([]),
  nextAction: z.string().min(1),
  tokenUsage: z.number().int().nonnegative().default(0),
  estimatedCostUsd: z.number().nonnegative().default(0),
  failureSignature: z.string().min(1).optional(),
})

export const loopVerifierResultSchema = z.object({
  verdict: z.enum(['ACCEPT', 'REJECT', 'BLOCKED']),
  failedGate: z.string().min(1).optional(),
  evidence: z.array(z.string()).default([]),
  requiredFix: z.string().min(1).optional(),
})

export type LoopTerminalState = z.infer<typeof loopTerminalStateSchema>
export type LoopSpecification = z.infer<typeof loopSpecificationSchema>
export type LoopWorkerResult = z.infer<typeof loopWorkerResultSchema>
export type LoopVerifierResult = z.infer<typeof loopVerifierResultSchema>

export type LoopEventType =
  | 'RUN_STARTED'
  | 'ITERATION_STARTED'
  | 'WORKER_FINISHED'
  | 'VERIFICATION_FINISHED'
  | 'RUN_FINISHED'

export interface LoopEvent {
  type: LoopEventType
  iteration: number
  occurredAt: string
  payload: Record<string, unknown>
}

export interface LoopRunResult {
  loopId: string
  finalState: LoopTerminalState
  iterations: number
  tokenUsage: number
  estimatedCostUsd: number
  summary: string
  events: LoopEvent[]
  lastWorkerResult?: LoopWorkerResult
  lastVerifierResult?: LoopVerifierResult
}
