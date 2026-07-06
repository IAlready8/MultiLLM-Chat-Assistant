import { describe, expect, it, vi } from 'vitest'
import { createPathRestrictedRepairWorker } from '@/lib/loops/repair-worker'
import { loopSpecificationSchema } from '@/lib/loops/types'

const spec = loopSpecificationSchema.parse({
  id: 'repair-test',
  version: 1,
  trigger: 'manual',
  goal: 'Repair a bounded provider file.',
  allowedPaths: ['lib/providers/**', 'test/**'],
  verificationCommands: ['npm run type-check', 'npm run test:run'],
  acceptanceCriteria: ['The bounded repair passes verification.'],
  limits: {
    maxIterations: 2,
    maximumRuntimeMinutes: 1,
    maximumCostUsd: 1,
    repeatedFailureLimit: 2,
  },
})

const input = {
  spec,
  iteration: 1,
  previousAttempts: [],
}

const createWorkspace = () => ({
  readFile: vi.fn().mockResolvedValue('existing content'),
  writeFile: vi.fn().mockResolvedValue(undefined),
  deleteFile: vi.fn().mockResolvedValue(undefined),
  runCommand: vi.fn().mockResolvedValue({
    exitCode: 0,
    stdout: 'passed',
    stderr: '',
  }),
})

const successResult = {
  status: 'READY_FOR_VERIFICATION' as const,
  summary: 'Applied the bounded repair.',
  filesChanged: [],
  commandsRun: [],
  evidence: ['Verification passed.'],
  remainingRisks: [],
  proposedMemoryUpdates: [],
  nextAction: 'Run the independent verifier.',
  tokenUsage: 10,
  estimatedCostUsd: 0.01,
}

describe('path restricted repair worker', () => {
  it('allows scoped writes and allowlisted verification commands', async () => {
    const workspace = createWorkspace()
    const worker = createPathRestrictedRepairWorker({
      workspace,
      agent: async ({ tools }) => {
        await tools.readFile('lib/providers/openai.ts')
        await tools.writeFile('lib/providers/openai.ts', 'updated content')
        await tools.runVerification('npm run type-check')
        return successResult
      },
    })

    const result = await worker(input)

    expect(result.status).toBe('READY_FOR_VERIFICATION')
    expect(result.filesChanged).toEqual(['lib/providers/openai.ts'])
    expect(result.commandsRun).toEqual(['npm run type-check'])
    expect(workspace.writeFile).toHaveBeenCalledWith(
      'lib/providers/openai.ts',
      'updated content'
    )
  })

  it('blocks writes outside the configured scope', async () => {
    const workspace = createWorkspace()
    const worker = createPathRestrictedRepairWorker({
      workspace,
      agent: async ({ tools }) => {
        await tools.writeFile('app/layout.tsx', 'forbidden')
        return successResult
      },
    })

    const result = await worker(input)

    expect(result.status).toBe('BLOCKED')
    expect(result.summary).toContain('outside the configured repository scope')
    expect(workspace.writeFile).not.toHaveBeenCalled()
  })

  it('blocks path traversal before the workspace adapter is called', async () => {
    const workspace = createWorkspace()
    const worker = createPathRestrictedRepairWorker({
      workspace,
      agent: async ({ tools }) => {
        await tools.readFile('../config/private.txt')
        return successResult
      },
    })

    const result = await worker(input)

    expect(result.status).toBe('BLOCKED')
    expect(result.summary).toContain('Path traversal is forbidden')
    expect(workspace.readFile).not.toHaveBeenCalled()
  })

  it('blocks commands outside the exact verification allowlist', async () => {
    const workspace = createWorkspace()
    const worker = createPathRestrictedRepairWorker({
      workspace,
      agent: async ({ tools }) => {
        await tools.runVerification('npm run build')
        return successResult
      },
    })

    const result = await worker(input)

    expect(result.status).toBe('BLOCKED')
    expect(result.summary).toContain('outside the verification allowlist')
    expect(workspace.runCommand).not.toHaveBeenCalled()
  })

  it('disables deletion unless explicitly enabled', async () => {
    const workspace = createWorkspace()
    const worker = createPathRestrictedRepairWorker({
      workspace,
      agent: async ({ tools }) => {
        await tools.deleteFile('lib/providers/openai.ts')
        return successResult
      },
    })

    const result = await worker(input)

    expect(result.status).toBe('BLOCKED')
    expect(result.summary).toContain('File deletion is disabled')
    expect(workspace.deleteFile).not.toHaveBeenCalled()
  })

  it('enforces the cumulative write byte limit', async () => {
    const workspace = createWorkspace()
    const worker = createPathRestrictedRepairWorker({
      workspace,
      maxBytesWritten: 5,
      agent: async ({ tools }) => {
        await tools.writeFile('lib/providers/openai.ts', '123456')
        return successResult
      },
    })

    const result = await worker(input)

    expect(result.status).toBe('BLOCKED')
    expect(result.summary).toContain('byte write limit')
    expect(workspace.writeFile).not.toHaveBeenCalled()
  })
})
