import { describe, it, expect } from 'vitest'
import { supportedProviderIds as tsIds } from '@/lib/provider-registry'
import { supportedProviderIds as runtimeIds } from '@/lib/providers/registry'
import { getAllProviderIds } from '@/lib/model-catalog'
import { allProviderIds } from '@/src/generated/provider-meta'
import { getProviderAdapter } from '@/lib/providers/registry'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

// This test enforces the single source of truth contract.
// All lists must derive from the matrix (via generated artifacts).

const MATRIX_PATH = path.resolve(__dirname, '../config/capability-matrix.yaml')

function extractIdsFromMatrix(): string[] {
  const content = fs.readFileSync(MATRIX_PATH, 'utf8')
  // Very naive extraction for the test (sufficient for current structure)
  const matches = [...content.matchAll(/^\s*-\s*id:\s*([a-z0-9_-]+)/gm)]
  return matches.map(m => m[1])
}

describe('Provider matrix single source of truth', () => {
  it('Python capability loader exposes the same provider IDs as YAML', () => {
    const output = execFileSync(
      'python3',
      [
        '-c',
        [
          'import json',
          'from src.core.capability_loader import get_all_providers',
          'print(json.dumps(get_all_providers()))',
        ].join('; '),
      ],
      {
        cwd: path.resolve(__dirname, '..'),
        encoding: 'utf8',
      },
    )

    expect(JSON.parse(output).sort()).toEqual(extractIdsFromMatrix().sort())
  })

  it('TS provider-registry and runtime registry derive same IDs', () => {
    expect(tsIds).toEqual(runtimeIds)
  })

  it('model-catalog retains all known IDs, including disabled provider history', () => {
    const catalogIds = getAllProviderIds().sort()
    const regIds = [...allProviderIds].sort()
    expect(catalogIds).toEqual(regIds)
  })

  it('all known providers appear in the canonical matrix YAML', () => {
    const matrixIds = extractIdsFromMatrix().sort()
    const currentIds = [...allProviderIds].sort()
    // Matrix is source; current should be subset or exact match
    expect(matrixIds).toEqual(currentIds)
  })

  it('has an adapter for every operational provider and disables DeepSeek', () => {
    for (const provider of tsIds) expect(getProviderAdapter(provider)?.id).toBe(provider)
    expect(tsIds).not.toContain('deepseek')
    expect(getProviderAdapter('deepseek')).toBeUndefined()
  })

  it('no manual COST_PER_1K or provider list duplication remains in orchestrate', () => {
    // This is a smoke against regression
    const orchestrate = fs.readFileSync(
      path.resolve(__dirname, '../app/api/llm/orchestrate/route.ts'),
      'utf8'
    )
    expect(orchestrate).not.toMatch(/COST_PER_1K_TOKENS/)
    // The old flat map is gone; now uses generated
  })

  it('generator and Python loader do not keep mirrored provider tables', () => {
    const generator = fs.readFileSync(
      path.resolve(__dirname, '../scripts/generate-providers.mjs'),
      'utf8',
    )
    const loader = fs.readFileSync(
      path.resolve(__dirname, '../src/core/capability_loader.py'),
      'utf8',
    )
    const schemas = fs.readFileSync(
      path.resolve(__dirname, '../src/core/schemas.py'),
      'utf8',
    )
    const securityUtils = fs.readFileSync(
      path.resolve(__dirname, '../src/core/security_utils.py'),
      'utf8',
    )

    expect(generator).toMatch(/readFileSync\(MATRIX_PATH/)
    expect(generator).toMatch(/parseProviderMatrix/)
    expect(generator).not.toMatch(/providersData\s*=/)
    expect(loader).not.toMatch(/_CAPABILITY_MATRIX/)
    expect(schemas).not.toMatch(/Literal\["openai", "anthropic", "googleai"\]/)
    expect(securityUtils).not.toMatch(/allowed_providers/)
  })
})
