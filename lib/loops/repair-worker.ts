import type {
  LoopVerifierResult,
  LoopWorkerResult,
} from '@/lib/loops/types'
import type { LoopWorkerInput } from '@/lib/loops/runner'
import {
  assertRepositoryPathAllowed,
  LoopPolicyViolation,
} from '@/lib/loops/path-policy'

export interface RepairCommandResult {
  exitCode: number
  stdout: string
  stderr: string
}

export interface RepairWorkspaceAdapter {
  readFile(path: string): Promise<string>
  writeFile(path: string, content: string): Promise<void>
  deleteFile(path: string): Promise<void>
  runCommand(command: string): Promise<RepairCommandResult>
}

export interface RestrictedRepairTools {
  readFile(path: string): Promise<string>
  writeFile(path: string, content: string): Promise<void>
  deleteFile(path: string): Promise<void>
  runVerification(command: string): Promise<RepairCommandResult>
}

export interface RepairAgentInput {
  spec: LoopWorkerInput['spec']
  iteration: number
  previousAttempts: LoopWorkerResult[]
  lastVerifierResult?: LoopVerifierResult
  tools: RestrictedRepairTools
}

export type RepairAgent = (
  input: RepairAgentInput
) => Promise<LoopWorkerResult>

export interface PathRestrictedRepairWorkerOptions {
  workspace: RepairWorkspaceAdapter
  agent: RepairAgent
  readOnlyPaths?: string[]
  maxToolCalls?: number
  maxChangedFiles?: number
  maxBytesWritten?: number
  allowDeletes?: boolean
}

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

export function createPathRestrictedRepairWorker({
  workspace,
  agent,
  readOnlyPaths = [],
  maxToolCalls = 30,
  maxChangedFiles = 12,
  maxBytesWritten = 250_000,
  allowDeletes = false,
}: PathRestrictedRepairWorkerOptions) {
  return async (input: LoopWorkerInput): Promise<LoopWorkerResult> => {
    let toolCalls = 0
    let bytesWritten = 0
    const changedFiles = new Set<string>()
    const commandsRun: string[] = []

    const countToolCall = (): void => {
      toolCalls += 1
      if (toolCalls > maxToolCalls) {
        throw new LoopPolicyViolation(
          `Worker exceeded the ${maxToolCalls} tool-call limit.`
        )
      }
    }

    const trackChangedFile = (path: string): void => {
      changedFiles.add(path)
      if (changedFiles.size > maxChangedFiles) {
        throw new LoopPolicyViolation(
          `Worker exceeded the ${maxChangedFiles} changed-file limit.`
        )
      }
    }

    const readablePaths = [...input.spec.allowedPaths, ...readOnlyPaths]

    const tools: RestrictedRepairTools = {
      async readFile(path) {
        countToolCall()
        const normalizedPath = assertRepositoryPathAllowed(
          path,
          readablePaths,
          'read'
        )
        return workspace.readFile(normalizedPath)
      },

      async writeFile(path, content) {
        countToolCall()
        const normalizedPath = assertRepositoryPathAllowed(
          path,
          input.spec.allowedPaths,
          'write'
        )
        const nextBytes = Buffer.byteLength(content, 'utf8')
        if (bytesWritten + nextBytes > maxBytesWritten) {
          throw new LoopPolicyViolation(
            `Worker exceeded the ${maxBytesWritten}-byte write limit.`
          )
        }
        trackChangedFile(normalizedPath)
        bytesWritten += nextBytes
        await workspace.writeFile(normalizedPath, content)
      },

      async deleteFile(path) {
        countToolCall()
        if (!allowDeletes) {
          throw new LoopPolicyViolation(
            'File deletion is disabled for this repair worker.'
          )
        }
        const normalizedPath = assertRepositoryPathAllowed(
          path,
          input.spec.allowedPaths,
          'delete'
        )
        trackChangedFile(normalizedPath)
        await workspace.deleteFile(normalizedPath)
      },

      async runVerification(command) {
        countToolCall()
        if (!input.spec.verificationCommands.includes(command)) {
          throw new LoopPolicyViolation(
            `Command is outside the verification allowlist: ${command}`
          )
        }
        commandsRun.push(command)
        return workspace.runCommand(command)
      },
    }

    try {
      const result = await agent({
        spec: input.spec,
        iteration: input.iteration,
        previousAttempts: input.previousAttempts,
        lastVerifierResult: input.lastVerifierResult,
        tools,
      })

      return {
        ...result,
        filesChanged: [...changedFiles].sort(),
        commandsRun,
      }
    } catch (error) {
      const message = getErrorMessage(error)
      const policyViolation = error instanceof LoopPolicyViolation

      return {
        status: policyViolation ? 'BLOCKED' : 'FAILED',
        summary: policyViolation
          ? `Repair worker blocked by policy: ${message}`
          : `Repair worker failed: ${message}`,
        filesChanged: [...changedFiles].sort(),
        commandsRun,
        evidence: [],
        remainingRisks: [message],
        proposedMemoryUpdates: [],
        nextAction: policyViolation
          ? 'Review the loop scope or worker request before retrying.'
          : 'Retry only with new evidence from the failure.',
        tokenUsage: 0,
        estimatedCostUsd: 0,
        failureSignature: policyViolation
          ? `policy:${message}`
          : `worker-error:${message}`,
      }
    }
  }
}
